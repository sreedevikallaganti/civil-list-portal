'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2, X, AlertCircle, Info, Loader2, Undo2,
  Calendar, Clock, MapPin,
} from 'lucide-react';

/* ---------------- types ---------------- */

type ToastType = 'success' | 'error' | 'info' | 'loading';

interface ToastAction {
  label: string;
  icon?: 'undo';
  onClick: () => void;
}

interface ToastMeta {
  officerName?: string;
  officerType?: string;   // IAS | IPS | Other
  date?: string;          // YYYY-MM-DD
  time?: string;          // HH:MM
  duration?: string;      // minutes
  location?: string;
  priority?: string;      // Low | Medium | High
}

interface ToastOptions {
  action?: ToastAction;
  meta?: ToastMeta;
  duration?: number;      // ms — 0 = sticky (never auto-dismiss)
}

interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
}

interface RichToastOptions {
  type?: ToastType;
  message: string;
  title?: string;
  meta?: ToastMeta;
  action?: ToastAction;
  duration?: number;
}

/* ---------------- formatting (matches your panel) ---------------- */

const to12Hour = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

const prettyDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dateStr === today) return 'Today';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
};

const formatDuration = (m: number) => {
  if (!m || m < 60) return `${m || 30} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h} hr` : `${h}h ${mm}m`;
};

const GRADIENTS: Record<string, string> = {
  IAS: 'from-blue-500 to-indigo-600',
  IPS: 'from-indigo-500 to-violet-600',
  Other: 'from-slate-500 to-slate-700',
};

const PRIORITY_DOTS: Record<string, string> = {
  Low: 'bg-emerald-500',
  Medium: 'bg-amber-500',
  High: 'bg-rose-500',
};

/* ---------------- public API ---------------- */

const TOAST_EVENT = 'app:toast';
const DISMISS_EVENT = 'app:toast-dismiss';

let toastSeq = 0;

const emit = (item: Omit<ToastItem, 'id'>) =>
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { ...item, id: ++toastSeq + Date.now() } })
  );

export const dismissToast = (id: number) =>
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: { id } }));

interface ShowToastFn {
  // classic form — your existing calls keep working
  (message: string, title?: string, type?: 'success' | 'error', options?: ToastOptions): void;
  // rich meeting-card toast
  rich: (opts: RichToastOptions) => void;
  // spinner → success/error, tied to any Promise
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) => Promise<T>;
}

export const showToast: ShowToastFn = (message, title, type = 'success', options = {}) => {
  emit({
    message,
    title,
    type,
    action: options.action,
    meta: options.meta,
    duration: options.duration ?? 4500,
  });
};

showToast.rich = ({ type = 'success', message, title, meta, action, duration = 6500 }) => {
  emit({ type, message, title, meta, action, duration });
};

showToast.promise = async (promise, { loading, success, error }) => {
  // sticky loading toast (no auto-dismiss)
  const id = ++toastSeq + Date.now();
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { id, type: 'loading', message: loading, duration: 0 } })
  );
  try {
    const data = await promise;
    dismissToast(id);
    showToast(success);
    return data;
  } catch (err) {
    dismissToast(id);
    showToast(error, undefined, 'error');
    throw err;
  }
};

/* ================================================================
   Component
================================================================ */

