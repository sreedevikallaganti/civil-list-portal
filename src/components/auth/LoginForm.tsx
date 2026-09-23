// src/components/auth/LoginForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';
import styles from '@/styles/Login.module.css';

type AccountType = 'user' | 'superuser';

const DASHBOARD_ROUTE = '/dashboard';

export default function LoginForm() {
  const router = useRouter();

  const [accountType, setAccountType] = useState<AccountType>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const [auth, setAuth] = useState({ isValid: false, record: null as typeof pb.authStore.record });
  useEffect(() => {
    const sync = () => setAuth({ isValid: pb.authStore.isValid, record: pb.authStore.record });
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  useEffect(() => {
    if (auth.isValid) {
      router.replace(DASHBOARD_ROUTE);
    }
  }, [auth.isValid, router]);

  const authRecord = auth.record as { id: string; email?: string; collectionName?: string } | null;
  const isSuperuser = authRecord?.collectionName === '_superusers';

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
      if (accountType === 'superuser') {
        // Super Admin — PocketBase superusers collection
        await pb.collection('_superusers').authWithPassword(email.trim(), password);
      } else {
        // Admin — regular "users" collection (rename here if yours differs)
        await pb.collection('users').authWithPassword(email.trim(), password);
      }

      router.push(DASHBOARD_ROUTE);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientResponseError) {
        if (err.status === 0) fail('Cannot reach the server — is PocketBase running?');
        else if (err.status === 400) fail('Invalid email or password.');
        else fail(err.message);
      } else {
        fail('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    pb.authStore.clear();
    setEmail('');
    setPassword('');
  };

  if (auth.isValid) {
    return (
      <div className={styles.session}>
        <div className={styles.sessionRow}>
          <span className={styles.avatar}>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className={styles.sessionName}>
              Signed in as {authRecord?.email ?? authRecord?.id}
            </p>
            <p className={styles.sessionRole}>
              {isSuperuser ? 'Super Admin account' : 'Admin account'}
            </p>
          </div>
        </div>
        <div className={styles.sessionActions}>
          <button
            type="button"
            onClick={() => { router.push(DASHBOARD_ROUTE); router.refresh(); }}
            className={styles.primaryBtn}
          >
            Go to dashboard
          </button>
          <button type="button" onClick={signOut} className={styles.secondaryBtn}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.loginForm} noValidate>
      {/* Account type toggle */}
      <div>
        <span className={styles.fieldLabel}>Account type</span>
        <div role="radiogroup" aria-label="Account type" className={styles.toggle}>
          <span
            className={styles.toggleThumb}
            style={{ transform: accountType === 'superuser' ? 'translateX(100%)' : 'translateX(0)' }}
            aria-hidden
          />
          {([['user', 'Admin'], ['superuser', 'Super Admin']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={accountType === value}
              onClick={() => { setAccountType(value); setError(null); }}
              className={`${styles.toggleBtn} ${
                accountType === value ? styles.toggleBtnActive : ''
              }`}
            >
              {value === 'superuser' && <ShieldCheck className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
        <p className={styles.toggleHint}>
          {accountType === 'superuser'
            ? 'Full access — bypasses all PocketBase rules.'
            : 'Access depends on the collection API rules.'}
        </p>
      </div>

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
          <><LogIn className="h-4 w-4" /> Sign in as {accountType === 'superuser' ? 'Super Admin' : 'Admin'}</>
        )}
      </button>
    </form>
  );
}