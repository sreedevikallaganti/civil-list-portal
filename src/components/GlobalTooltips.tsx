'use client';

/* GlobalTooltips — one styled tooltip for the whole app (mounted once in app/layout.tsx).

   Shows for any element under the pointer / keyboard focus that has:
     • data-tooltip="…"   explicit tooltip text
     • title="…"          the native title is taken over (so the plain browser box never appears)
     • aria-label="…"     only on icon-only buttons / links (no visible text), e.g. ✏️ 🗑 ✕
   Opt out with data-no-tooltip. Elements inside <Tooltip> (components/Tooltip) are left to it.

   Mouse + keyboard only — on touch screens tooltips just get in the way. Line breaks in the
   text ("\n") are kept. Fixed-positioned in a portal, so scroll areas never clip it. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PREF_KEYS, readPref } from '@/lib/preferences';

const SHOW_DELAY = 350;
const GAP = 8;
const MARGIN = 8;
const TIP_ATTR = 'data-tip-title'; // where a taken-over native title is kept

type Tip = { el: HTMLElement; text: string };

const SELECTOR = `[data-tooltip], [title], [${TIP_ATTR}], button[aria-label], a[aria-label], [role="button"][aria-label]`;

/** The tooltip text for an element, or '' when it shouldn't get one. */
function textFor(el: HTMLElement): string {
  if (el.closest('[data-no-tooltip], [data-tooltip-owner]')) return '';
  const explicit = el.getAttribute('data-tooltip');
  if (explicit) return explicit;

  // take over the native title (keep it on another attribute so the browser box never shows)
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    if (title.trim()) el.setAttribute(TIP_ATTR, title);
    else el.removeAttribute(TIP_ATTR);
  }
  const kept = el.getAttribute(TIP_ATTR);
  if (kept) return kept;

  // icon-only controls: their accessible name is the tooltip
  const label = el.getAttribute('aria-label');
  if (label && !(el.textContent || '').trim()) return label;
  return '';
}

function findTarget(start: EventTarget | null): Tip | null {
  let node = start instanceof Element ? start : null;
  while (node) {
    const el = node.closest(SELECTOR) as HTMLElement | null;
    if (!el) return null;
    const text = textFor(el);
    if (text) return { el, text };
    node = el.parentElement; // e.g. aria-label button with visible text → try an outer element
  }
  return null;
}

export default function GlobalTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      current.current = null;
      setTip(null);
      setPos(null);
    };
    const schedule = (t: Tip) => {
      if (current.current === t.el) return;
      if (timer.current) clearTimeout(timer.current);
      current.current = t.el;
      setTip(null);
      setPos(null);
      timer.current = setTimeout(() => {
        if (current.current === t.el && t.el.isConnected) setTip({ el: t.el, text: textFor(t.el) || t.text });
      }, SHOW_DELAY);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (readPref(PREF_KEYS.tooltips) === 'off') return; // turned off in Settings → Preferences
      const t = findTarget(e.target);
      if (t) schedule(t);
      else if (current.current) clear();
    };
    const onOut = (e: PointerEvent) => {
      const el = current.current;
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) clear();
    };
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.matches?.(':focus-visible')) return; // keyboard focus only, not clicks
      const t = findTarget(target);
      if (t) schedule(t);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clear(); };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', clear, true);
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', clear, true);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, []);

  // place above the element (below when there's no room), kept inside the window
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const a = tip.el.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const below = a.top - GAP - b.height < MARGIN;
    setPos({
      top: below ? a.bottom + GAP : a.top - GAP - b.height,
      left: Math.min(Math.max(a.left + a.width / 2 - b.width / 2, MARGIN), window.innerWidth - b.width - MARGIN),
    });
  }, [tip]);

  if (!tip || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
      className={`pointer-events-none fixed z-[200] max-w-xs whitespace-pre-line rounded-xl bg-slate-900/95 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-xl shadow-slate-900/20 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-150 ${
        pos ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