const ICONS: Record<ToastType, { icon: any; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-600' },
  error: { icon: AlertCircle, cls: 'bg-rose-50 text-rose-600' },
  info: { icon: Info, cls: 'bg-sky-50 text-sky-600' },
  loading: { icon: Loader2, cls: 'bg-indigo-50 text-indigo-600' },
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pausedId, setPausedId] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; dx: number } | null>(null);
  const dragStart = useRef<{ id: number; startX: number } | null>(null);
  const timers = useRef<Map<number, {
    timer: ReturnType<typeof setTimeout>; remaining: number; startedAt: number;
  }>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback((id: number, duration: number) => {
    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, { timer, remaining: duration, startedAt: Date.now() });
  }, [dismiss]);

  // clean up timers for toasts that were evicted/removed
  useEffect(() => {
    const ids = new Set(toasts.map((t) => t.id));
    timers.current.forEach((entry, id) => {
      if (!ids.has(id)) {
        clearTimeout(entry.timer);
        timers.current.delete(id);
      }
    });
  }, [toasts]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const item = (e as CustomEvent).detail as ToastItem;
      if (item.duration > 0) arm(item.id, item.duration);
      setToasts((prev) => [...prev, item].slice(-4)); // max 4 stacked
    };
    const onDismiss = (e: Event) => dismiss((e as CustomEvent).detail.id);
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(DISMISS_EVENT, onDismiss);
    };
  }, [arm, dismiss]);

  useEffect(() => () => timers.current.forEach(({ timer }) => clearTimeout(timer)), []);

  /* pause/resume on hover — both the JS timer and the CSS bar */
  const pause = (id: number) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
    setPausedId(id);
  };

  const resume = (id: number) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => dismiss(id), entry.remaining);
    setPausedId((p) => (p === id ? null : p));
  };

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`@keyframes toastProgress { from { width: 100%; } to { width: 0%; } }`}</style>

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map((t) => {
          const { icon: Icon, cls } = ICONS[t.type] ?? ICONS.success;
          const dragging = drag?.id === t.id;
          const dx = dragging ? drag!.dx : 0;

          return (
            <div
              key={t.id}
              onMouseEnter={() => t.duration > 0 && pause(t.id)}
              onMouseLeave={() => t.duration > 0 && resume(t.id)}
              onPointerDown={(e) => {
                dragStart.current = { id: t.id, startX: e.clientX };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragStart.current;
                if (d?.id !== t.id) return;
                setDrag({ id: t.id, dx: e.clientX - d.startX });
              }}
              onPointerUp={(e) => {
                const d = dragStart.current;
                if (d?.id === t.id && Math.abs(e.clientX - d.startX) > 90) dismiss(t.id);
                dragStart.current = null;
                setDrag(null);
              }}
              onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
              style={{
                transform: `translateX(${dx}px)`,
                opacity: dragging ? Math.max(0.4, 1 - Math.abs(dx) / 220) : 1,
                transition: dragging ? 'none' : 'transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 300ms',
                cursor: dragging ? 'grabbing' : 'grab',
              }}
              className="pointer-events-auto select-none overflow-hidden relative
                         animate-in fade-in slide-in-from-bottom-4 duration-300
                         rounded-2xl bg-white ring-1 ring-slate-200
                         shadow-xl shadow-slate-900/10 p-4"
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon className={`w-5 h-5 ${t.type === 'loading' ? 'animate-spin' : ''}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{t.message}</p>
                  {t.title && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">“{t.title}”</p>
                  )}

                  {/* ---- rich meeting card ---- */}
                  {t.meta && (
                    <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 p-2.5">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${GRADIENTS[t.meta.officerType] || GRADIENTS.Other} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                        {(t.meta.officerName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {t.meta.officerName || 'Meeting'}
                          </p>
                          {t.meta.officerType && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold ring-1 ring-slate-200 bg-white text-slate-600 shrink-0">
                              {t.meta.officerType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 text-[10px] text-slate-500">
                          {t.meta.date && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{prettyDate(t.meta.date)}
                            </span>
                          )}
                          {t.meta.time && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {to12Hour(t.meta.time)}
                              {t.meta.duration ? ` · ${formatDuration(Number(t.meta.duration))}` : ''}
                            </span>
                          )}
                          {t.meta.location && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />{t.meta.location}
                            </span>
                          )}
                        </div>
                        {t.meta.priority && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOTS[t.meta.priority] || 'bg-slate-400'}`} />
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                              {t.meta.priority} priority
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ---- action button (Undo etc.) ---- */}
                  {t.action && (
                    <button
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 ring-1 ring-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all"
                    >
                      {t.action.icon === 'undo' && <Undo2 className="w-3.5 h-3.5" />}
                      {t.action.label}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => dismiss(t.id)}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ---- countdown bar ---- */}
              {t.duration > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
                  <div
                    className="h-full"
                    style={{
                      background: t.type === 'error'
                        ? 'linear-gradient(90deg, #fb7185, #ef4444)'
                        : 'linear-gradient(90deg, #34d399, #14b8a6)',
                      animation: `toastProgress ${t.duration}ms linear forwards`,
                      animationPlayState: pausedId === t.id ? 'paused' : 'running',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}