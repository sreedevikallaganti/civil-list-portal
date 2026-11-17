// src/components/auth/LoginForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import styles from '@/styles/Login.module.css';

/* One sign-in for everyone — Admin, Super Admin, Editor, Viewer and PocketBase superusers.
   The account's role (users.role) decides what they can do once inside; nobody picks it here. */

const DASHBOARD_ROUTE = '/';

export default function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const fail = (message: string) => {
    setError(message);
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      fail('Please enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      // the shared sign-in: checks "users" first, then PocketBase superusers; blocks deactivated accounts
      const result = await login(email, password);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      router.replace(DASHBOARD_ROUTE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.loginForm} noValidate>
      {/* Email */}
      <div>
        <label htmlFor="login-email" className={styles.fieldLabel}>
          Email address
        </label>
        <div className={styles.inputWrap}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={styles.input}
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <div className={styles.fieldRow}>
          <label htmlFor="login-password" className={styles.fieldLabel} style={{ marginBottom: 0 }}>
            Password
          </label>
          <a href="#" className={styles.link}>
            Forgot password?
          </a>
        </div>
        <div className={styles.inputWrap}>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`${styles.input} ${styles.inputPassword}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={styles.toggleVisibility}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          onAnimationEnd={() => setShake(false)}
          className={`${styles.error} ${shake ? styles.errorShake : ''}`}
        >
          <AlertCircle className={`${styles.errorIcon} h-4 w-4`} />
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={busy} className={styles.submit}>
        {busy ? (
          <><Loader2 className={`h-4 w-4 ${styles.spinner}`} /> Signing in...</>
        ) : (
          <><LogIn className="h-4 w-4" /> Sign in</>
        )}
      </button>
    </form>
  );
}