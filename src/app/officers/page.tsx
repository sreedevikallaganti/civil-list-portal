'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, User, Shield, Briefcase,
  MapPin, GraduationCap, X, Mail, Phone, Users, Building2,
  Plus, Database, Loader2, ArrowRight, ArrowUpRight, Contact, Pencil, Trash2, AlertCircle,
  CalendarDays, TrendingUp, Star,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit } from '@/lib/roles';
import KeyPeoplePanel, { useKeyPeopleCount } from '@/components/meetings/KeyPeoplePanel';
import OfficerMeetings from '@/components/officers/OfficerMeetings';
import { OfficerDetailsGrid, OfficerOccasions } from '@/components/officers/OfficerProfile';
import Link from 'next/link';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';
import { logActivity } from '@/lib/activity';
import CreateOfficerPanel from '@/components/CreateOfficerPanel';
import Tooltip from '@/components/Tooltip';
import KeyPersonStar, { KeyPersonToggle } from '@/components/KeyPersonStar';
import {
  CADRES, OFFICER_COLLECTION, OFFICER_SERVICES, OFFICER_STATUSES, SERVICE_FULL_NAME, cadreFilter, officerSearchFilter,
  pbQuote, serviceOf, toDirectoryOfficer, type OfficerService,
} from '@/lib/officerDirectory';

/** Officer filters (contacts have no cadre / batch / status, so they're left out while one is set). */
type OfficerFilters = { cadre: string; batch: string; status: string };
const NO_FILTERS: OfficerFilters = { cadre: '', batch: '', status: '' };
const BATCH_YEARS = Array.from({ length: new Date().getFullYear() - 1984 }, (_, i) => String(new Date().getFullYear() - i));

/** What the page lists: everything, one service, or the other contacts. */
type DirType = 'all' | OfficerService | 'Other';
type RecordType = OfficerService | 'Other';

/* ------------------------------- Tooltips ------------------------------- */

/** What each column means — shown when hovering a column heading. */
const COLUMN_HELP: Record<string, string> = {
  Name: 'Full name — hover a name for the officer’s details, click the row for the full profile.',
  'Officer ID': 'Service identification number of the officer.',
  Batch: 'Year the officer joined the service.',
  Cadre: 'State cadre the officer is allotted to.',
  Status: 'Serving, on deputation, under training, awaiting posting or under suspension.',
  'Current Position': 'Present posting / designation.',
  Type: 'IAS — Administrative · IPS — Police · IFS — Forest · IRS — Revenue Service.',
  Actions: 'Edit the record, or delete it permanently (asks to confirm).',
  Category: 'Kind of contact (e.g. Government, Private, Media).',
  Designation: 'The contact’s role or title.',
  Organization: 'Department, company or organisation.',
  Contact: 'Phone number.',
};

const SERVICE_NAME: Record<string, string> = { ...SERVICE_FULL_NAME, Other: 'Other contact' };

function ColumnHead({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <Tooltip content={COLUMN_HELP[label]} className="cursor-help border-b border-dotted border-slate-300">
        {label}
      </Tooltip>
    </div>
  );
}

/** Empty, or a placeholder such as "-", "—", "N/A" → nothing worth a tooltip. */
const isBlank = (value: unknown) =>
  /^(|-+|—+|–+|n\/?a|na|nil|none|null|undefined)$/i.test(String(value ?? '').trim());

/** "Label: value" tooltip for one cell — or null (no tooltip at all) when there is no real value. */
function cellTip(label: string, value: unknown): ReactNode {
  if (isBlank(value)) return null;
  return (
    <span>
      <span className="font-semibold text-violet-200">{label}: </span>
      {String(value).trim()}
    </span>
  );
}

