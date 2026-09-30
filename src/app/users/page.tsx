'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, User, Users, Building2, Shield,
  X, Mail, Phone, Plus, Database, Loader2, ArrowRight, ArrowUpRight,
  Pencil, Trash2, RefreshCw, CheckCircle2, AlertCircle, KeyRound,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateUserPanel from '@/components/users/CreateUserPanel';

/* --------------------------- Department Color Configuration --------------------------- */

const DEPT_PALETTE: Record<string, {
  badge: string; dot: string; avatar: string; accentText: string; nameHover: string;
  gradient: string; accent: string; glow: string; hoverRow: string;
}> = {
  sky: {
    badge: 'bg-sky-50/80 text-sky-700 ring-1 ring-inset ring-sky-600/15',
    dot: 'bg-sky-500',
    avatar: 'from-sky-400 to-blue-600',
    accentText: 'text-sky-600',
    nameHover: 'group-hover:text-sky-700',
    gradient: 'from-sky-500 to-blue-600',
    accent: 'from-sky-400 to-blue-500',
    glow: 'shadow-blue-600/20',
    hoverRow: 'hover:bg-sky-50/50',
  },
  indigo: {
    badge: 'bg-indigo-50/80 text-indigo-700 ring-1 ring-inset ring-indigo-600/15',
    dot: 'bg-indigo-500',
    avatar: 'from-indigo-400 to-violet-600',
    accentText: 'text-indigo-600',
    nameHover: 'group-hover:text-indigo-700',
    gradient: 'from-indigo-500 to-violet-600',
    accent: 'from-indigo-400 to-violet-500',
    glow: 'shadow-indigo-600/20',
    hoverRow: 'hover:bg-indigo-50/50',
  },
  amber: {
    badge: 'bg-amber-50/80 text-amber-700 ring-1 ring-inset ring-amber-600/20',
    dot: 'bg-amber-500',
    avatar: 'from-amber-400 to-orange-500',
    accentText: 'text-amber-600',
    nameHover: 'group-hover:text-amber-700',
    gradient: 'from-amber-500 to-orange-500',
    accent: 'from-amber-400 to-orange-500',
    glow: 'shadow-amber-600/20',
    hoverRow: 'hover:bg-amber-50/50',
  },
  emerald: {
    badge: 'bg-emerald-50/80 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
    dot: 'bg-emerald-500',
    avatar: 'from-emerald-400 to-green-600',
    accentText: 'text-emerald-600',
    nameHover: 'group-hover:text-emerald-700',
    gradient: 'from-emerald-500 to-green-600',
    accent: 'from-emerald-400 to-green-500',
    glow: 'shadow-emerald-600/20',
    hoverRow: 'hover:bg-emerald-50/50',
  },
  rose: {
    badge: 'bg-rose-50/80 text-rose-700 ring-1 ring-inset ring-rose-600/15',
    dot: 'bg-rose-500',
    avatar: 'from-rose-400 to-pink-600',
    accentText: 'text-rose-600',
    nameHover: 'group-hover:text-rose-700',
    gradient: 'from-rose-500 to-pink-600',
    accent: 'from-rose-400 to-pink-500',
    glow: 'shadow-rose-600/20',
    hoverRow: 'hover:bg-rose-50/50',
  },
  violet: {
    badge: 'bg-violet-50/80 text-violet-700 ring-1 ring-inset ring-violet-600/15',
    dot: 'bg-violet-500',
    avatar: 'from-violet-400 to-purple-600',
    accentText: 'text-violet-600',
    nameHover: 'group-hover:text-violet-700',
    gradient: 'from-violet-500 to-purple-600',
    accent: 'from-violet-400 to-purple-500',
    glow: 'shadow-violet-600/20',
    hoverRow: 'hover:bg-violet-50/50',
  },
};

const PALETTE_KEYS = Object.keys(DEPT_PALETTE);

