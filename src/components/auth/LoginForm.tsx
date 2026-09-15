// src/components/auth/LoginForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';

type AccountType = 'user' | 'superuser';

export default function LoginForm() {
  const router = useRouter();

  const [accountType, setAccountType] = useState<AccountType>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Reflect existing sessions (picked up from localStorage) */
  const [auth, setAuth] = useState({ isValid: false, record: null as typeof pb.authStore.record });
  useEffect(() => {
    const sync = () => setAuth({ isValid: pb.authStore.isValid, record: pb.authStore.record });
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const authRecord = auth.record as { id: string; email?: string; collectionName?: string } | null;
  const isSuperuser = authRecord?.collectionName === '_superusers';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      if (accountType === 'superuser') {
        // PocketBase 0.23+ (older versions: pb.admins.authWithPassword(email, password))
        await pb.collection('_superusers').authWithPassword(email.trim(), password);
      } else {
        // ⚠️ If your auth collection isn't named "users", change it here —
        // check your OLD LoginForm for the pb.collection('...') call it used.
        await pb.collection('users').authWithPassword(email.trim(), password);
      }

      // Token is stored automatically. CreateOfficerPanel detects it via
      // pb.authStore.onChange and enables saving — no props needed.
      router.push('/'); // change to your dashboard route if different
      router.refresh();
    } catch (err) {
      if (err instanceof ClientResponseError) {
        if (err.status === 0) setError('Cannot reach the server — is PocketBase running?');
        else if (err.status === 400) setError('Invalid email or password.');
        else setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
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

  /* ---------------- Already signed in? ---------------- */
  if (auth.isValid) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Signed in as {authRecord?.email ?? authRecord?.id}
            </p>
            <p className="text-xs text-gray-500">
              {isSuperuser ? 'Superuser account' : 'User account'}
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => { router.push('/'); router.refresh(); }}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700"
          >
            Go to dashboard
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- Sign-in form ---------------- */
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Account type toggle */}
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-gray-700">Account type</span>
        <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {([['user', 'User'], ['superuser', 'Superuser']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={accountType === value}
              onClick={() => { setAccountType(value); setError(null); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                accountType === value
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {value === 'superuser' && <ShieldCheck className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          {accountType === 'superuser'
            ? 'Full access — bypasses all PocketBase rules.'
            : 'Access depends on the collection API rules.'}
        </p>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-gray-700">
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-600/10"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-gray-700">
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-600/10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-[13px] text-red-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
        ) : (
          <><LogIn className="h-4 w-4" /> Sign in as {accountType === 'superuser' ? 'Superuser' : 'User'}</>
        )}
      </button>
    </form>
  );
}