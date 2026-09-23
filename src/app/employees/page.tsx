'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, User, Briefcase,
  X, Mail, Phone, Users, Building2,
  Plus, Database, Loader2, ArrowRight, ArrowUpRight, IdCard, Pencil, Trash2,
  RefreshCw, AlertCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbase';

/* ------------------------------ Departments ------------------------------ */

/* ★ FIXED department list — used by the filter dropdown AND the create/edit form */
const DEPARTMENTS = [
  'Software',
  'Purchases',
  'Sales',
  'Projects',
  'HR',
  'Accounts',
  'Network',
  'Tenders',
  'SEO',
  'Legal',
] as const;

/* --------------------- Department Color Configuration ---------------------
   Each department has its own dedicated color family (like IAS/IPS/Other
   on the officers page). Lookup is case-insensitive on the stored value. */

interface DeptStyle {
  badge: string;
  dot: string;
  avatar: string;
  accentText: string;
  nameHover: string;
  gradient: string;
  accent: string;
  glow: string;
  hoverRow: string;
  /* Pastel KPI card background + icon tint (mirrors the officers page STAT_CARDS look) */
  card: string;
  iconTint: string;
}

const DEPT_STYLES: Record<string, DeptStyle> = {
  software: {
    badge: 'bg-violet-50/80 text-violet-700 ring-1 ring-inset ring-violet-600/15',
    dot: 'bg-violet-500',
    avatar: 'from-violet-400 to-purple-600',
    accentText: 'text-violet-600',
    nameHover: 'group-hover:text-violet-700',
    gradient: 'from-violet-500 to-purple-600',
    accent: 'from-violet-400 to-purple-500',
    glow: 'shadow-violet-600/20',
    hoverRow: 'hover:bg-violet-50/50',
    card: 'from-violet-100 to-purple-100',
    iconTint: 'text-violet-600',
  },
  purchases: {
    badge: 'bg-amber-50/80 text-amber-700 ring-1 ring-inset ring-amber-600/20',
    dot: 'bg-amber-500',
    avatar: 'from-amber-400 to-orange-500',
    accentText: 'text-amber-600',
    nameHover: 'group-hover:text-amber-700',
    gradient: 'from-amber-500 to-orange-500',
    accent: 'from-amber-400 to-orange-500',
    glow: 'shadow-amber-600/20',
    hoverRow: 'hover:bg-amber-50/50',
    card: 'from-amber-100 to-orange-100',
    iconTint: 'text-amber-600',
  },
  sales: {
    badge: 'bg-emerald-50/80 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
    dot: 'bg-emerald-500',
    avatar: 'from-emerald-400 to-green-600',
    accentText: 'text-emerald-600',
    nameHover: 'group-hover:text-emerald-700',
    gradient: 'from-emerald-500 to-green-600',
    accent: 'from-emerald-400 to-green-500',
    glow: 'shadow-emerald-600/20',
    hoverRow: 'hover:bg-emerald-50/50',
    card: 'from-emerald-100 to-green-100',
    iconTint: 'text-emerald-600',
  },
  projects: {
    badge: 'bg-sky-50/80 text-sky-700 ring-1 ring-inset ring-sky-600/15',
    dot: 'bg-sky-500',
    avatar: 'from-sky-400 to-blue-600',
    accentText: 'text-sky-600',
    nameHover: 'group-hover:text-sky-700',
    gradient: 'from-sky-500 to-blue-600',
    accent: 'from-sky-400 to-blue-500',
    glow: 'shadow-blue-600/20',
    hoverRow: 'hover:bg-sky-50/50',
    card: 'from-sky-100 to-blue-100',
    iconTint: 'text-sky-600',
  },
  hr: {
    badge: 'bg-rose-50/80 text-rose-700 ring-1 ring-inset ring-rose-600/15',
    dot: 'bg-rose-500',
    avatar: 'from-rose-400 to-pink-600',
    accentText: 'text-rose-600',
    nameHover: 'group-hover:text-rose-700',
    gradient: 'from-rose-500 to-pink-600',
    accent: 'from-rose-400 to-pink-500',
    glow: 'shadow-rose-600/20',
    hoverRow: 'hover:bg-rose-50/50',
    card: 'from-rose-100 to-pink-100',
    iconTint: 'text-rose-600',
  },
  accounts: {
    badge: 'bg-indigo-50/80 text-indigo-700 ring-1 ring-inset ring-indigo-600/15',
    dot: 'bg-indigo-500',
    avatar: 'from-indigo-400 to-violet-600',
    accentText: 'text-indigo-600',
    nameHover: 'group-hover:text-indigo-700',
    gradient: 'from-indigo-500 to-violet-600',
    accent: 'from-indigo-400 to-violet-500',
    glow: 'shadow-indigo-600/20',
    hoverRow: 'hover:bg-indigo-50/50',
    card: 'from-indigo-100 to-violet-100',
    iconTint: 'text-indigo-600',
  },
  network: {
    badge: 'bg-cyan-50/80 text-cyan-700 ring-1 ring-inset ring-cyan-600/15',
    dot: 'bg-cyan-500',
    avatar: 'from-cyan-400 to-sky-600',
    accentText: 'text-cyan-600',
    nameHover: 'group-hover:text-cyan-700',
    gradient: 'from-cyan-500 to-sky-600',
    accent: 'from-cyan-400 to-sky-500',
    glow: 'shadow-cyan-600/20',
    hoverRow: 'hover:bg-cyan-50/50',
    card: 'from-cyan-100 to-sky-100',
    iconTint: 'text-cyan-600',
  },
  tenders: {
    badge: 'bg-orange-50/80 text-orange-700 ring-1 ring-inset ring-orange-600/20',
    dot: 'bg-orange-500',
    avatar: 'from-orange-400 to-red-500',
    accentText: 'text-orange-600',
    nameHover: 'group-hover:text-orange-700',
    gradient: 'from-orange-500 to-red-500',
    accent: 'from-orange-400 to-red-500',
    glow: 'shadow-orange-600/20',
    hoverRow: 'hover:bg-orange-50/50',
    card: 'from-orange-100 to-red-100',
    iconTint: 'text-orange-600',
  },
  seo: {
    badge: 'bg-fuchsia-50/80 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-600/15',
    dot: 'bg-fuchsia-500',
    avatar: 'from-fuchsia-400 to-pink-600',
    accentText: 'text-fuchsia-600',
    nameHover: 'group-hover:text-fuchsia-700',
    gradient: 'from-fuchsia-500 to-pink-600',
    accent: 'from-fuchsia-400 to-pink-500',
    glow: 'shadow-fuchsia-600/20',
    hoverRow: 'hover:bg-fuchsia-50/50',
    card: 'from-fuchsia-100 to-pink-100',
    iconTint: 'text-fuchsia-600',
  },
  legal: {
    badge: 'bg-slate-100/80 text-slate-700 ring-1 ring-inset ring-slate-500/20',
    dot: 'bg-slate-500',
    avatar: 'from-slate-500 to-slate-700',
    accentText: 'text-slate-600',
    nameHover: 'group-hover:text-slate-700',
    gradient: 'from-slate-500 to-slate-700',
    accent: 'from-slate-400 to-slate-600',
    glow: 'shadow-slate-600/20',
    hoverRow: 'hover:bg-slate-50',
    card: 'from-slate-200 to-slate-100',
    iconTint: 'text-slate-600',
  },
};