const FALLBACK_CONFIG = {
  badge: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15',
  dot: 'bg-slate-400',
  avatar: 'from-slate-400 to-slate-600',
  accentText: 'text-slate-600',
  nameHover: 'group-hover:text-slate-700',
  gradient: 'from-slate-500 to-slate-600',
  accent: 'from-slate-400 to-slate-500',
  glow: 'shadow-slate-600/20',
  hoverRow: 'hover:bg-slate-50',
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function getDeptConfig(dept?: string) {
  const d = (dept || '').trim();
  if (!d) return FALLBACK_CONFIG;
  return DEPT_PALETTE[PALETTE_KEYS[hashString(d) % PALETTE_KEYS.length]];
}

/* --------------------------------- General helpers --------------------------------- */

/* SOFT DELETE — collection that archives a full snapshot of a record before
   it's removed from its source collection, so it can be recovered later.
   (Same archive collection used by the officers and employees pages.) */
const ARCHIVE_COLLECTION = 'deleted_records';

const PER_PAGE_OPTIONS = [10, 25, 50];

function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

const getInitials = (name: string) =>
  (name || '?').trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const formatDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/* Resolve the PocketBase avatar file URL (works across SDK versions) */
function avatarUrl(u: any): string {
  if (!u?.avatar) return '';
  try {
    if (typeof (pb as any).getFileUrl === 'function') return (pb as any).getFileUrl(u, u.avatar);
    if (typeof (pb as any).files?.getURL === 'function') return (pb as any).files.getURL(u, u.avatar);
  } catch { /* ignore */ }
  return '';
}

const EMPTY_FORM = {
  name: '',
  email: '',
  department: '',
  permissions: '',
};

/* ------------------------------ Animation helpers ------------------------------ */

function AnimationStyles() {
  return (
    <style>{`
      @keyframes usrFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes usrFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes usrPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
      @keyframes usrOverlay { from { opacity: 0; } to { opacity: 1; } }
      @keyframes usrPanel { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes usrModal { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes usrBlobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(34px,26px) scale(1.06); } }
      @keyframes usrBlobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.05); } }
      @keyframes usrBlobC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-26px) scale(1.04); } }
      @keyframes usrShimmer { 100% { transform: translateX(100%); } }

      .usr-fade-up { opacity: 0; animation: usrFadeUp .65s cubic-bezier(.22,1,.36,1) forwards; }
      .usr-fade-in { opacity: 0; animation: usrFadeIn .45s ease forwards; }
      .usr-pop { opacity: 0; animation: usrPop .5s cubic-bezier(.34,1.56,.64,1) forwards; }
      .usr-overlay { animation: usrOverlay .3s ease forwards; }
      .usr-panel { animation: usrPanel .4s cubic-bezier(.32,.72,0,1) forwards; }
      .usr-modal { animation: usrModal .35s cubic-bezier(.22,1,.36,1) forwards; }
      .usr-blob-a { animation: usrBlobA 18s ease-in-out infinite; }
      .usr-blob-b { animation: usrBlobB 22s ease-in-out infinite; }
      .usr-blob-c { animation: usrBlobC 26s ease-in-out infinite; }
      .usr-skeleton { position: relative; overflow: hidden; background: #edeaf8; border-radius: .75rem; }
      .usr-skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: usrShimmer 1.5s infinite; }

      @media (prefers-reduced-motion: reduce) {
        .usr-fade-up, .usr-fade-in, .usr-pop, .usr-panel, .usr-modal { animation: none; opacity: 1; }
        .usr-blob-a, .usr-blob-b, .usr-blob-c { animation: none; }
        .usr-skeleton::after { animation: none; }
      }
    `}</style>
  );
}

/* Smooth count-up animation for KPI numbers */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    if (from === target) { setValue(target); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function AnimatedNumber({ value }: { value: number }) {
  const display = useCountUp(value);
  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

/* ================================ Main Page ================================ */

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  /* Status filter: 'all' | 'verified' | 'pending' — driven by the KPI cards */
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  /* Department dropdown filter */
  const [department, setDepartment] = useState('All');
  const [allDepartments, setAllDepartments] = useState<string[]>([]);

  /* CREATE panel (your existing component) */
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  /* EDIT form panel */
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* DELETE mode — confirmation modal state */
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Stats for KPI cards */
  const [totalCount, setTotalCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [deptCount, setDeptCount] = useState(0);

  /* Pagination state */
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [perPage, setPerPage] = useState(50);

  /* Off-canvas detail panel state */
  const [selectedUser, setSelectedUser] = useState<any>(null);

  /* The users table's DOM node, so clicking a KPI/stat card can
     smooth-scroll straight to it instead of leaving the user to scroll
     past the header/KPI cards manually. */
  const tableRef = useRef<HTMLDivElement>(null);

  /* SERVER-SIDE SEARCH — debounced */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadToken = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, statusFilter, department, perPage, debouncedSearch]);

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (!loading && currentPage > 1 && users.length === 0) {
      setCurrentPage((p) => p - 1);
    }
  }, [loading, currentPage, users.length]);

  useEffect(() => {
    if (deleteTarget || editingUser || isCreateOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [deleteTarget, editingUser, isCreateOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (isCreateOpen) return;
      if (editingUser && !saving) { setEditingUser(null); setFormError(null); return; }
      if (deleteTarget && !deleteLoading) { setDeleteTarget(null); setDeleteError(null); return; }
      if (selectedUser) setSelectedUser(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUser, isCreateOpen, deleteTarget, deleteLoading, editingUser, saving]);

  /* ------------------------------ Data Loading ----------------------------- */

  const SEARCHABLE_FIELDS = ['name', 'email', 'department', 'permissions'];

  async function fetchPage(page: number, per: number, query: string, status: string, dept: string) {
    const filters: string[] = [];
    if (status === 'verified') filters.push('verified = true');
    if (status === 'pending') filters.push('verified = false');
    if (dept !== 'All') {
      const d = dept.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      filters.push(`department = "${d}"`);
    }
    if (query) {
      const q = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      filters.push(`(${SEARCHABLE_FIELDS.map((f) => `${f} ~ "${q}"`).join(' || ')})`);
    }
    const opts: any = { sort: '-created' };
    if (filters.length) opts.filter = filters.join(' && ');
    return pb.collection('users').getList(page, per, opts);
  }

  async function loadData(page: number) {
    const requestId = ++loadToken.current;
    try {
      setLoading(true);
      const result = await fetchPage(page, perPage, debouncedSearch, statusFilter, department);

      if (requestId !== loadToken.current) return;

      setUsers(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, Math.ceil(result.totalItems / perPage)));
    } catch (error) {
      if (requestId === loadToken.current) {
        console.error('Error loading users:', error);
        setUsers([]);
      }
    } finally {
      if (requestId === loadToken.current) setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const all = await pb.collection('users').getFullList();
      const verified = all.filter((u: any) => u.verified).length;
      setTotalCount(all.length);
      setVerifiedCount(verified);
      setPendingCount(all.length - verified);
      setDeptCount(new Set(all.map((u: any) => String(u.department || '').trim()).filter(Boolean)).size);
      setAllDepartments(
        ['All', ...Array.from(new Set(all.map((u: any) => u.department).filter(Boolean) as string[])).sort()]
      );
    } catch { /* non-critical */ }
  }

  /* -------------------------------- Actions -------------------------------- */

  const handleCardClick = (status: 'all' | 'verified' | 'pending') => {
    setStatusFilter(status);
    setCurrentPage(1);
    setSearchQuery('');
    setDebouncedSearch('');
    /* Smooth-scroll down to the table so clicking a KPI card jumps
       straight to the filtered results instead of leaving the user to
       scroll down past the header/KPI cards manually. */
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openEdit = (usr: any) => {
    setEditingUser(usr);
    setForm({
      name: usr.name || '',
      email: usr.email || '',
      department: usr.department || '',
      permissions: usr.permissions || '',
    });
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const handleSave = async () => {
    if (saving || !editingUser) return;
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (newPassword && newPassword !== confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    try {
      setSaving(true);
      setFormError(null);

      const payload: Record<string, any> = {
        name: form.name,
        email: form.email,
        department: form.department,
        permissions: form.permissions,
        emailVisibility: true,
      };
      /* Only touch the password when the user actually typed one */
      if (newPassword) {
        payload.password = newPassword;
        payload.passwordConfirm = confirmPassword;
      }

      await pb.collection('users').update(editingUser.id, payload);

      setEditingUser(null);
      setNewPassword('');
      setConfirmPassword('');
      await Promise.all([loadData(currentPage), loadStats()]);
    } catch (err: any) {
      console.error('Save failed:', err);
      const status = err?.status;
      let message = err?.message || 'Failed to save this user. Please try again.';
      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) message = 'Permission denied — check the Update rule on the "users" collection (PocketBase Admin → Collection → API Rules).';
      else if (status === 400 && newPassword) message = 'PocketBase rejected the update — the new password may be too short or invalid.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (usr: any) => {
    setDeleteError(null);
    setDeleteTarget(usr);
  };

  /* SOFT DELETE — archive a full snapshot of the record into `deleted_records`
     first, then remove it from the `users` collection. If the archive step
     fails, the record is left untouched (nothing is lost). */
  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    let failedStep: 'archive' | 'delete' = 'archive';

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const { id: originalId, ...recordData } = deleteTarget;

      await pb.collection(ARCHIVE_COLLECTION).create({
        original_collection: 'users',
        original_id: originalId,
        record_type: 'User',
        record_data: recordData,
        deleted_at: new Date().toISOString(),
      });

      failedStep = 'delete';
      await pb.collection('users').delete(deleteTarget.id);

      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      if (selectedUser?.id === deletedId) setSelectedUser(null);
      if (editingUser?.id === deletedId) setEditingUser(null);

      await Promise.all([loadData(currentPage), loadStats()]);
    } catch (err: any) {
      console.error('Delete failed:', err);
      const status = err?.status;
      const targetCollection = failedStep === 'archive' ? ARCHIVE_COLLECTION : 'users';

      let message = failedStep === 'archive'
        ? 'Failed to archive this record before deleting it. Please try again.'
        : 'This user was archived, but the delete step failed. Please try again.';

      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) {
        message = `Permission denied — check the ${failedStep === 'archive' ? 'Create' : 'Delete'} rule on the "${targetCollection}" collection (PocketBase Admin → Collection → API Rules).`;
      } else if (status === 404) message = 'This user was not found — they may have already been deleted.';

      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* Page header per selected status — mirrors HEADER_CONFIG */
  const HEADER_CONFIG = {
    all:      { title: 'Users Directory', subtitle: 'Browse and manage all portal accounts', icon: Users, gradient: 'from-violet-500 to-indigo-600', glow: 'shadow-violet-600/20' },
    verified: { title: 'Verified Users',  subtitle: 'Accounts with confirmed email',          icon: CheckCircle2, gradient: 'from-emerald-500 to-green-600', glow: 'shadow-emerald-600/20' },
    pending:  { title: 'Pending Users',   subtitle: 'Accounts awaiting email verification',   icon: AlertCircle, gradient: 'from-amber-500 to-orange-500',  glow: 'shadow-amber-600/20' },
  } as const;
  const header = HEADER_CONFIG[statusFilter];
  const HeaderIcon = header.icon;

  /* Pagination derived values */
  const safePage = Math.min(currentPage, totalPages);
  const paginationRange = getPaginationRange(safePage, totalPages);
  const start = users.length > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const end = Math.min(currentPage * perPage, totalItems);

  const listKey = `${statusFilter}-${department}-${currentPage}-${debouncedSearch}-${perPage}`;

  /* KPI cards — Total / Verified / Pending / Departments (mirrors STAT_CARDS) */
  const statCards = [
    { key: 'all' as const, label: 'Total Users', caption: 'All portal accounts', icon: Users,
      card: 'from-violet-100 to-purple-100', iconTint: 'text-violet-600',
      accent: 'from-violet-400 to-purple-500', count: totalCount, clickable: true },
    { key: 'verified' as const, label: 'Verified', caption: 'Email confirmed', icon: CheckCircle2,
      card: 'from-emerald-100 to-green-100', iconTint: 'text-emerald-600',
      accent: 'from-emerald-400 to-green-500', count: verifiedCount, clickable: true },
    { key: 'pending' as const, label: 'Pending', caption: 'Awaiting verification', icon: AlertCircle,
      card: 'from-amber-100 to-orange-100', iconTint: 'text-amber-600',
      accent: 'from-amber-400 to-orange-500', count: pendingCount, clickable: true },
    { key: 'depts' as const, label: 'Departments', caption: 'Distinct teams', icon: Building2,
      card: 'from-sky-100 to-blue-100', iconTint: 'text-sky-600',
      accent: 'from-sky-400 to-blue-500', count: deptCount, clickable: false },
  ];

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading && users.length === 0) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
        <AnimationStyles />
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="usr-skeleton h-9 w-9 !rounded-xl" />
              <div className="space-y-2">
                <div className="usr-skeleton h-4 w-32 !rounded-full" />
                <div className="usr-skeleton h-3 w-44 !rounded-full" />
              </div>
            </div>
            <div className="usr-skeleton h-10 w-40 !rounded-full" />
          </div>

          <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="usr-skeleton h-[196px] !rounded-3xl" />
              ))}
            </div>

            <div className="usr-skeleton h-[76px] !rounded-3xl" />

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                <div className="usr-skeleton h-4 w-40 !rounded-full" />
                <div className="usr-skeleton h-5 w-12 !rounded-full" />
              </div>
              <div className="divide-y divide-slate-100">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="usr-skeleton h-9 w-9 !rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="usr-skeleton h-3.5 w-1/3 !rounded-full" />
                      <div className="usr-skeleton h-3 w-1/5 !rounded-full" />
                    </div>
                    <div className="usr-skeleton h-3.5 w-24 hidden md:block !rounded-full" />
                    <div className="usr-skeleton h-5 w-16 hidden md:block !rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- Main View ------------------------------- */

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
      <AnimationStyles />

      {/* --------------------- Decorative ambient background --------------------- */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="usr-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="usr-blob-b absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="usr-blob-c absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">

        {/* ------------------------------- App bar ------------------------------ */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-900">Users</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 ring-1 ring-inset ring-violet-500/15">
                  {totalCount}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              New User
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------------ Page Header ----------------------------- */}
          <header className="usr-fade-up flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow} ring-1 ring-inset ring-white/30`}>
                <HeaderIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Users · Management
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-[28px]">{header.title}</h1>
                <p className="mt-0.5 text-sm text-slate-500">{header.subtitle}</p>
              </div>
            </div>
          </header>

          {/* ------------------------------ Status Stats ------------------------------ */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-5">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              const active = stat.clickable && statusFilter === stat.key;
              const pct = totalCount > 0 ? Math.round((stat.count / totalCount) * 100) : 0;

              const inner = (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <p className="truncate pt-1.5 text-sm font-semibold text-slate-600">{stat.label}</p>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-300 group-hover:scale-110 ${stat.iconTint}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>

                  <div className="relative mt-3 flex items-end justify-between gap-2">
                    <span className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">
                      <AnimatedNumber value={stat.count} />
                    </span>
                    <span className="inline-flex items-center gap-0.5 pb-1 text-[10px] font-bold text-slate-500/80">
                      <ArrowUpRight className="h-3 w-3" />
                      {pct}%
                    </span>
                  </div>
                  <p className="relative mt-1.5 text-xs font-medium text-slate-500/80">{stat.caption}</p>

                  {/* Animated share-of-total progress */}
                  <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/60">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stat.accent} transition-all duration-700 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              );

              const cls = `usr-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98] ring-1 ring-white/70 ${stat.card} ${
                active ? 'shadow-md shadow-slate-900/10' : ''
              } ${stat.clickable ? 'cursor-pointer' : 'cursor-default'}`;

              return stat.clickable ? (
                <button key={stat.key} onClick={() => handleCardClick(stat.key as 'all' | 'verified' | 'pending')} style={{ animationDelay: `${90 + i * 90}ms` }} className={cls}>
                  {inner}
                </button>
              ) : (
                <div key={stat.key} style={{ animationDelay: `${90 + i * 90}ms` }} className={cls}>
                  {inner}
                </div>
              );
            })}
          </section>

          {/* ------------------------------- Search Bar ----------------------------- */}
          <section className="usr-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 lg:p-5" style={{ animationDelay: '420ms' }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users by name, email, department or permissions..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setDebouncedSearch(''); setCurrentPage(1); }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-all duration-200 hover:rotate-90 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Department dropdown */}
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setCurrentPage(1); }}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-48"
                >
                  {allDepartments.map((d) => (
                    <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
              </div>


            </div>
          </section>

          {/* --------------------------------- Table -------------------------------- */}
          <section ref={tableRef} className="usr-fade-up" style={{ animationDelay: '500ms' }}>
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">

              {/* Table header */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <HeaderIcon className="h-4 w-4" />
                  </span>
                  <h3 className="truncate text-sm font-bold text-slate-900">{header.title}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                    {totalItems}
                  </span>
                  {debouncedSearch && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15">
                      filtered
                    </span>
                  )}
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                </div>
                {(debouncedSearch || statusFilter !== 'all' || department !== 'All') && (
                  <button
                    onClick={() => { handleCardClick('all'); setDepartment('All'); }}
                    className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Column headers */}
              <div className="hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                <div className="col-span-3">User</div>
                <div className="col-span-2">Department</div>
                <div className="col-span-2">Permissions</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-2">Created</div>
                <div className="col-span-2 text-center">Actions</div>
              </div>

              <div className={`transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
                {users.length === 0 && !loading ? (
                  /* Empty state */
                  <div className="usr-fade-in flex flex-col items-center justify-center py-20 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -m-3 rounded-3xl bg-violet-100/60 blur-xl" />
                      <div className={`usr-pop relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow}`}>
                        <User className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h3 className="mt-5 text-base font-bold text-slate-800">No users found</h3>
                    <p className="mt-1 text-sm text-slate-500">Try adjusting your search, or create a new user.</p>
                    <button
                      onClick={() => setIsCreateOpen(true)}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" /> New User
                    </button>
                  </div>
                ) : (
                  <div key={listKey} className="divide-y divide-slate-100">
                    {users.map((usr, idx) => {
                      const cfg = getDeptConfig(usr.department);
                      const av = avatarUrl(usr);
                      const isVerified = !!usr.verified;

                      return (
                        <div
                          key={usr.id}
                          onClick={() => setSelectedUser(usr)}
                          className="usr-fade-up cursor-pointer"
                          style={{ animationDelay: `${Math.min(idx * 35, 350)}ms` }}
                        >
                          {/* Desktop row */}
                          <div className={`group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 md:grid md:grid-cols-12 ${cfg.hoverRow}`}>
                            <span className={`absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b transition-all duration-300 group-hover:h-2/3 ${cfg.accent}`} />

                            <div className="col-span-3 min-w-0">
                              <div className="flex items-center gap-3">
                                {av ? (
                                  <img src={av} alt={usr.name || 'User'} className="h-9 w-9 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110" />
                                ) : (
                                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110 ${cfg.avatar}`}>
                                    {getInitials(usr.name)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${cfg.nameHover}`}>
                                    {usr.name || 'Unnamed'}
                                  </p>
                                  <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${cfg.accentText}`}>
                                    View Profile <ArrowRight className="h-3 w-3" />
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="col-span-2 flex items-center">
                              <span className={`inline-flex items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`} title={usr.department}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
                                {usr.department || '—'}
                              </span>
                            </div>

                            <div className="col-span-2 truncate text-sm text-slate-600" title={usr.permissions}>
                              {usr.permissions || '—'}
                            </div>

                            <div className="col-span-1 flex justify-center">
                              {isVerified ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                                  Pending
                                </span>
                              )}
                            </div>

                            <div className="col-span-2 truncate text-xs text-slate-500">
                              {formatDate(usr.created)}
                            </div>

                            <div className="col-span-2 flex items-center justify-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); openEdit(usr); }} title="Edit user"
                                className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(usr); }} title="Move to trash"
                                className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Mobile card */}
                          <div className={`p-4 transition-colors duration-200 md:hidden ${cfg.hoverRow}`}>
                            <div className="flex items-start gap-3">
                              {av ? (
                                <img src={av} alt={usr.name || 'User'} className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white" />
                              ) : (
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white ${cfg.avatar}`}>
                                  {getInitials(usr.name)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{usr.name || 'Unnamed'}</p>
                                  {isVerified ? (
                                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      <span className="h-1 w-1 rounded-full bg-emerald-500" />Verified
                                    </span>
                                  ) : (
                                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      <span className="h-1 w-1 rounded-full bg-amber-500" />Pending
                                    </span>
                                  )}
                                </div>
                                {usr.emailVisibility !== false && usr.email && (
                                  <p className="mt-1 truncate text-xs text-slate-500">{usr.email}</p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                  {usr.department && (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${cfg.badge}`}>
                                      <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />{usr.department}
                                    </span>
                                  )}
                                  {usr.permissions && <span>{usr.permissions}</span>}
                                </div>
                                <div className="mt-2.5 flex items-center gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); openEdit(usr); }}
                                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 active:scale-95">
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(usr); }}
                                    className="inline-flex items-center gap-1 rounded-full bg-rose-50/70 px-3 py-1.5 text-[11px] font-semibold text-rose-500 transition-colors hover:bg-rose-100 active:scale-95">
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </button>
                                </div>
                              </div>
                              <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span>Rows per page</span>
                    <select
                      value={perPage}
                      onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:border-violet-400 focus:outline-none"
                    >
                      {PER_PAGE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <span className="tabular-nums text-slate-400">
                      · {start}–{end} of {totalItems}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {paginationRange.map((p, idx) =>
                      p === 'dots' ? (
                        <span key={`dots-${idx}`} className="px-1 text-xs font-bold text-slate-400">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`h-8 min-w-[2rem] rounded-lg px-2 text-xs font-bold tabular-nums transition-all duration-200 ${
                            p === safePage
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'border border-slate-200 text-slate-600 hover:border-violet-200 hover:text-violet-600'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* --------------------- Off-canvas: User detail --------------------- */}
      {selectedUser && (() => {
        const d = selectedUser;
        const cfg = getDeptConfig(d.department);
        const av = avatarUrl(d);
        return (
          <div className="fixed inset-0 z-50">
            <div
              className="usr-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedUser(null)}
            />

<aside className="usr-panel absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">              <div className={`h-1.5 w-full bg-gradient-to-r ${cfg.gradient}`} />

              {/* Header */}
              <div className="border-b border-slate-100 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {av ? (
                      <img src={av} alt={d.name || 'User'} className="h-14 w-14 flex-shrink-0 rounded-2xl object-cover shadow-md ring-2 ring-white" />
                    ) : (
                      <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-md ${cfg.avatar}`}>
                        {getInitials(d.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold leading-snug text-slate-900">{d.name || 'Unnamed'}</h2>
                      <p className="truncate text-sm text-slate-500">{d.emailVisibility !== false ? d.email || '—' : 'email hidden'}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {d.department && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {d.department}
                          </span>
                        )}
                        {d.verified ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            <AlertCircle className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 space-y-3 px-5 py-5">
                {[
                  { icon: Mail, tint: 'bg-emerald-50 text-emerald-600', label: 'Email', value: d.emailVisibility !== false ? (d.email || '—') : 'Email hidden', break: true },
                  { icon: Building2, tint: 'bg-sky-50 text-sky-600', label: 'Department', value: d.department || '—' },
                  { icon: Shield, tint: 'bg-violet-50 text-violet-600', label: 'Permissions', value: d.permissions || '—' },
                  { icon: KeyRound, tint: 'bg-amber-50 text-amber-600', label: 'Account Status', value: d.verified ? 'Verified' : 'Pending verification' },
                  { icon: RefreshCw, tint: 'bg-slate-100 text-slate-600', label: 'Created', value: formatDate(d.created) },
                  { icon: RefreshCw, tint: 'bg-slate-100 text-slate-600', label: 'Last Updated', value: formatDate(d.updated) },
                  { icon: User, tint: 'bg-indigo-50 text-indigo-600', label: 'User ID', value: d.id, mono: true },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="group/tile rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/[0.04]">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${row.tint} transition-transform duration-300 group-hover/tile:scale-110`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{row.label}</p>
                      </div>
                      <div className={`mt-2 text-sm font-semibold text-slate-900 ${row.mono ? 'font-mono text-xs' : ''} ${row.break ? 'break-all' : ''}`}>{row.value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Footer actions */}
              <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSelectedUser(null); openEdit(d); }}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-100 active:scale-[0.98]"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            </aside>
          </div>
        );
      })()}

      {/* ------------------- Edit user off-canvas form ------------------- */}
      {editingUser && (
        <div className="fixed inset-0 z-50">
          <div
            className="usr-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !saving && setEditingUser(null)}
          />

<aside className="usr-panel absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">            <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Edit User</p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">{editingUser.name || 'Unnamed'}</h2>
              </div>
              <button
                onClick={() => !saving && setEditingUser(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 px-5 py-5">
              {([
                ['name', 'Full Name *', 'text', 'e.g. Tejaswi Rao'],
                ['email', 'Email', 'email', 'name@company.com'],
                ['department', 'Department', 'text', 'e.g. Civil'],
                ['permissions', 'Permissions', 'text', 'e.g. admin / editor / viewer'],
              ] as const).map(([field, label, type, placeholder]) => (
                <div key={field}>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
                  <input
                    type={type}
                    value={form[field] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                  />
                </div>
              ))}

              {/* Optional password reset */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  <KeyRound className="h-3 w-3" />
                  Reset Password (optional)
                </p>
                <div className="space-y-3">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Footer — manual save only */}
            <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingUser(null)}
                  disabled={saving}
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ------------------------- Delete confirmation ------------------------ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="usr-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !deleteLoading && setDeleteTarget(null)}
          />
          <div className="usr-modal relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Move to trash?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">"{deleteTarget.name || 'Unnamed'}"</span> will be removed from this list and archived, so it can be recovered later if needed. They will no longer be able to sign in.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-95 disabled:opacity-60"
              >
                {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleteLoading ? 'Moving…' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- Create panel (your existing component) ------------------- */}
      {isCreateOpen && (
        <CreateUserPanel
          onSaved={() => {
            setIsCreateOpen(false);
            loadData(1);
            loadStats();
          }}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </div>
  );
}