'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormEvent, KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle, CheckCircle2, Clock, Eye, EyeOff,
  Loader2, Lock, Mail, ShieldCheck,
} from 'lucide-react';
import pb from '@/lib/pocketbase';

/* ─────────────────────────── types ─────────────────────────── */

type NoticeType = 'error' | 'success' | 'info';
type Notice = { type: NoticeType; message: string } | null;
type FieldErrors = Partial<Record<'email' | 'password', string>>;

interface LoginFormProps {
  /** Validates credentials. Throw an error to count a failed attempt. */
  onLogin?: (credentials: { email: string; password: string }) => Promise<void>;
  /** Where the user is sent after a successful sign-in. */
  redirectTo?: string;
}

/* ───────────────────────── constants ───────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEY = 'civillist_email';
const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 45;

const NOTICE_STYLES: Record<NoticeType, string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

const NOTICE_ICONS: Record<NoticeType, LucideIcon> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Mail,
};

/** Demo stand-in for an API call — replace where marked 👈 */
const simulateApi = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ────────────────────────── component ──────────────────────── */

export default function LoginForm({ onLogin, redirectTo = '/' }: LoginFormProps) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const [attempts, setAttempts] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);

  /* ── restore remembered email ── */
  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  /* ── lockout countdown ── */
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);

  /* unlock once the countdown finishes */
  useEffect(() => {
    if (lockLeft === 0 && attempts >= MAX_ATTEMPTS) {
      setAttempts(0);
      setNotice({ type: 'info', message: 'You can try signing in again.' });
    }
  }, [lockLeft, attempts]);

  /* ── utilities ── */
  const clearFieldError = (field: 'email' | 'password') =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  /** Re-triggers the CSS shake animation on an element. */
  const shake = (el: HTMLElement | null) => {
    if (!el) return;
    el.classList.remove('animate-shake');
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add('animate-shake');
  };

  const detectCapsLock = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'));
    }
  };

  const handleForgot = () => {
    setNotice({ type: 'info', message: 'Password resets are handled by your department IT administrator.' });
  };

  /* ── submit ── */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || lockLeft > 0) return;

    const next: FieldErrors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 6) next.password = 'Password must be at least 6 characters.';
    setErrors(next);
    if (next.email || next.password) {
      shake(formRef.current);
      return;
    }

    if (remember) localStorage.setItem(EMAIL_KEY, email.trim());
    else localStorage.removeItem(EMAIL_KEY);

    setIsSubmitting(true);
    setNotice(null);
    try {
      if (onLogin) await onLogin({ email: email.trim(), password });
      else await pb.collection('users').authWithPassword(email.trim(), password);

      setSucceeded(true);
      setTimeout(() => router.push(redirectTo), 1600);
    } catch {
      const nextAttempt = attempts + 1;
      setAttempts(nextAttempt);
      shake(formRef.current);
      if (nextAttempt >= MAX_ATTEMPTS) {
        setLockLeft(LOCK_SECONDS);
        setNotice({ type: 'error', message: 'Too many failed attempts — sign-in temporarily locked.' });
      } else {
        const left = MAX_ATTEMPTS - nextAttempt;
        setNotice({
          type: 'error',
          message: `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const NoticeIcon = notice ? NOTICE_ICONS[notice.type] : null;

  /* ── success screen ── */
  if (succeeded) {
    return (
      <div className="animate-pop-in flex flex-col items-center rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-6 py-12 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="mt-6 text-xl font-bold text-gray-900">Signed in successfully</h2>
        <p className="mt-1.5 text-sm text-gray-500">Redirecting to your dashboard…</p>
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div>

      {/* Notices */}
      {notice && NoticeIcon && (
        <div
          role="status"
          aria-live="polite"
          className={`animate-fade-up mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${NOTICE_STYLES[notice.type]}`}
        >
          <NoticeIcon className="mt-px h-4 w-4 shrink-0" />
          <p>{notice.message}</p>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
            Email address
          </label>
          <div className={`relative rounded-xl border transition-all duration-150 ${
            errors.email
              ? 'border-red-300 ring-4 ring-red-500/10'
              : 'border-gray-200 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10'
          }`}>
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="name@office.gov"
              value={email}
              disabled={isSubmitting || lockLeft > 0}
              onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
              className="w-full bg-transparent py-3 pl-11 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60"
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
            <button
              type="button"
              onClick={handleForgot}
              className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className={`relative rounded-xl border transition-all duration-150 ${
            errors.password
              ? 'border-red-300 ring-4 ring-red-500/10'
              : 'border-gray-200 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10'
          }`}>
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              disabled={isSubmitting || lockLeft > 0}
              onKeyDown={detectCapsLock}
              onKeyUp={detectCapsLock}
              onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
              className="w-full bg-transparent py-3 pl-11 pr-12 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {capsOn && !errors.password && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
            </p>
          )}
          {errors.password && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.password}
            </p>
          )}
        </div>

        {/* Remember + lockout status */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={remember}
              disabled={lockLeft > 0}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded accent-blue-700"
            />
            Remember my email
          </label>
          {lockLeft > 0 && (
            <p className="flex items-center gap-1 text-xs font-medium text-red-600">
              <Clock className="h-3.5 w-3.5" /> Retry in {lockLeft}s
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || lockLeft > 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/25 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Verifying credentials…</>
          ) : (
            <><ShieldCheck className="h-4 w-4" /> Sign in securely</>
          )}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-gray-400">
          All sign-in attempts are logged and monitored
        </p>
      </form>
    </div>
  );
}