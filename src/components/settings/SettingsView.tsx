'use client';

/* SettingsView — /settings: the signed-in person's own account.
     • My profile   — photo, name, phone (editable); email, role, department, status (read-only:
                      those are managed by an admin on the Users page / in PocketBase)
     • Security     — change password (signs straight back in with the new one)
     • Preferences  — sidebar, default calendar view, tooltips (kept in this browser)
   PocketBase superusers have no app profile: they see their account details and a note. */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClientResponseError } from 'pocketbase';
import {
  BadgeCheck, Building2, CalendarDays, Camera, Check, Clock, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail,
  MessageSquareText, MonitorSmartphone, PanelLeftClose, Share, Shield, SlidersHorizontal, Smartphone, SquarePlus, Trash2, UserRound,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { logActivity } from '@/lib/activity';
import { useAuth } from '@/contexts/AuthContext';
import { roleOf } from '@/lib/roles';
import { cleanName, nameError, phoneError } from '@/lib/validation';
import { compressImage } from '@/lib/memories/compressImage';
import { PREF_KEYS, PREFS_EVENT, readPref, writePref } from '@/lib/preferences';
import PhoneInput from '@/components/PhoneInput';
import { promptInstall, useInstallState } from '@/lib/pwa';
import { showToast } from '@/components/Toaster';
import GoogleAccountsSection from '@/components/settings/GoogleAccountsSection';

type Tab = 'profile' | 'security' | 'preferences' | 'google' | 'app';
const TABS: { value: Tab; label: string; icon: typeof UserRound; hint: string }[] = [
  { value: 'profile', label: 'My profile', icon: UserRound, hint: 'Photo, name and phone' },
  { value: 'security', label: 'Security', icon: Shield, hint: 'Password' },
  { value: 'preferences', label: 'Preferences', icon: SlidersHorizontal, hint: 'How the app behaves for you' },
  { value: 'google', label: 'Google accounts', icon: CalendarDays, hint: 'Send meetings from' },
  { value: 'app', label: 'Mobile app', icon: Smartphone, hint: 'Install Civillist on your phone' },
];

const ACCESS_TEXT = {
  admin: 'Full access, including settings for Google Calendar and email',
  editor: 'Can create, edit, reschedule and delete meetings, and send invites',
  viewer: 'Can view everything, but not change it',
} as const;

const fmtDate = (v?: string) =>
  v ? new Date(v.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const listText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();
const initialsOf = (name: string, email: string) =>
  (name.trim() ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') : (email[0] || 'U')).toUpperCase();

const errorText = (err: unknown, fallback: string) => {
  if (err instanceof ClientResponseError) {
    if (err.status === 403) return 'Your account isn’t allowed to change this — ask an admin.';
    const fields = err.response?.data as Record<string, { message?: string }> | undefined;
    const first = fields && Object.values(fields)[0]?.message;
    return first || err.message || fallback;
  }
  return fallback;
};

export default function SettingsView() {
  const router = useRouter();
  const { user, logout, login } = useAuth();
  const record = user as unknown as Record<string, any> | null;
  const isSuperuser = record?.collectionName === '_superusers';
  const access = roleOf(record);

  const [tab, setTab] = useState<Tab>('profile');
  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '') as Tab;
    if (TABS.some((t) => t.value === fromHash)) setTab(fromHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  const name = String(record?.name || '');
  const email = String(record?.email || '');
  const avatarUrl = record?.avatar ? pb.files.getURL(record as any, record.avatar, { thumb: '200x200' }) : '';

  const signOut = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
        {/* App bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><SlidersHorizontal className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">Settings</p>
            <p className="truncate text-[11px] text-slate-400">Your account and preferences</p>
          </div>
        </div>

        <div className="grid gap-6 bg-[#f7f6fd] p-3 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-7">
          {/* ── Account card + tabs ── */}
          <aside className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-100 to-purple-100 p-5 text-center">
              <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/50" />
              <div className="relative mx-auto h-20 w-20">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-white" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl font-bold text-white ring-4 ring-white">
                    {initialsOf(name, email)}
                  </span>
                )}
              </div>
              <p className="relative mt-3 text-base font-bold text-slate-900">{name || email.split('@')[0] || 'Your account'}</p>
              <p className="relative truncate text-xs text-slate-500">{email}</p>
              <div className="relative mt-3 flex flex-wrap justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <BadgeCheck className="h-3 w-3" /> {isSuperuser ? 'Platform owner' : record?.role || access[0].toUpperCase() + access.slice(1)}
                </span>
                {record?.status && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${String(record.status).toLowerCase() === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {record.status}
                  </span>
                )}
              </div>
            </div>

            <nav aria-label="Settings sections" className="rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
              {TABS.map(({ value, label, icon: Icon, hint }) => (
                <button key={value} type="button" onClick={() => go(value)} aria-current={tab === value ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${tab === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className={`block truncate text-[11px] ${tab === value ? 'text-slate-300' : 'text-slate-400'}`}>{hint}</span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={signOut}
                className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-rose-600 transition-colors hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> <span className="text-sm font-semibold">Sign out</span>
              </button>
            </nav>
          </aside>

          {/* ── Section ── */}
          <main className="min-w-0">
            {tab === 'profile' && <ProfileSection record={record} isSuperuser={isSuperuser} access={access} />}
            {tab === 'security' && <SecuritySection record={record} isSuperuser={isSuperuser} login={login} />}
            {tab === 'preferences' && <PreferencesSection />}
            {tab === 'google' && <GoogleAccountsSection isAdmin={access === 'admin'} />}
            {tab === 'app' && <AppSection />}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── building blocks ───────────────────────────── */

function Card({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">{footer}</div>}
    </section>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10';
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400';

function ReadOnly({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="break-words text-sm font-medium text-slate-800">{value || '—'}</p>
        {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
      </div>
    </div>
  );
}

function SaveButton({ busy, children, disabled }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {children}
    </button>
  );
}

/* ───────────────────────────── My profile ───────────────────────────── */

function ProfileSection({ record, isSuperuser, access }: { record: Record<string, any> | null; isSuperuser: boolean; access: keyof typeof ACCESS_TEXT }) {
  const [name, setName] = useState(String(record?.name || ''));
  const [phone, setPhone] = useState(String(record?.phone || ''));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== String(record?.name || '').trim() || phone !== String(record?.phone || '');
  const avatarUrl = record?.avatar ? pb.files.getURL(record as any, record.avatar, { thumb: '200x200' }) : '';

  /* re-read the account so the sidebar, header and this page show the change */
  const refresh = () => pb.collection('users').authRefresh().catch(() => {});

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const problem = nameError(name, { label: 'Full name' }) || phoneError(phone);
    if (problem) { setError(problem); return; }
    if (!record?.id) return;
    setSaving(true);
    setError('');
    try {
      await pb.collection('users').update(record.id, { name: name.trim(), phone });
      await refresh();
      logActivity('profile updated', 'user', `${name.trim()} updated their profile`, record.id);
      showToast('Profile saved', 'success');
    } catch (err) {
      setError(errorText(err, 'Couldn’t save your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async (file?: File) => {
    if (!file || !record?.id) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { showToast('Choose a JPG, PNG or WebP photo.', 'error'); return; }
    setPhotoBusy(true);
    try {
      const small = await compressImage(file, 600, 0.85);
      const data = new FormData();
      data.append('avatar', small);
      await pb.collection('users').update(record.id, data);
      await refresh();
      showToast('Photo updated', 'success');
    } catch (err) {
      showToast(errorText(err, 'Couldn’t upload the photo.'), 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!record?.id) return;
    setPhotoBusy(true);
    try {
      await pb.collection('users').update(record.id, { avatar: null });
      await refresh();
      showToast('Photo removed', 'success');
    } catch (err) {
      showToast(errorText(err, 'Couldn’t remove the photo.'), 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  if (isSuperuser) {
    return (
      <Card title="My profile" sub="Platform owner account">
        <ReadOnly icon={<Mail className="h-4 w-4" />} label="Email" value={String(record?.email || '')} />
        <ReadOnly icon={<Shield className="h-4 w-4" />} label="Access" value={ACCESS_TEXT.admin} />
        <p className="text-sm text-slate-500">
          This is the platform owner account, so it has no app profile (photo, name or phone).
          Sign in with your own user account to edit a profile.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <Card
        title="My profile"
        sub="How you appear across Civillist"
        footer={
          <>
            {dirty && (
              <button type="button" onClick={() => { setName(String(record?.name || '')); setPhone(String(record?.phone || '')); setError(''); }}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                Discard changes
              </button>
            )}
            <SaveButton busy={saving} disabled={!dirty}>Save profile</SaveButton>
          </>
        }
      >
        {/* Photo */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Your photo" className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-100" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold text-white">
                {initialsOf(String(record?.name || ''), String(record?.email || ''))}
              </span>
            )}
            {photoBusy && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-violet-600" /></span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700 disabled:opacity-50">
              <Camera className="h-3.5 w-3.5" /> {avatarUrl ? 'Change photo' : 'Add photo'}
            </button>
            {avatarUrl && (
              <button type="button" onClick={removePhoto} disabled={photoBusy}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <p className="w-full text-[11px] text-slate-400">JPG, PNG or WebP. Resized automatically.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={(e) => { changePhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {/* Editable */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="set-name" className={labelCls}>Full name *</label>
            <input id="set-name" value={name} onChange={(e) => { setName(cleanName(e.target.value)); setError(''); }}
              autoComplete="name" placeholder="e.g. Tejaswi Rao" className={inputCls} />
          </div>
          <div>
            <label htmlFor="set-phone" className={labelCls}>Phone</label>
            <PhoneInput id="set-phone" value={phone} onChange={(v) => { setPhone(v); setError(''); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 focus-within:bg-white" />
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</p>}
      </Card>

      <Card title="Account details" sub="Managed by an administrator — ask an Admin to change these">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnly icon={<Mail className="h-4 w-4" />} label="Email (sign-in)" value={String(record?.email || '')} />
          <ReadOnly icon={<Shield className="h-4 w-4" />} label="Role" value={String(record?.role || '') || access[0].toUpperCase() + access.slice(1)} note={ACCESS_TEXT[access]} />
          <ReadOnly icon={<Building2 className="h-4 w-4" />} label="Department" value={String(record?.department || '')} />
          <ReadOnly icon={<KeyRound className="h-4 w-4" />} label="Permissions" value={listText(record?.permissions)} />
          <ReadOnly icon={<CalendarDays className="h-4 w-4" />} label="Member since" value={fmtDate(record?.created)} />
          <ReadOnly icon={<Clock className="h-4 w-4" />} label="Last sign-in" value={record?.last_login ? fmtDate(record.last_login) : '—'} />
        </div>
      </Card>
    </form>
  );
}

/* ───────────────────────────── Security ───────────────────────────── */

function SecuritySection({ record, isSuperuser, login }: {
  record: Record<string, any> | null; isSuperuser: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean }>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const checks = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: /[a-zA-Z]/.test(next) && /\d/.test(next), text: 'Letters and numbers' },
    { ok: !!next && next === confirm, text: 'Both new passwords match' },
    { ok: !!next && next !== current, text: 'Different from the current password' },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) { setError('Enter your current password.'); return; }
    const failed = checks.find((c) => !c.ok);
    if (failed) { setError(`New password: ${failed.text.toLowerCase()}.`); return; }
    if (!record?.id) return;
    setSaving(true);
    setError('');
    try {
      const collection = isSuperuser ? '_superusers' : 'users';
      await pb.collection(collection).update(record.id, { oldPassword: current, password: next, passwordConfirm: confirm });
      // changing the password ends the session → sign straight back in with the new one
      const again = await login(String(record.email || ''), next);
      setCurrent(''); setNext(''); setConfirm('');
      logActivity('password changed', 'user', `${record.name || record.email || 'User'} changed their password`, record.id);
      showToast(again.ok ? 'Password changed' : 'Password changed — please sign in again', 'success');
    } catch (err) {
      const msg = errorText(err, 'Couldn’t change the password.');
      setError(/old ?password|invalid/i.test(msg) ? 'The current password is wrong.' : msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, auto: string) => (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={auto}
        onChange={(e) => { set(e.target.value); setError(''); }} className={inputCls} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Card
        title="Change password"
        sub="You stay signed in on this device; other devices will need the new password"
        footer={<SaveButton busy={saving}>Change password</SaveButton>}
      >
        <div className="grid gap-4 sm:max-w-md">
          {field('set-current', 'Current password', current, setCurrent, 'current-password')}
          {field('set-new', 'New password', next, setNext, 'new-password')}
          {field('set-confirm', 'Confirm new password', confirm, setConfirm, 'new-password')}
          <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-violet-700">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? 'Hide passwords' : 'Show passwords'}
          </button>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.text} className={`flex items-center gap-2 text-xs ${c.ok ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full ${c.ok ? 'bg-emerald-100' : 'bg-slate-100'}`}><Check className="h-3 w-3" /></span>
              {c.text}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</p>}
      </Card>
    </form>
  );
}

/* ───────────────────────────── Preferences ───────────────────────────── */

const VIEWS = ['day', 'week', 'month', 'year', 'agenda'] as const;

function PreferencesSection() {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<string>('month');
  const [tips, setTips] = useState(true);

  // read after mount (the server has no localStorage), and follow changes made elsewhere (Ctrl + B)
  useEffect(() => {
    const sync = () => {
      setCollapsed(readPref(PREF_KEYS.sidebarCollapsed) === '1');
      setView(readPref(PREF_KEYS.calendarView) || 'month');
      setTips(readPref(PREF_KEYS.tooltips) !== 'off');
    };
    sync();
    window.addEventListener(PREFS_EVENT, sync);
    return () => window.removeEventListener(PREFS_EVENT, sync);
  }, []);

  return (
    <Card title="Preferences" sub="Saved in this browser — they apply straight away">
      <Toggle
        icon={<PanelLeftClose className="h-4 w-4" />}
        title="Compact sidebar"
        text="Show the menu as icons only, to give pages more room. Shortcut: Ctrl + B."
        on={collapsed}
        onChange={(v) => writePref(PREF_KEYS.sidebarCollapsed, v ? '1' : '0')}
      />
      <Toggle
        icon={<MessageSquareText className="h-4 w-4" />}
        title="Tooltips"
        text="Show a short explanation when you point at a button or a value."
        on={tips}
        onChange={(v) => writePref(PREF_KEYS.tooltips, v ? 'on' : 'off')}
      />
      <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-slate-50/80 px-4 py-3.5">
        <span className="mt-0.5 text-slate-400"><CalendarDays className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Calendar opens in</p>
          <p className="text-xs text-slate-500">The view you see first on the <Link href="/calendar" className="text-violet-700 hover:underline">Calendar</Link> page.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Default calendar view">
            {VIEWS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v}
                onClick={() => writePref(PREF_KEYS.calendarView, v)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-all ${view === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-violet-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Toggle({ icon, title, text, on, onChange }: { icon: ReactNode; title: string; text: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 px-4 py-3.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{text}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-violet-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/* ───────────────────────────── Mobile app ───────────────────────────── */

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{n}</span>
      <span className="pt-0.5 text-sm text-slate-600">{children}</span>
    </li>
  );
}

function AppSection() {
  const { canPrompt, installed, ios } = useInstallState();
  const [address, setAddress] = useState('');
  useEffect(() => setAddress(window.location.origin), []);
  const secure = address.startsWith('https://') || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(address);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      showToast('Link copied — open it on your phone', 'success');
    } catch {
      showToast('Copy didn’t work — select the link and copy it', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Civillist on your phone" sub="Install it like an app — its own icon, full screen, no app store needed">
        <div className={`flex flex-wrap items-center gap-4 rounded-2xl px-4 py-4 ${installed ? 'bg-emerald-50' : 'bg-violet-50/70'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-14 w-14 rounded-2xl shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">
              {installed ? 'Installed on this device' : canPrompt ? 'Ready to install on this device' : 'Civillist app'}
            </p>
            <p className="text-xs text-slate-500">
              {installed
                ? 'You’re using the installed app. Updates arrive automatically.'
                : 'Opens from your home screen, full screen, with the Civillist icon. Always up to date.'}
            </p>
          </div>
          {!installed && canPrompt && (
            <button type="button" onClick={async () => { if ((await promptInstall()) === 'accepted') showToast('Civillist is being installed', 'success'); }}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800">
              <SquarePlus className="h-4 w-4" /> Install app
            </button>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className={`rounded-2xl border px-4 py-4 ${ios ? 'border-violet-300 bg-white' : 'border-slate-100 bg-slate-50/60'}`}>
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><Smartphone className="h-4 w-4 text-slate-400" /> iPhone / iPad (Safari)</p>
            <ol className="space-y-2.5">
              <Step n={1}>Open Civillist in <b>Safari</b>.</Step>
              <Step n={2}>Tap the <b>Share</b> button <Share className="inline h-4 w-4 align-[-3px]" /> at the bottom.</Step>
              <Step n={3}>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
            </ol>
          </div>
          <div className={`rounded-2xl border px-4 py-4 ${!ios ? 'border-violet-300 bg-white' : 'border-slate-100 bg-slate-50/60'}`}>
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><MonitorSmartphone className="h-4 w-4 text-slate-400" /> Android / computer (Chrome, Edge)</p>
            <ol className="space-y-2.5">
              <Step n={1}>Tap <b>Install</b> at the top of Civillist (or the button above).</Step>
              <Step n={2}>No button? Open the browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</Step>
              <Step n={3}>Confirm with <b>Install</b>.</Step>
            </ol>
          </div>
        </div>
      </Card>

      <Card title="Open Civillist on your phone" sub="Use this address in the phone’s browser, then install it from there">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 select-all break-all rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-800 ring-1 ring-slate-200">{address || '…'}</code>
          <button type="button" onClick={copy}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Copy link
          </button>
        </div>
        {!secure && address && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Phones only allow installing from a secure (<b>https://</b>) address. Install from the live site — this address works for viewing, not installing.
          </p>
        )}
      </Card>
    </div>
  );
}