const FALLBACK_STYLE: DeptStyle = {
  badge: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15',
  dot: 'bg-gray-400',
  avatar: 'from-gray-400 to-gray-600',
  accentText: 'text-gray-600',
  nameHover: 'group-hover:text-gray-700',
  gradient: 'from-gray-500 to-gray-600',
  accent: 'from-gray-400 to-gray-500',
  glow: 'shadow-gray-600/20',
  hoverRow: 'hover:bg-gray-50',
  card: 'from-gray-100 to-gray-50',
  iconTint: 'text-gray-500',
};

/* --------------------- Dynamic colors for unlisted departments ---------------------
   The 10 departments above (from DEPARTMENTS) get their own hand-picked style.
   Any OTHER department name that shows up in the data (added directly in
   PocketBase, a typo, a future department, etc.) still gets a distinct, consistent
   color instead of falling back to plain gray — the same department name always
   maps to the same color, picked deterministically from its name.

   NOTE: every class name below is written out in full (not built with template
   strings) on purpose — Tailwind only generates CSS for class names it can find
   literally in the source, so a dynamically-built `bg-${color}-50` string would
   not compile and would render unstyled. Hues are chosen to stay visually
   distinct from the 10 fixed departments above. */
const DYNAMIC_PALETTE: DeptStyle[] = [
  {
    badge: 'bg-blue-50/80 text-blue-700 ring-1 ring-inset ring-blue-600/15',
    dot: 'bg-blue-500',
    avatar: 'from-blue-400 to-indigo-600',
    accentText: 'text-blue-600',
    nameHover: 'group-hover:text-blue-700',
    gradient: 'from-blue-500 to-indigo-600',
    accent: 'from-blue-400 to-indigo-500',
    glow: 'shadow-blue-600/20',
    hoverRow: 'hover:bg-blue-50/50',
    card: 'from-blue-100 to-indigo-100',
    iconTint: 'text-blue-600',
  },
  {
    badge: 'bg-teal-50/80 text-teal-700 ring-1 ring-inset ring-teal-600/15',
    dot: 'bg-teal-500',
    avatar: 'from-teal-400 to-cyan-600',
    accentText: 'text-teal-600',
    nameHover: 'group-hover:text-teal-700',
    gradient: 'from-teal-500 to-cyan-600',
    accent: 'from-teal-400 to-cyan-500',
    glow: 'shadow-teal-600/20',
    hoverRow: 'hover:bg-teal-50/50',
    card: 'from-teal-100 to-cyan-100',
    iconTint: 'text-teal-600',
  },
  {
    badge: 'bg-lime-50/80 text-lime-700 ring-1 ring-inset ring-lime-600/15',
    dot: 'bg-lime-500',
    avatar: 'from-lime-400 to-green-600',
    accentText: 'text-lime-600',
    nameHover: 'group-hover:text-lime-700',
    gradient: 'from-lime-500 to-green-600',
    accent: 'from-lime-400 to-green-500',
    glow: 'shadow-lime-600/20',
    hoverRow: 'hover:bg-lime-50/50',
    card: 'from-lime-100 to-green-100',
    iconTint: 'text-lime-600',
  },
  {
    badge: 'bg-purple-50/80 text-purple-700 ring-1 ring-inset ring-purple-600/15',
    dot: 'bg-purple-500',
    avatar: 'from-purple-400 to-fuchsia-600',
    accentText: 'text-purple-600',
    nameHover: 'group-hover:text-purple-700',
    gradient: 'from-purple-500 to-fuchsia-600',
    accent: 'from-purple-400 to-fuchsia-500',
    glow: 'shadow-purple-600/20',
    hoverRow: 'hover:bg-purple-50/50',
    card: 'from-purple-100 to-fuchsia-100',
    iconTint: 'text-purple-600',
  },
  {
    badge: 'bg-pink-50/80 text-pink-700 ring-1 ring-inset ring-pink-600/15',
    dot: 'bg-pink-500',
    avatar: 'from-pink-400 to-rose-600',
    accentText: 'text-pink-600',
    nameHover: 'group-hover:text-pink-700',
    gradient: 'from-pink-500 to-rose-600',
    accent: 'from-pink-400 to-rose-500',
    glow: 'shadow-pink-600/20',
    hoverRow: 'hover:bg-pink-50/50',
    card: 'from-pink-100 to-rose-100',
    iconTint: 'text-pink-600',
  },
  {
    badge: 'bg-yellow-50/80 text-yellow-700 ring-1 ring-inset ring-yellow-600/15',
    dot: 'bg-yellow-500',
    avatar: 'from-yellow-400 to-amber-600',
    accentText: 'text-yellow-600',
    nameHover: 'group-hover:text-yellow-700',
    gradient: 'from-yellow-500 to-amber-600',
    accent: 'from-yellow-400 to-amber-500',
    glow: 'shadow-yellow-600/20',
    hoverRow: 'hover:bg-yellow-50/50',
    card: 'from-yellow-100 to-amber-100',
    iconTint: 'text-yellow-600',
  },
  {
    badge: 'bg-red-50/80 text-red-700 ring-1 ring-inset ring-red-600/15',
    dot: 'bg-red-500',
    avatar: 'from-red-400 to-orange-600',
    accentText: 'text-red-600',
    nameHover: 'group-hover:text-red-700',
    gradient: 'from-red-500 to-orange-600',
    accent: 'from-red-400 to-orange-500',
    glow: 'shadow-red-600/20',
    hoverRow: 'hover:bg-red-50/50',
    card: 'from-red-100 to-orange-100',
    iconTint: 'text-red-600',
  },
  {
    badge: 'bg-zinc-100/80 text-zinc-700 ring-1 ring-inset ring-zinc-500/20',
    dot: 'bg-zinc-500',
    avatar: 'from-zinc-400 to-slate-600',
    accentText: 'text-zinc-600',
    nameHover: 'group-hover:text-zinc-700',
    gradient: 'from-zinc-500 to-slate-600',
    accent: 'from-zinc-400 to-slate-500',
    glow: 'shadow-zinc-600/20',
    hoverRow: 'hover:bg-zinc-50/50',
    card: 'from-zinc-200 to-slate-100',
    iconTint: 'text-zinc-600',
  },
];