/** Rich card shown when hovering an officer's name. */
function OfficerCardTip({ officer, label, initials, avatar }: { officer: any; label: string; initials: string; avatar: string }) {
  const isContact = officer.type === 'Other';
  const rows: [string, unknown][] = isContact
    ? [
        ['Category', officer.category],
        ['Designation', officer.designation],
        ['Organization', officer.organization || officer.company_name],
        ['Phone', officer.contact_number],
        ['Email', officer.email],
      ]
    : [
        ['Position', officer.current_position],
        ['Officer ID', officer.officer_id],
        ['Batch', officer.batch_year],
        ['Cadre', officer.cadre],
        ['Status', officer.status],
        ['Phone', officer.contact_number],
        ['Email', officer.email],
      ];
  const filled = rows.filter(([, v]) => !isBlank(v));
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${avatar}`}>{initials}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">{officer.name || 'N/A'}</p>
          <p className="text-[11px] text-violet-200">{SERVICE_NAME[officer.type] || label}</p>
        </div>
      </div>
      {filled.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-white/10 pt-2.5">
          {filled.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-400">{k}</dt>
              <dd className="break-words text-slate-100">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-slate-400">No other details recorded.</p>
      )}
      <p className="mt-2.5 text-[10px] text-slate-400">Click to open the full profile</p>
    </div>
  );
}

/* --------------------------- Type Color Configuration --------------------------- */

const TYPE_CONFIG: Record<string, {
  label: string;
  badge: string;
  dot: string;
  avatar: string;
  accentText: string;
  nameHover: string;
  panelGradient: string;
  buttonGradient: string;
  blurA: string;
  blurB: string;
  glow: string;
}> = {
  IAS: {
    label: 'IAS',
    badge: 'bg-sky-50/80 text-sky-700 ring-1 ring-inset ring-sky-600/15',
    dot: 'bg-sky-500',
    avatar: 'from-sky-400 to-blue-600',
    accentText: 'text-sky-600',
    nameHover: 'group-hover:text-sky-700',
    panelGradient: 'from-slate-900 via-slate-900 to-blue-950',
    buttonGradient: 'from-sky-500 to-blue-600',
    blurA: 'bg-sky-300/30',
    blurB: 'bg-indigo-400/25',
    glow: 'shadow-blue-600/20',
  },
  IPS: {
    label: 'IPS',
    badge: 'bg-indigo-50/80 text-indigo-700 ring-1 ring-inset ring-indigo-600/15',
    dot: 'bg-indigo-500',
    avatar: 'from-indigo-400 to-violet-600',
    accentText: 'text-indigo-600',
    nameHover: 'group-hover:text-indigo-700',
    panelGradient: 'from-slate-900 via-slate-900 to-violet-950',
    buttonGradient: 'from-indigo-500 to-violet-600',
    blurA: 'bg-violet-300/30',
    blurB: 'bg-indigo-300/25',
    glow: 'shadow-indigo-600/20',
  },
  IFS: {
    label: 'IFS',
    badge: 'bg-emerald-50/80 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
    dot: 'bg-emerald-500',
    avatar: 'from-emerald-400 to-teal-600',
    accentText: 'text-emerald-600',
    nameHover: 'group-hover:text-emerald-700',
    panelGradient: 'from-slate-900 via-slate-900 to-emerald-950',
    buttonGradient: 'from-emerald-500 to-teal-600',
    blurA: 'bg-emerald-300/30',
    blurB: 'bg-teal-300/25',
    glow: 'shadow-emerald-600/20',
  },
  IRS: {
    label: 'IRS',
    badge: 'bg-rose-50/80 text-rose-700 ring-1 ring-inset ring-rose-600/15',
    dot: 'bg-rose-500',
    avatar: 'from-rose-400 to-pink-600',
    accentText: 'text-rose-600',
    nameHover: 'group-hover:text-rose-700',
    panelGradient: 'from-slate-900 via-slate-900 to-rose-950',
    buttonGradient: 'from-rose-500 to-pink-600',
    blurA: 'bg-rose-300/30',
    blurB: 'bg-pink-300/25',
    glow: 'shadow-rose-600/20',
  },
  Other: {
    label: 'Other',
    badge: 'bg-amber-50/80 text-amber-700 ring-1 ring-inset ring-amber-600/20',
    dot: 'bg-amber-500',
    avatar: 'from-amber-400 to-orange-500',
    accentText: 'text-amber-600',
    nameHover: 'group-hover:text-amber-700',
    panelGradient: 'from-slate-900 via-slate-900 to-orange-950',
    buttonGradient: 'from-amber-500 to-orange-600',
    blurA: 'bg-amber-300/30',
    blurB: 'bg-orange-300/25',
    glow: 'shadow-amber-600/20',
  },
};

/* PocketBase collection for each record type (used for edit/delete) */
const COLLECTION_FOR: Record<string, string> = { ...OFFICER_COLLECTION, Other: 'other_contacts' };

/* SOFT DELETE — collection that archives a full snapshot of a record before
   it's removed from its source collection, so it can be recovered later. */
const ARCHIVE_COLLECTION = 'deleted_records';

function normalizeOther(o: any) {
  const n: any = { ...o, type: 'Other' };
  if (o.designation) n.current_position = o.designation;
  if (o.contact_number) n.phone = o.contact_number;
  return n;
}

/* Pastel KPI stat cards — reference style (icon = component, iconTint = color class) */
const STAT_CARDS = [
  {
    key: 'all' as const, label: 'Total Records', caption: 'All directory entries', icon: Users,
    card: 'from-violet-100 to-purple-100', iconTint: 'text-violet-600',
    accent: 'from-violet-400 to-purple-500',
  },
  {
    key: 'IAS' as const, label: 'IAS Officers', caption: 'Administrative service', icon: Briefcase,
    card: 'from-sky-100 to-blue-100', iconTint: 'text-sky-600',
    accent: 'from-sky-400 to-blue-500',
  },
  {
    key: 'IPS' as const, label: 'IPS Officers', caption: 'Police service', icon: Shield,
    card: 'from-indigo-100 to-violet-100', iconTint: 'text-indigo-600',
    accent: 'from-indigo-400 to-violet-500',
  },
  {
    key: 'IFS' as const, label: 'IFS Officers', caption: 'Forest service', icon: GraduationCap,
    card: 'from-emerald-100 to-teal-100', iconTint: 'text-emerald-600',
    accent: 'from-emerald-400 to-teal-500',
  },
  {
    key: 'IRS' as const, label: 'IRS Officers', caption: 'Revenue service', icon: TrendingUp,
    card: 'from-rose-100 to-pink-100', iconTint: 'text-rose-600',
    accent: 'from-rose-400 to-pink-500',
  },
  {
    key: 'Other' as const, label: 'Other Contacts', caption: 'Additional directory', icon: Building2,
    card: 'from-amber-100 to-orange-100', iconTint: 'text-amber-600',
    accent: 'from-amber-400 to-orange-500',
  },
];

/* Page header per selected type */
const HEADER_CONFIG = {
  all:   { title: 'Officers Directory', subtitle: 'Browse and manage all officers and contacts', icon: Users,     gradient: 'from-violet-500 to-indigo-600', glow: 'shadow-violet-600/20' },
  IAS:   { title: 'IAS Officers',       subtitle: 'Indian Administrative Service records',        icon: Briefcase, gradient: 'from-sky-500 to-blue-600',      glow: 'shadow-blue-600/20' },
  IPS:   { title: 'IPS Officers',       subtitle: 'Indian Police Service records',                icon: Shield,    gradient: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-600/20' },
  IFS:   { title: 'IFS Officers',       subtitle: 'Indian Forest Service records',                icon: GraduationCap, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-600/20' },
  IRS:   { title: 'IRS Officers',       subtitle: 'Indian Revenue Service records',               icon: TrendingUp, gradient: 'from-rose-500 to-pink-600',    glow: 'shadow-rose-600/20' },
  Other: { title: 'Other Contacts',     subtitle: 'Additional contacts directory',                icon: Contact,   gradient: 'from-amber-500 to-orange-500',  glow: 'shadow-amber-600/20' },
} as const;

const PER_PAGE_OPTIONS = [10, 25, 50];

/* Generates page numbers with ellipsis, e.g. [1, '...', 4, 5, 6, '...', 12] */
function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}


/* ------------------------------ Animation helpers ------------------------------ */

function AnimationStyles() {
  return (
    <style>{`
      @keyframes offFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes offFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes offPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
      @keyframes offOverlay { from { opacity: 0; } to { opacity: 1; } }
      @keyframes offPanel { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes offModal { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes offBlobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(34px,26px) scale(1.06); } }
      @keyframes offBlobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.05); } }
      @keyframes offBlobC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-26px) scale(1.04); } }
      @keyframes offShimmer { 100% { transform: translateX(100%); } }

      .off-fade-up { opacity: 0; animation: offFadeUp .65s cubic-bezier(.22,1,.36,1) forwards; }
      .off-fade-in { opacity: 0; animation: offFadeIn .45s ease forwards; }
      .off-pop { opacity: 0; animation: offPop .5s cubic-bezier(.34,1.56,.64,1) forwards; }
      .off-overlay { animation: offOverlay .3s ease forwards; }
      .off-panel { animation: offPanel .4s cubic-bezier(.32,.72,0,1) forwards; }
      .off-modal { animation: offModal .35s cubic-bezier(.22,1,.36,1) forwards; }
      .off-blob-a { animation: offBlobA 18s ease-in-out infinite; }
      .off-blob-b { animation: offBlobB 22s ease-in-out infinite; }
      .off-blob-c { animation: offBlobC 26s ease-in-out infinite; }
      .off-skeleton { position: relative; overflow: hidden; background: #edeaf8; border-radius: .75rem; }
      .off-skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: offShimmer 1.5s infinite; }

      @media (prefers-reduced-motion: reduce) {
        .off-fade-up, .off-fade-in, .off-pop, .off-panel, .off-modal { animation: none; opacity: 1; }
        .off-blob-a, .off-blob-b, .off-blob-c { animation: none; }
        .off-skeleton::after { animation: none; }
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


export default function OfficersPage() {
  const { user } = useAuth();
  const [keyPeopleOpen, setKeyPeopleOpen] = useState(false);
  const keyPeopleCount = useKeyPeopleCount();
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<DirType>('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelOfficerType, setPanelOfficerType] = useState<RecordType | null>('IAS');

  /* EDIT MODE — the officer being edited (a record with `id` + `type`) */
  const [editingOfficer, setEditingOfficer] = useState<any>(null);

  /* DELETE MODE — confirmation modal state */
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Counts for each type */
  const [counts, setCounts] = useState<Record<RecordType, number>>({ IAS: 0, IPS: 0, IFS: 0, IRS: 0, Other: 0 });
  const setCount = (type: RecordType, n: number) => setCounts((c) => ({ ...c, [type]: n }));

  /* Pagination state */
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [perPage, setPerPage] = useState(50);

  /* Off-canvas panel state */
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);

  /* The officers table's DOM node, so clicking a KPI/stat card can
     smooth-scroll straight to it instead of leaving the user to scroll
     past the header/KPI cards manually. */
  const tableRef = useRef<HTMLDivElement>(null);

  /* SERVER-SIDE SEARCH — debounced so we don't hit PocketBase on every keystroke */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadToken = useRef(0);

  /* FILTERS — cadre / state, batch year, status (officers only) */
  const [filters, setFilters] = useState<OfficerFilters>(NO_FILTERS);
  const filtersOn = Boolean(filters.cadre || filters.batch || filters.status);
  const setFilter = (key: keyof OfficerFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setCurrentPage(1);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, selectedType, perPage, debouncedSearch, filters]);

  useEffect(() => {
    if (!loading && currentPage > 1 && officers.length === 0) {
      setCurrentPage((p) => p - 1);
    }
  }, [loading, currentPage, officers.length]);

  useEffect(() => {
    if (!deleteTarget) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [deleteTarget]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (isPanelOpen) return;
      if (deleteTarget && !deleteLoading) { setDeleteTarget(null); setDeleteError(null); return; }
      if (selectedOfficer) setSelectedOfficer(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOfficer, isPanelOpen, deleteTarget, deleteLoading]);

  /** Opens an officer's record by "IAS:<id>" (deep links, the Key persons panel). */
  function openRef(ref: string) {
    const [kind, id] = ref.split(':');
    const service = serviceOf(kind);
    if (!service || !/^[a-z0-9]{15}$/i.test(id || '')) return;
    pb.collection(OFFICER_COLLECTION[service]).getOne(id, { requestKey: null })
      .then((rec) => setSelectedOfficer(toDirectoryOfficer(rec, service)))
      .catch((err) => console.warn('[officers] could not open', ref, err));
  }

  /* DEEP LINK — /officers?open=IAS:<id> (from Occasions, notifications…) opens that officer's record */
  useEffect(() => {
    openRef(new URLSearchParams(window.location.search).get('open') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ Data Loading ----------------------------- */

  const OTHER_SEARCH_FIELDS = ['name', 'category', 'designation', 'organization', 'company_name', 'contact_number', 'email', 'address'];

  /** One page of one record type, already in the shape the table shows. */
  async function fetchPage(type: RecordType, page: number, per: number, query: string, f: OfficerFilters) {
    const collection = COLLECTION_FOR[type];
    const parts: string[] = [];
    if (query) parts.push(type === 'Other' ? `(${OTHER_SEARCH_FIELDS.map((k) => `${k} ~ "${pbQuote(query)}"`).join(' || ')})` : officerSearchFilter(query));
    if (type !== 'Other') {
      if (f.cadre) parts.push(cadreFilter(f.cadre));
      if (f.batch) parts.push(`batch = ${Number(f.batch)}`);
      if (f.status) parts.push(`status = "${pbQuote(f.status)}"`);
    }
    const filter = parts.join(' && ');
    const result = await pb.collection(collection).getList(page, per, { sort: 'name', ...(filter ? { filter } : {}) });
    const items = result.items.map((o: any) => (type === 'Other' ? normalizeOther(o) : toDirectoryOfficer(o, type)));
    return { items, totalItems: result.totalItems };
  }

  async function loadData(page: number) {
    const requestId = ++loadToken.current;
    try {
      setLoading(true);

      const query = debouncedSearch;
      const f = filters;
      const narrowed = Boolean(f.cadre || f.batch || f.status);
      const types: RecordType[] = selectedType === 'all' ? [...OFFICER_SERVICES, ...(narrowed ? [] : ['Other' as const])] : [selectedType];
      const results = await Promise.all(types.map((t) => fetchPage(t, page, perPage, query, f)));

      const officersData = results.flatMap((r) => r.items);
      if (types.length > 1) officersData.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      if (!query && !narrowed) types.forEach((t, i) => setCount(t, results[i].totalItems));

      const total = results.reduce((sum, r) => sum + r.totalItems, 0);
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(Math.max(...results.map((r) => r.totalItems)) / perPage)));

      if (requestId !== loadToken.current) return;

      setOfficers(officersData);
    } catch (error) {
      if (requestId === loadToken.current) {
        console.error('Error loading data:', error);
        setOfficers([]);
      }
    } finally {
      if (requestId === loadToken.current) setLoading(false);
    }
  }

  async function refreshCounts() {
    try {
      const types: RecordType[] = [...OFFICER_SERVICES, 'Other'];
      const res = await Promise.all(types.map((t) => pb.collection(COLLECTION_FOR[t]).getList(1, 1, { fields: 'id' })));
      setCounts(Object.fromEntries(types.map((t, i) => [t, res[i].totalItems])) as Record<RecordType, number>);
    } catch { /* non-critical */ }
  }

  /* -------------------------------- Helpers -------------------------------- */

  const filteredOfficers = officers.filter((officer) => {
    if (searchQuery === '') return true;
    const query = searchQuery.toLowerCase();
    return [
      officer.name, officer.officer_id, officer.current_position, officer.cadre,
      officer.state, officer.email, officer.category, officer.designation,
      officer.organization, officer.company_name, officer.contact_number,
    ].some((v) => (v || '').toLowerCase().includes(query));
  });

  const getInitials = (name: string) =>
    (name || '?').trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const getConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.Other;

  const handleCardClick = (type: DirType) => {
    setSelectedType(type);
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

  const handleCreateNew = (type: RecordType | null) => {
    setEditingOfficer(null);
    setPanelOfficerType(type);
    setIsPanelOpen(true);
  };

  const handleEdit = (officer: any) => {
    setEditingOfficer(officer);
    setPanelOfficerType(officer.type);
    setIsPanelOpen(true);
  };

  const handleDelete = (officer: any) => {
    setDeleteError(null);
    setDeleteTarget(officer);
  };

  /* SOFT DELETE — archive a full snapshot of the record into `deleted_records`
     first, then remove it from its source collection. If the archive step
     fails, the record is left untouched (nothing is lost). */
  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    const collection = COLLECTION_FOR[deleteTarget.type] ?? 'other_contacts';
    let failedStep: 'archive' | 'delete' = 'archive';

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const { id: originalId, type: recordType, ...recordData } = deleteTarget;

      await pb.collection(ARCHIVE_COLLECTION).create({
        original_collection: collection,
        original_id: originalId,
        record_type: recordType,
        record_data: recordData,
        deleted_at: new Date().toISOString(),
      });

      failedStep = 'delete';
      await pb.collection(collection).delete(deleteTarget.id);
      logActivity('deleted', deleteTarget.type === 'Other' ? 'contact' : 'officer',
        `${deleteTarget.type === 'Other' ? 'contact' : `${deleteTarget.type} officer`} ${deleteTarget.name || ''}`.trim(), deleteTarget.id);

      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      if (selectedOfficer?.id === deletedId) setSelectedOfficer(null);

      await Promise.all([loadData(currentPage), refreshCounts()]);
    } catch (err) {
      console.error('Delete failed:', err);
      const status = (err as any)?.status;
      const targetCollection = failedStep === 'archive' ? ARCHIVE_COLLECTION : collection;

      let message = failedStep === 'archive'
        ? 'Failed to archive this record before deleting it. Please try again.'
        : 'This record was archived, but the delete step failed. Please try again.';

      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) {
        // for the developer: the ${failedStep === 'archive' ? 'Create' : 'Delete'} API rule on this collection rejected it
        console.warn(`[delete] permission denied — check the ${failedStep === 'archive' ? 'Create' : 'Delete'} rule on the "${targetCollection}" collection (PocketBase Admin → Collection → API Rules)`);
        message = 'You don’t have permission to do this. Please ask your administrator.';
      } else if (status === 404) message = 'This record was not found — it may have already been deleted.';

      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* Pagination derived values */
  const safePage = Math.min(currentPage, totalPages);
  const paginationRange = getPaginationRange(safePage, totalPages);
  const start = filteredOfficers.length > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const end = searchQuery
    ? (filteredOfficers.length > 0 ? start + filteredOfficers.length - 1 : 0)
    : Math.min(currentPage * perPage, totalItems);

  const header = HEADER_CONFIG[selectedType];
  const HeaderIcon = header.icon;
  const nameSpan = selectedType === 'all' ? 'col-span-2' : 'col-span-3';
  const positionSpan = 'col-span-3';

  const listKey = `${selectedType}-${currentPage}-${debouncedSearch}-${perPage}`;

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading && officers.length === 0) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
        <AnimationStyles />
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
          {/* App bar skeleton */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="off-skeleton h-9 w-9 !rounded-xl" />
              <div className="space-y-2">
                <div className="off-skeleton h-4 w-32 !rounded-full" />
                <div className="off-skeleton h-3 w-44 !rounded-full" />
              </div>
            </div>
            <div className="off-skeleton h-10 w-40 !rounded-full" />
          </div>

          <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">
            {/* KPI cards skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 lg:gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="off-skeleton h-[196px] !rounded-3xl" />
              ))}
            </div>

            {/* Search skeleton */}
            <div className="off-skeleton h-[76px] !rounded-3xl" />

            {/* Table skeleton */}
            <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-100">
                <div className="off-skeleton h-4 w-40 !rounded-full" />
                <div className="off-skeleton h-5 w-12 !rounded-full" />
              </div>
              <div className="divide-y divide-slate-100">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="off-skeleton w-9 h-9 !rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="off-skeleton h-3.5 w-1/3 !rounded-full" />
                      <div className="off-skeleton h-3 w-1/5 !rounded-full" />
                    </div>
                    <div className="off-skeleton h-3.5 w-24 hidden md:block !rounded-full" />
                    <div className="off-skeleton h-5 w-16 hidden md:block !rounded-full" />
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
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <AnimationStyles />

      {/* --------------------- Decorative ambient background --------------------- */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="off-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="off-blob-b absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="off-blob-c absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">

        {/* ------------------------------- App bar ------------------------------ */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">

            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-bold text-slate-900">Officers Directory</h1>
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
              onClick={() => setKeyPeopleOpen(true)}
              title="Your starred officers — last met, next meeting"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Key persons</span>
              {keyPeopleCount > 0 && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">{keyPeopleCount}</span>
              )}
            </button>
            <button
              onClick={() => handleCreateNew(selectedType === 'all' ? null : selectedType === 'Other' ? 'Other' : selectedType)}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              Create New Record
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">

          {/* ------------------------------ Type Stats ------------------------------ */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 lg:gap-5">
            {STAT_CARDS.map((stat, i) => {
              const Icon = stat.icon;
              const active = selectedType === stat.key;
              const count = stat.key === 'all' ? totalCount : counts[stat.key];
              const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;

              return (
                <button
                  key={stat.key}
                  onClick={() => handleCardClick(stat.key)}
                  style={{ animationDelay: `${90 + i * 90}ms` }}
                  className={`off-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98] ring-1 ring-white/70 ${stat.card} ${
                    active ? 'shadow-md shadow-slate-900/10' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <p className="pt-1.5 text-sm font-semibold text-slate-600">{stat.label}</p>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-300 group-hover:scale-110 ${stat.iconTint}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>

                  <div className="relative mt-3 flex items-end justify-between gap-2">
                    <span className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">
                      <AnimatedNumber value={count} />
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
                </button>
              );
            })}
          </section>

          {/* ------------------------------- Search Bar ----------------------------- */}
          <section className="off-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 lg:p-5" style={{ animationDelay: '420ms' }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Search ${selectedType === 'all' ? 'all officers' : selectedType === 'Other' ? 'contacts' : `${selectedType} officers`} by name, ID, designation, department, cadre or email...`}
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

              {/* officer filters — combine freely with the search box and the service cards */}
              {selectedType !== 'Other' && (
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ['cadre', 'Cadre / State', 'All cadres & states', CADRES as readonly string[], MapPin],
                    ['batch', 'Batch', 'All batches', BATCH_YEARS, CalendarDays],
                    ['status', 'Status', 'All statuses', OFFICER_STATUSES, Shield],
                  ] as const).map(([key, label, all, options, Icon]) => (
                    <label key={key} className="relative">
                      <span className="sr-only">{label}</span>
                      <Icon className={`pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${filters[key] ? 'text-violet-600' : 'text-slate-400'}`} />
                      <select
                        value={filters[key]}
                        onChange={(e) => setFilter(key, e.target.value)}
                        aria-label={label}
                        className={`cursor-pointer appearance-none rounded-full border py-2.5 pl-9 pr-9 text-sm font-medium outline-none transition-colors focus:ring-4 focus:ring-violet-500/10 ${
                          filters[key]
                            ? 'border-violet-300 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <option value="">{all}</option>
                        {options.map((o) => <option key={o} value={o}>{key === 'batch' ? `${o} batch` : o}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </label>
                  ))}
                </div>
              )}
            </div>
            {filtersOn && selectedType === 'all' && (
              <p className="mt-2.5 px-1 text-[11px] text-slate-400">Showing officers only — other contacts have no cadre, batch or status.{filters.cadre ? ' IRS officers have no cadre.' : ''}</p>
            )}
            {filters.cadre && selectedType === 'IRS' && (
              <p className="mt-2.5 px-1 text-[11px] text-slate-400">IRS officers are not allotted to a cadre, so a cadre / state filter finds none.</p>
            )}
          </section>

          {/* --------------------------------- Table -------------------------------- */}
          <section ref={tableRef} className="off-fade-up" style={{ animationDelay: '500ms' }}>
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">

              {/* Table header */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                  {/* which list this is — follows the type cards above (All / IAS / IPS / Other contacts) */}
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${header.gradient}`}>
                    <HeaderIcon className="h-4 w-4" />
                  </span>
                  <h2 className="truncate text-sm font-bold text-slate-900">
                    {selectedType === 'all' ? 'All records' : header.title}
                    {(searchQuery || filtersOn) && <span className="font-medium text-slate-400"> · search results</span>}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                    {totalItems}
                  </span>
                  {(searchQuery || filtersOn) && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15">
                      filtered
                    </span>
                  )}
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                </div>
                {(searchQuery || selectedType !== 'all' || filtersOn) && (
                  <button
                    onClick={() => { setFilters(NO_FILTERS); handleCardClick('all'); }}
                    className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* header stays put; the rows scroll under it */}
              <div className="nice-scroll max-h-[70vh] overflow-y-auto">
              {/* Column headers */}
              {selectedType === 'Other' ? (
                <div className="sticky top-0 z-10 hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/95 px-6 backdrop-blur py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <ColumnHead label="Name" className="col-span-3" />
                  <ColumnHead label="Category" className="col-span-2" />
                  <ColumnHead label="Designation" className="col-span-3" />
                  <ColumnHead label="Organization" className="col-span-2" />
                  <ColumnHead label="Contact" className="col-span-1" />
                  <ColumnHead label="Actions" className="col-span-1 text-center" />
                </div>
              ) : (
                <div className="sticky top-0 z-10 hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/95 px-6 backdrop-blur py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <ColumnHead label="Name" className={nameSpan} />
                  <ColumnHead label="Officer ID" className="col-span-2" />
                  <ColumnHead label="Batch" className="col-span-1 text-center" />
                  <ColumnHead label="Cadre" className="col-span-1" />
                  <ColumnHead label="Status" className="col-span-1" />
                  <ColumnHead label="Current Position" className={positionSpan} />
                  {selectedType === 'all' && <ColumnHead label="Type" className="col-span-1 text-center" />}
                  <ColumnHead label="Actions" className="col-span-1 text-center" />
                </div>
              )}

              <div className={`transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
                {filteredOfficers.length === 0 && !loading ? (
                  /* Empty state */
                  <div className="off-fade-in flex flex-col items-center justify-center py-20 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 -m-3 rounded-3xl bg-violet-100/60 blur-xl" />
                      <div className={`off-pop relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow}`}>
                        <User className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h3 className="mt-5 text-base font-bold text-slate-800">No officers found</h3>
                    <p className="mt-1 text-sm text-slate-500">Try adjusting your search, or create a new record.</p>
                    <button
                      onClick={() => handleCreateNew(selectedType === 'all' ? null : selectedType === 'Other' ? 'Other' : selectedType)}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" /> Create New Record
                    </button>
                  </div>
                ) : (
                  <div key={listKey} className="divide-y divide-slate-100">
                    {filteredOfficers.map((officer, idx) => {
                      const config = getConfig(officer.type);

                      return (
                        <div
                          key={officer.id}
                          onClick={() => setSelectedOfficer(officer)}
                          className="off-fade-up cursor-pointer"
                          style={{ animationDelay: `${Math.min(idx * 35, 350)}ms` }}
                        >

                          {/* Desktop row */}
                          {selectedType === 'Other' ? (
                            <div className="group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 hover:bg-amber-50/50 md:grid md:grid-cols-12">
                              <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-amber-400 to-orange-500 transition-all duration-300 group-hover:h-2/3" />

                              <div className="col-span-3 min-w-0">
                                <div className="flex items-center gap-3">
                                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110 ${config.avatar}`}>
                                    {getInitials(officer.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <Tooltip
                                      wide
                                      content={<OfficerCardTip officer={officer} label={config.label} initials={getInitials(officer.name)} avatar={config.avatar} />}
                                      className="block min-w-0"
                                    >
                                      <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${config.nameHover}`}>
                                        {officer.name || 'N/A'}
                                      </p>
                                    </Tooltip>
                                    <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${config.accentText}`}>
                                      View Profile <ArrowRight className="h-3 w-3" />
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="col-span-2 min-w-0 text-xs text-slate-600">
                                <Tooltip content={cellTip('Category', officer.category)} className="block truncate">{officer.category || '—'}</Tooltip>
                              </div>
                              <div className="col-span-3 min-w-0 text-sm font-medium text-slate-800">
                                <Tooltip content={cellTip('Designation', officer.designation)} className="block truncate">{officer.designation || '—'}</Tooltip>
                              </div>
                              <div className="col-span-2 min-w-0 text-sm text-slate-600">
                                <Tooltip content={cellTip('Organization', officer.organization || officer.company_name)} className="block truncate">
                                  {officer.organization || officer.company_name || '—'}
                                </Tooltip>
                              </div>
                              <div className="col-span-1 min-w-0 text-xs text-slate-600">
                                <Tooltip content={cellTip('Phone', officer.contact_number)} className="block truncate">{officer.contact_number || '—'}</Tooltip>
                              </div>
                              <div className="col-span-1 flex items-center justify-center gap-1">
                                <Tooltip content={`Edit ${officer.name || 'contact'}`}>
                                  <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} aria-label="Edit contact"
                                    className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                </Tooltip>
                                <Tooltip content="Delete permanently (you’ll be asked to confirm)">
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} aria-label="Delete record"
                                    className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </Tooltip>
                              </div>
                            </div>
                          ) : (
                            <div className="group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 hover:bg-violet-50/50 md:grid md:grid-cols-12">
                              <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-violet-500 to-indigo-500 transition-all duration-300 group-hover:h-2/3" />

                              <div className={`${nameSpan} min-w-0`}>
                                <div className="flex items-center gap-3">
                                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white transition-transform duration-300 group-hover:scale-110 ${config.avatar}`}>
                                    {getInitials(officer.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <Tooltip
                                      wide
                                      content={<OfficerCardTip officer={officer} label={config.label} initials={getInitials(officer.name)} avatar={config.avatar} />}
                                      className="block min-w-0"
                                    >
                                      <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${config.nameHover}`}>
                                        {officer.name || 'N/A'}
                                      </p>
                                    </Tooltip>
                                    <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${config.accentText}`}>
                                      View Profile <ArrowRight className="h-3 w-3" />
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="col-span-2 min-w-0 font-mono text-xs text-slate-500">
                                <Tooltip content={cellTip('Officer ID', officer.officer_id)} className="block truncate">
                                  {officer.officer_id || '—'}
                                </Tooltip>
                              </div>
                              <div className="col-span-1 text-center text-sm tabular-nums text-slate-600">
                                <Tooltip content={cellTip('Batch (year joined)', officer.batch_year)}>
                                  {officer.batch_year || '—'}
                                </Tooltip>
                              </div>
                              <div className="col-span-1 min-w-0 text-sm text-slate-600">
                                <Tooltip content={cellTip('Cadre', officer.cadre)} className="block truncate">
                                  {officer.cadre || '—'}
                                </Tooltip>
                              </div>
                              <div className="col-span-1 min-w-0 text-sm text-slate-600">
                                <Tooltip content={cellTip('Status', officer.status)} className="block truncate">
                                  {officer.status || '—'}
                                </Tooltip>
                              </div>
                              <div className={`${positionSpan} min-w-0`}>
                                <Tooltip content={cellTip('Current position', officer.current_position)} className="block min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800">
                                    {officer.current_position || '—'}
                                  </p>
                                </Tooltip>
                              </div>
                              {selectedType === 'all' && (
                                <div className="col-span-1 flex justify-center">
                                  <Tooltip content={SERVICE_NAME[officer.type] || config.label}>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.badge}`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                                      {config.label}
                                    </span>
                                  </Tooltip>
                                </div>
                              )}
                              <div className="col-span-1 flex items-center justify-center gap-0.5">
                                <KeyPersonToggle refId={`${officer.type}:${officer.id}`} name={officer.name || ''} role={officer.current_position || officer.designation || ''} />
                                <Tooltip content={`Edit ${officer.name || 'officer'}`}>
                                  <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} aria-label="Edit officer"
                                    className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                </Tooltip>
                                <Tooltip content="Delete permanently (you’ll be asked to confirm)">
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} aria-label="Delete record"
                                    className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </Tooltip>
                              </div>
                            </div>
                          )}

                          {/* Mobile card */}
                          {selectedType === 'Other' ? (
                            <div className="p-4 transition-colors duration-200 hover:bg-amber-50/40 md:hidden">
                              <div className="flex items-start gap-3">
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white ${config.avatar}`}>
                                  {getInitials(officer.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">{officer.name || 'N/A'}</p>
                                    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.badge}`}>
                                      <span className={`h-1 w-1 rounded-full ${config.dot}`} />Contact
                                    </span>
                                  </div>
                                  {officer.designation && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{officer.designation}</p>}
                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    {officer.category && <span>{officer.category}</span>}
                                    {officer.organization && <span>{officer.organization}</span>}
                                    {officer.contact_number && <span>{officer.contact_number}</span>}
                                  </div>
                                  <div className="mt-2.5 flex items-center gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }}
                                      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 active:scale-95">
                                      <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }}
                                      className="inline-flex items-center gap-1 rounded-full bg-rose-50/70 px-3 py-1.5 text-[11px] font-semibold text-rose-500 transition-colors hover:bg-rose-100 active:scale-95">
                                      <Trash2 className="h-3 w-3" /> Delete
                                    </button>
                                  </div>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 transition-colors duration-200 hover:bg-violet-50/40 md:hidden">
                              <div className="flex items-start gap-3">
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-white ${config.avatar}`}>
                                  {getInitials(officer.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">
                                      {officer.name || 'N/A'}
                                    </p>
                                    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.badge}`}>
                                      <span className={`h-1 w-1 rounded-full ${config.dot}`} />
                                      {config.label}
                                    </span>
                                  </div>
                                  {officer.current_position && (
                                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{officer.current_position}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    {officer.officer_id && <span className="font-mono">{officer.officer_id}</span>}
                                    {officer.batch_year && <span>{officer.batch_year}</span>}
                                    {officer.cadre && <span>{officer.cadre}</span>}
                                    {officer.status && <span>{officer.status}</span>}
                                  </div>
                                  <div className="mt-2.5 flex items-center gap-2">
                                    <KeyPersonToggle refId={`${officer.type}:${officer.id}`} name={officer.name || ''} role={officer.current_position || officer.designation || ''} />
                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }}
                                      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 active:scale-95">
                                      <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }}
                                      className="inline-flex items-center gap-1 rounded-full bg-rose-50/70 px-3 py-1.5 text-[11px] font-semibold text-rose-500 transition-colors hover:bg-rose-100 active:scale-95">
                                      <Trash2 className="h-3 w-3" /> Delete
                                    </button>
                                  </div>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>

              {/* ------------------------------ Pagination ------------------------------ */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 lg:px-6">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-slate-500">
                    Showing{' '}
                    <span className="font-semibold text-slate-700">{start}–{end}</span>{' '}
                    of <span className="font-semibold text-slate-700">{totalItems}</span>{' '}
                    {totalItems === 1 ? 'record' : 'records'}
                  </p>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-400">Rows</span>
                    <div className="relative">
                      <select
                        value={perPage}
                        onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="cursor-pointer appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none transition-colors hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
                      >
                        {PER_PAGE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(safePage - 1)}
                      disabled={safePage <= 1}
                      aria-label="Previous page"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {paginationRange.map((p, idx) =>
                      p === 'dots' ? (
                        <span key={`dots-${idx}`} className="px-1 text-xs font-bold text-slate-300">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          aria-current={p === safePage ? 'page' : undefined}
                          className={`h-8 min-w-[2rem] rounded-full px-2 text-xs font-semibold transition-colors ${
                            p === safePage
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => setCurrentPage(safePage + 1)}
                      disabled={safePage >= totalPages}
                      aria-label="Next page"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ------------------------- Details off-canvas ------------------------- */}
      {selectedOfficer && (() => {
        const config = getConfig(selectedOfficer.type);

        return (
          <>
            <div className="off-overlay fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedOfficer(null)} />

<div className="off-panel fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">              {/* Gradient header */}
              <div className={`relative flex-shrink-0 overflow-hidden bg-gradient-to-br ${config.panelGradient} px-6 pb-5 pt-6`}>
                <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                      {config.label}
                    </span>
                    <div className="flex items-center gap-2">
                    {selectedOfficer.type !== 'Other' && selectedOfficer.id && (
                      <KeyPersonStar
                        refId={`${selectedOfficer.type}:${selectedOfficer.id}`}
                        name={selectedOfficer.name || ''}
                        role={selectedOfficer.current_position || selectedOfficer.designation || ''}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedOfficer(null)}
                      className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3.5">
                    <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white shadow-lg ring-2 ring-white/30 ${config.avatar}`}>
                      {getInitials(selectedOfficer.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-xl font-bold leading-snug text-white">
                        {selectedOfficer.name || 'N/A'}
                      </h2>
                      {selectedOfficer.current_position && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-slate-300">{selectedOfficer.current_position}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
                {selectedOfficer.type !== 'Other' && <OfficerOccasions officer={selectedOfficer} />}
                {selectedOfficer.type !== 'Other' && <OfficerMeetings key={selectedOfficer.id} officer={selectedOfficer} />}
                <OfficerDetailsGrid officer={selectedOfficer} />

                {(selectedOfficer.created || selectedOfficer.updated) && (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[11px] text-slate-400">
                    {selectedOfficer.created && (
                      <span>
                        Created{' '}
                        {new Date(selectedOfficer.created).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                    {selectedOfficer.updated && (
                      <span>
                        Updated{' '}
                        {new Date(selectedOfficer.updated).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex flex-shrink-0 gap-2.5 border-t border-slate-200 bg-white p-4">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedOfficer)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedOfficer)}
                  className="flex items-center justify-center gap-2 rounded-full border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-500 transition-colors hover:border-rose-300 hover:bg-rose-50/60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ------------------------- Key persons ------------------------- */}
      {keyPeopleOpen && (
        <KeyPeoplePanel
          editable={canEdit(user)}
          onClose={() => setKeyPeopleOpen(false)}
          onOpenOfficer={(ref) => { setKeyPeopleOpen(false); openRef(ref); }}
        />
      )}


      {/* ------------------------- Delete confirmation ------------------------- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="off-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(null); } }}
          />
          <div className="off-modal relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
              <Trash2 className="h-5 w-5 text-rose-500" />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-slate-900">Move to trash?</h3>
            <p className="mt-1.5 text-center text-sm leading-relaxed text-slate-500">
              &ldquo;{deleteTarget.name || 'This record'}&rdquo; will be removed from this list and archived, so it can be recovered later if needed.
            </p>

            {deleteError && (
              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <p className="text-xs leading-relaxed text-rose-700">{deleteError}</p>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleteLoading}
                className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleteLoading ? 'Moving…' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------ Panel ------------------------------ */}
<CreateOfficerPanel
  isOpen={isPanelOpen}
  officerType={panelOfficerType ?? undefined}
  editOfficer={editingOfficer}
  onClose={() => { setIsPanelOpen(false); setEditingOfficer(null); }}
  onSuccess={() => { setIsPanelOpen(false); setEditingOfficer(null); loadData(currentPage); refreshCounts(); }}
/>
    </div>
  );
}