/* Simple deterministic string hash — same department name always picks the same color */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDeptStyle(dept?: string): DeptStyle {
  const key = (dept || '').trim().toLowerCase();
  if (!key) return FALLBACK_STYLE;
  if (DEPT_STYLES[key]) return DEPT_STYLES[key];
  return DYNAMIC_PALETTE[hashString(key) % DYNAMIC_PALETTE.length];
}

/* --------------------------------- General helpers --------------------------------- */

/* SOFT DELETE — collection that archives a full snapshot of a record before
   it's removed from its source collection, so it can be recovered later.
   (Same archive collection used by the officers page.) */
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

const EMPTY_FORM = {
  name: '',
  designation: '',
  department: '',
  contact_number: '',
  email: '',
  photo_url: '',
};

/* ------------------------------ Animation helpers ------------------------------ */

function AnimationStyles() {
  return (
    <style>{`
      @keyframes empFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes empFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes empPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
      @keyframes empOverlay { from { opacity: 0; } to { opacity: 1; } }
      @keyframes empPanel { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes empModal { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes empBlobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(34px,26px) scale(1.06); } }
      @keyframes empBlobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.05); } }
      @keyframes empBlobC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-26px) scale(1.04); } }
      @keyframes empShimmer { 100% { transform: translateX(100%); } }

      .emp-fade-up { opacity: 0; animation: empFadeUp .65s cubic-bezier(.22,1,.36,1) forwards; }
      .emp-fade-in { opacity: 0; animation: empFadeIn .45s ease forwards; }
      .emp-pop { opacity: 0; animation: empPop .5s cubic-bezier(.34,1.56,.64,1) forwards; }
      .emp-overlay { animation: empOverlay .3s ease forwards; }
      .emp-panel { animation: empPanel .4s cubic-bezier(.32,.72,0,1) forwards; }
      .emp-modal { animation: empModal .35s cubic-bezier(.22,1,.36,1) forwards; }
      .emp-blob-a { animation: empBlobA 18s ease-in-out infinite; }
      .emp-blob-b { animation: empBlobB 22s ease-in-out infinite; }
      .emp-blob-c { animation: empBlobC 26s ease-in-out infinite; }
      .emp-skeleton { position: relative; overflow: hidden; background: #edeaf8; border-radius: .75rem; }
      .emp-skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: empShimmer 1.5s infinite; }

      @media (prefers-reduced-motion: reduce) {
        .emp-fade-up, .emp-fade-in, .emp-pop, .emp-panel, .emp-modal { animation: none; opacity: 1; }
        .emp-blob-a, .emp-blob-b, .emp-blob-c { animation: none; }
        .emp-skeleton::after { animation: none; }
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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  /* ★ Department filter — driven by the dropdown ('all' or a department name) */
  const [selectedDept, setSelectedDept] = useState<string>('all');

  /* CREATE / EDIT form panel */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* DELETE mode — confirmation modal state */
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Stats (per-department counts + total) */
  const [deptStats, setDeptStats] = useState<{ name: string; count: number }[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  /* Pagination state */
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [perPage, setPerPage] = useState(50);

  /* Off-canvas detail panel state */
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  /* The employees table's DOM node, so clicking a KPI/stat card can
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
  }, [currentPage, selectedDept, perPage, debouncedSearch]);

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (!loading && currentPage > 1 && employees.length === 0) {
      setCurrentPage((p) => p - 1);
    }
  }, [loading, currentPage, employees.length]);

  useEffect(() => {
    if (deleteTarget || isFormOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [deleteTarget, isFormOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (isFormOpen) return;
      if (deleteTarget && !deleteLoading) { setDeleteTarget(null); setDeleteError(null); return; }
      if (selectedEmployee) setSelectedEmployee(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEmployee, isFormOpen, deleteTarget, deleteLoading]);

  /* ------------------------------ Data Loading ----------------------------- */

  const SEARCHABLE_FIELDS = ['name', 'designation', 'department', 'contact_number', 'email'];

  async function fetchPage(page: number, per: number, query: string, dept: string) {
    const filters: string[] = [];
    if (dept !== 'all') {
      const d = dept.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      filters.push(`department = "${d}"`);
    }
    if (query) {
      const q = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      filters.push(`(${SEARCHABLE_FIELDS.map((f) => `${f} ~ "${q}"`).join(' || ')})`);
    }
    const opts: any = { sort: 'name' };
    if (filters.length) opts.filter = filters.join(' && ');
    return pb.collection('employees').getList(page, per, opts);
  }

  async function loadData(page: number) {
    const requestId = ++loadToken.current;
    try {
      setLoading(true);
      const result = await fetchPage(page, perPage, debouncedSearch, selectedDept);

      if (requestId !== loadToken.current) return;

      setEmployees(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, Math.ceil(result.totalItems / perPage)));
    } catch (error) {
      if (requestId === loadToken.current) {
        console.error('Error loading employees:', error);
        setEmployees([]);
      }
    } finally {
      if (requestId === loadToken.current) setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const all = await pb.collection('employees').getFullList();
      const map = new Map<string, number>();
      for (const e of all) {
        const d = String(e.department || '').trim();
        if (d) map.set(d, (map.get(d) || 0) + 1);
      }
      const depts = [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      setDeptStats(depts);
      setTotalCount(all.length);
    } catch { /* non-critical */ }
  }

  /* -------------------------------- Helpers -------------------------------- */

  const handleCardClick = (dept: string) => {
    setSelectedDept(dept);
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

  const openCreate = () => {
    setEditingEmployee(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingEmployee(emp);
    setForm({
      name: emp.name || '',
      designation: emp.designation || '',
      department: emp.department || '',
      contact_number: emp.contact_number || '',
      email: emp.email || '',
      photo_url: emp.photo_url || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.department) { setFormError('Please select a department.'); return; }
    try {
      setSaving(true);
      setFormError(null);
      if (editingEmployee) {
        await pb.collection('employees').update(editingEmployee.id, form);
      } else {
        await pb.collection('employees').create(form);
      }
      setIsFormOpen(false);
      setEditingEmployee(null);
      await Promise.all([loadData(currentPage), loadStats()]);
    } catch (err: any) {
      console.error('Save failed:', err);
      const status = err?.status;
      let message = err?.message || 'Failed to save this employee. Please try again.';
      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) message = 'Permission denied — check the Create/Update rules on the "employees" collection (PocketBase Admin → Collection → API Rules).';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (emp: any) => {
    setDeleteError(null);
    setDeleteTarget(emp);
  };

  /* SOFT DELETE — archive a full snapshot of the record into `deleted_records`
     first, then remove it from the `employees` collection. If the archive
     step fails, the record is left untouched (nothing is lost). */
  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    let failedStep: 'archive' | 'delete' = 'archive';

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const { id: originalId, ...recordData } = deleteTarget;

      await pb.collection(ARCHIVE_COLLECTION).create({
        original_collection: 'employees',
        original_id: originalId,
        record_type: 'Employee',
        record_data: recordData,
        deleted_at: new Date().toISOString(),
      });

      failedStep = 'delete';
      await pb.collection('employees').delete(deleteTarget.id);

      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      if (selectedEmployee?.id === deletedId) setSelectedEmployee(null);
      if (editingEmployee?.id === deletedId) { setEditingEmployee(null); setIsFormOpen(false); }

      await Promise.all([loadData(currentPage), loadStats()]);
    } catch (err: any) {
      console.error('Delete failed:', err);
      const status = err?.status;
      const targetCollection = failedStep === 'archive' ? ARCHIVE_COLLECTION : 'employees';

      let message = failedStep === 'archive'
        ? 'Failed to archive this record before deleting it. Please try again.'
        : 'This record was archived, but the delete step failed. Please try again.';

      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) {
        message = `Permission denied — check the ${failedStep === 'archive' ? 'Create' : 'Delete'} rule on the "${targetCollection}" collection (PocketBase Admin → Collection → API Rules).`;
      } else if (status === 404) message = 'This record was not found — it may have already been deleted.';

      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* Page header per selected department — mirrors HEADER_CONFIG */
  const deptStyle = getDeptStyle(selectedDept === 'all' ? undefined : selectedDept);
  const header = selectedDept === 'all'
    ? { title: 'Employees Directory', subtitle: 'Browse and manage all employee records', icon: Users, gradient: 'from-violet-500 to-indigo-600', glow: 'shadow-violet-600/20' }
    : { title: `${selectedDept} Department`, subtitle: 'Employee records', icon: Building2, gradient: deptStyle.gradient, glow: deptStyle.glow };
  const HeaderIcon = header.icon;

  /* Pagination derived values */
  const safePage = Math.min(currentPage, totalPages);
  const paginationRange = getPaginationRange(safePage, totalPages);
  const start = employees.length > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const end = debouncedSearch
    ? (employees.length > 0 ? start + employees.length - 1 : 0)
    : Math.min(currentPage * perPage, totalItems);

  const listKey = `${selectedDept}-${currentPage}-${debouncedSearch}-${perPage}`;

  /* KPI cards — Total + top 3 departments by count (mirrors STAT_CARDS) */
  const statCards = [
    { key: 'all', label: 'Total Employees', caption: 'All departments', icon: Users,
      card: 'from-violet-100 to-purple-100', iconTint: 'text-violet-600',
      accent: 'from-violet-400 to-purple-500', count: totalCount },
    ...deptStats.slice(0, 3).map((d) => {
      const st = getDeptStyle(d.name);
      return {
        key: d.name, label: d.name, caption: 'Department', icon: Building2,
        card: st.card, iconTint: st.iconTint,
        accent: st.accent, count: d.count,
      };
    }),
  ];
  while (statCards.length < 4) {
    statCards.push({
      key: `placeholder-${statCards.length}`, label: '—', caption: 'No data yet', icon: Building2,
      card: 'from-slate-100 to-slate-50', iconTint: 'text-slate-400',
      accent: 'from-slate-300 to-slate-400', count: 0,
    });
  }

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading && employees.length === 0) {
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
              <div className="emp-skeleton h-9 w-9 !rounded-xl" />
              <div className="space-y-2">
                <div className="emp-skeleton h-4 w-32 !rounded-full" />
                <div className="emp-skeleton h-3 w-44 !rounded-full" />
              </div>
            </div>
            <div className="emp-skeleton h-10 w-40 !rounded-full" />
          </div>

          <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="emp-skeleton h-[196px] !rounded-3xl" />
              ))}
            </div>

            <div className="emp-skeleton h-[76px] !rounded-3xl" />

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                <div className="emp-skeleton h-4 w-40 !rounded-full" />
                <div className="emp-skeleton h-5 w-12 !rounded-full" />
              </div>
              <div className="divide-y divide-slate-100">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="emp-skeleton h-9 w-9 !rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="emp-skeleton h-3.5 w-1/3 !rounded-full" />
                      <div className="emp-skeleton h-3 w-1/5 !rounded-full" />
                    </div>
                    <div className="emp-skeleton h-3.5 w-24 hidden md:block !rounded-full" />
                    <div className="emp-skeleton h-5 w-16 hidden md:block !rounded-full" />
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
        <div className="emp-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="emp-blob-b absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="emp-blob-c absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
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
                <p className="truncate text-sm font-bold text-slate-900">Employees</p>
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
              onClick={openCreate}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              Add Employee
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------------ Page Header ----------------------------- */}
          <header className="emp-fade-up flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow} ring-1 ring-inset ring-white/30`}>
                <HeaderIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Employees · Management
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-[28px]">{header.title}</h1>
                <p className="mt-0.5 text-sm text-slate-500">{header.subtitle}</p>
              </div>
            </div>
          </header>

          {/* ------------------------------ Dept Stats ------------------------------ */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-5">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              const active = selectedDept === stat.key;
              const pct = totalCount > 0 ? Math.round((stat.count / totalCount) * 100) : 0;

              return (
                <button
                  key={stat.key}
                  onClick={() => handleCardClick(stat.key)}
                  style={{ animationDelay: `${90 + i * 90}ms` }}
                  className={`emp-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98] ring-1 ring-white/70 ${stat.card} ${
                    active ? 'shadow-md shadow-slate-900/10' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <p className="truncate pt-1.5 text-sm font-semibold text-slate-600" title={stat.label}>{stat.label}</p>
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

                  <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/60">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stat.accent} transition-all duration-700 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </section>

          {/* ------------------------------- Search Bar ----------------------------- */}
          <section className="emp-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 lg:p-5" style={{ animationDelay: '420ms' }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employees by name, designation, email or contact..."
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

              {/* ★ DEPARTMENT FILTER DROPDOWN — fixed list */}
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedDept}
                  onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-48"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>


            </div>
          </section>

          {/* --------------------------------- Table -------------------------------- */}
          <section ref={tableRef} className="emp-fade-up" style={{ animationDelay: '500ms' }}>
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
                  {(debouncedSearch || selectedDept !== 'all') && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15">
                      filtered
                    </span>
                  )}
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                </div>
                {(debouncedSearch || selectedDept !== 'all') && (
                  <button
                    onClick={() => handleCardClick('all')}
                    className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Column headers */}
              <div className="hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                <div className="col-span-3">Name</div>
                <div className="col-span-3">Designation</div>
                <div className="col-span-2">Department</div>
                <div className="col-span-2">Email</div>
                <div className="col-span-1">Contact</div>
                <div className="col-span-1 text-center">Actions</div>
              </div>

              <div className={`transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
                {employees.length === 0 && !loading ? (
                  /* Empty state */
                  <div className="emp-fade-in flex flex-col items-center justify-center py-20 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -m-3 rounded-3xl bg-violet-100/60 blur-xl" />
                      <div className={`emp-pop relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow}`}>
                        <User className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h3 className="mt-5 text-base font-bold text-slate-800">No employees found</h3>
                    <p className="mt-1 text-sm text-slate-500">Try adjusting your search, or add a new employee.</p>
                    <button
                      onClick={openCreate}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" /> Add Employee
                    </button>
                  </div>
                ) : (
                  <div key={listKey} className="divide-y divide-slate-100">
                    {employees.map((emp, idx) => {
                      const cfg = getDeptStyle(emp.department);

                      return (
                        <div
                          key={emp.id}
                          onClick={() => setSelectedEmployee(emp)}
                          className="emp-fade-up cursor-pointer"
                          style={{ animationDelay: `${Math.min(idx * 35, 350)}ms` }}
                        >
                          {/* Desktop row */}
                          <div className={`group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 md:grid md:grid-cols-12 ${cfg.hoverRow}`}>
                            <span className={`absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b transition-all duration-300 group-hover:h-2/3 ${cfg.accent}`} />

                            <div className="col-span-3 min-w-0">
                              <div className="flex items-center gap-3">
                                {emp.photo_url ? (
                                  <img
                                    src={emp.photo_url}
                                    alt={emp.name || 'Employee'}
                                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110"
                                  />
                                ) : (
                                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110 ${cfg.avatar}`}>
                                    {getInitials(emp.name)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${cfg.nameHover}`}>
                                    {emp.name || 'N/A'}
                                  </p>
                                  <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${cfg.accentText}`}>
                                    View Profile <ArrowRight className="h-3 w-3" />
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="col-span-3 truncate text-sm font-medium text-slate-800" title={emp.designation}>
                              {emp.designation || '—'}
                            </div>
                            <div className="col-span-2 flex items-center">
                              <span className={`inline-flex items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`} title={emp.department}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
                                {emp.department || '—'}
                              </span>
                            </div>
                            <div className="col-span-2 truncate text-xs text-slate-600" title={emp.email}>
                              {emp.email || '—'}
                            </div>
                            <div className="col-span-1 truncate text-xs text-slate-600">
                              {emp.contact_number || '—'}
                            </div>
                            <div className="col-span-1 flex items-center justify-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }} title="Edit employee"
                                className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(emp); }} title="Move to trash"
                                className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Mobile card */}
                          <div className={`p-4 transition-colors duration-200 md:hidden ${cfg.hoverRow}`}>
                            <div className="flex items-start gap-3">
                              {emp.photo_url ? (
                                <img
                                  src={emp.photo_url}
                                  alt={emp.name || 'Employee'}
                                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white"
                                />
                              ) : (
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white ${cfg.avatar}`}>
                                  {getInitials(emp.name)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{emp.name || 'N/A'}</p>
                                  <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.badge}`}>
                                    <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />
                                    {emp.department || '—'}
                                  </span>
                                </div>
                                {emp.designation && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{emp.designation}</p>}
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                  {emp.email && <span className="truncate">{emp.email}</span>}
                                  {emp.contact_number && <span>{emp.contact_number}</span>}
                                </div>
                                <div className="mt-2.5 flex items-center gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 active:scale-95">
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(emp); }}
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

      {/* --------------------- Off-canvas: Employee detail --------------------- */}
      {selectedEmployee && (() => {
        const d = selectedEmployee;
        const cfg = getDeptStyle(d.department);
        return (
          <div className="fixed inset-0 z-50">
            <div
              className="emp-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedEmployee(null)}
            />

<aside className="emp-panel absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">              <div className={`h-1.5 w-full bg-gradient-to-r ${cfg.gradient}`} />

              {/* Header */}
              <div className="border-b border-slate-100 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {d.photo_url ? (
                      <img src={d.photo_url} alt={d.name || 'Employee'} className="h-14 w-14 flex-shrink-0 rounded-2xl object-cover shadow-md ring-2 ring-white" />
                    ) : (
                      <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-md ${cfg.avatar}`}>
                        {getInitials(d.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold leading-snug text-slate-900">{d.name || 'N/A'}</h2>
                      <p className="truncate text-sm text-slate-500">{d.designation || '—'}</p>
                      <div className="mt-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {d.department || 'No department'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEmployee(null)}
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
                  { icon: Briefcase, tint: 'bg-violet-50 text-violet-600', label: 'Designation', value: d.designation || '—' },
                  { icon: Building2, tint: 'bg-sky-50 text-sky-600', label: 'Department', value: d.department || '—' },
                  { icon: Mail, tint: 'bg-emerald-50 text-emerald-600', label: 'Email', value: d.email || '—', break: true },
                  { icon: Phone, tint: 'bg-amber-50 text-amber-600', label: 'Contact Number', value: d.contact_number || '—' },
                  { icon: IdCard, tint: 'bg-indigo-50 text-indigo-600', label: 'Employee ID', value: d.id, mono: true },
                  { icon: RefreshCw, tint: 'bg-slate-100 text-slate-600', label: 'Created', value: formatDate(d.created) },
                  { icon: RefreshCw, tint: 'bg-slate-100 text-slate-600', label: 'Last Updated', value: formatDate(d.updated) },
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
                    onClick={() => { setSelectedEmployee(null); openEdit(d); }}
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

      {/* ------------------- Create / Edit off-canvas form ------------------- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="emp-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !saving && setIsFormOpen(false)}
          />

<aside className="emp-panel absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">            <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {editingEmployee ? 'Edit Employee' : 'New Employee'}
                </p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">
                  {editingEmployee ? (editingEmployee.name || 'Unnamed') : 'Add Details'}
                </h2>
              </div>
              <button
                onClick={() => !saving && setIsFormOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Tejaswi Rao"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</label>
                <input
                  type="text"
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  placeholder="e.g. Site Engineer"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
              </div>

              {/* ★ DEPARTMENT DROPDOWN — fixed list, required */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Department *</label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className={`w-full cursor-pointer appearance-none rounded-xl border bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 ${
                      form.department
                        ? 'border-slate-200 text-slate-900 focus:border-violet-400'
                        : 'border-slate-200 text-slate-400 focus:border-violet-400'
                    }`}
                  >
                    <option value="" disabled>Select department…</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                {/* Live color preview of the selected department */}
                {form.department && (
                  <div className="mt-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getDeptStyle(form.department).badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${getDeptStyle(form.department).dot}`} />
                      {form.department}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Number</label>
                <input
                  type="tel"
                  value={form.contact_number}
                  onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
                  placeholder="+91 ..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Photo URL</label>
                <input
                  type="url"
                  value={form.photo_url}
                  onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
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
                  onClick={() => setIsFormOpen(false)}
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
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {saving ? 'Saving...' : editingEmployee ? 'Save Changes' : 'Add Employee'}
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
            className="emp-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !deleteLoading && setDeleteTarget(null)}
          />
          <div className="emp-modal relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Move to trash?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">"{deleteTarget.name || 'Unnamed'}"</span> will be removed from this list and archived, so it can be recovered later if needed.
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
    </div>
  );
}