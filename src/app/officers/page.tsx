'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, User, Shield, Briefcase,
  MapPin, GraduationCap, X, Mail, Phone, Users, Building2,
  Plus, Database, Loader2, ArrowRight, ArrowUpRight, Contact, Pencil, Trash2, AlertCircle,
  CalendarDays, TrendingUp,
} from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';
import CreateOfficerPanel from '@/components/CreateOfficerPanel';

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
const COLLECTION_FOR: Record<string, string> = {
  IAS: 'ias_officers',
  IPS: 'ips_officers',
  Other: 'other_contacts',
};

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

/* Fields hidden from the generic details grid in the off-canvas panel */
const HIDDEN_DETAIL_FIELDS = new Set([
  'id', 'type', 'collectionId', 'collectionName', 'expand', 'created', 'updated',
]);

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
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'IAS' | 'IPS' | 'Other'>('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelOfficerType, setPanelOfficerType] = useState<'IAS' | 'IPS' | 'Other' | null>('IAS');

  /* EDIT MODE — the officer being edited (a record with `id` + `type`) */
  const [editingOfficer, setEditingOfficer] = useState<any>(null);

  /* DELETE MODE — confirmation modal state */
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Counts for each type */
  const [iasCount, setIasCount] = useState(0);
  const [ipsCount, setIpsCount] = useState(0);
  const [otherCount, setOtherCount] = useState(0);

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

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, selectedType, perPage, debouncedSearch]);

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

  /* ------------------------------ Data Loading ----------------------------- */

  const SEARCHABLE_FIELDS: Record<string, string[]> = {
    ias_officers:   ['name', 'officer_id', 'current_position', 'cadre', 'state', 'email'],
    ips_officers:   ['name', 'officer_id', 'current_position', 'cadre', 'state', 'email'],
    other_contacts: ['name', 'category', 'designation', 'organization', 'company_name', 'contact_number', 'email', 'address'],
  };

  async function fetchPage(collection: string, page: number, per: number, query: string) {
    if (!query) {
      return pb.collection(collection).getList(page, per, { sort: 'name' });
    }
    const q = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const fields = SEARCHABLE_FIELDS[collection] ?? ['name'];
    const filter = `(${fields.map((f) => `${f} ~ "${q}"`).join(' || ')})`;
    return pb.collection(collection).getList(page, per, { sort: 'name', filter });
  }

  async function loadData(page: number) {
    const requestId = ++loadToken.current;
    try {
      setLoading(true);

      const query = debouncedSearch;
      let officersData: any[] = [];

      if (selectedType === 'IAS') {
        const result = await fetchPage('ias_officers', page, perPage, query);
        officersData = result.items.map((o: any) => ({ ...o, type: 'IAS' }));
        if (!query) setIasCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.max(1, Math.ceil(result.totalItems / perPage)));
      } else if (selectedType === 'IPS') {
        const result = await fetchPage('ips_officers', page, perPage, query);
        officersData = result.items.map((o: any) => ({ ...o, type: 'IPS' }));
        if (!query) setIpsCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.max(1, Math.ceil(result.totalItems / perPage)));
      } else if (selectedType === 'Other') {
        const result = await fetchPage('other_contacts', page, perPage, query);
        officersData = result.items.map(normalizeOther);
        if (!query) setOtherCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.max(1, Math.ceil(result.totalItems / perPage)));
      } else {
        const [iasResult, ipsResult, otherResult] = await Promise.all([
          fetchPage('ias_officers', page, perPage, query),
          fetchPage('ips_officers', page, perPage, query),
          fetchPage('other_contacts', page, perPage, query),
        ]);

        officersData = [
          ...iasResult.items.map((o: any) => ({ ...o, type: 'IAS' })),
          ...ipsResult.items.map((o: any) => ({ ...o, type: 'IPS' })),
          ...otherResult.items.map(normalizeOther),
        ].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (!query) {
          setIasCount(iasResult.totalItems);
          setIpsCount(ipsResult.totalItems);
          setOtherCount(otherResult.totalItems);
        }

        const total = iasResult.totalItems + ipsResult.totalItems + otherResult.totalItems;
        setTotalItems(total);
        setTotalPages(Math.max(1, Math.ceil(Math.max(iasResult.totalItems, ipsResult.totalItems, otherResult.totalItems) / perPage)));
      }

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
      const [ias, ips, other] = await Promise.all([
        pb.collection('ias_officers').getList(1, 1),
        pb.collection('ips_officers').getList(1, 1),
        pb.collection('other_contacts').getList(1, 1),
      ]);
      setIasCount(ias.totalItems);
      setIpsCount(ips.totalItems);
      setOtherCount(other.totalItems);
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

  const formatLabel = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
      if (value.length === 0) return 'N/A';
      return value.join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getInitials = (name: string) =>
    (name || '?').trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const getConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.Other;

  const handleCardClick = (type: 'all' | 'IAS' | 'IPS' | 'Other') => {
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

  const handleCreateNew = (type: 'IAS' | 'IPS' | 'Other' | null) => {
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
        message = `Permission denied — check the ${failedStep === 'archive' ? 'Create' : 'Delete'} rule on the "${targetCollection}" collection (PocketBase Admin → Collection → API Rules).`;
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

  const totalCount = iasCount + ipsCount + otherCount;

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading && officers.length === 0) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
        <AnimationStyles />
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">
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

          <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
            {/* KPI cards skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-5">
              {[...Array(4)].map((_, i) => (
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
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
      <AnimationStyles />

      {/* --------------------- Decorative ambient background --------------------- */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="off-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="off-blob-b absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="off-blob-c absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
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
                <p className="truncate text-sm font-bold text-slate-900">Officers Directory</p>
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
              onClick={() => handleCreateNew(selectedType === 'all' ? null : selectedType === 'Other' ? 'Other' : selectedType)}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              Create New Record
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------------ Page Header ----------------------------- */}
          <header className="off-fade-up flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${header.gradient} shadow-lg ${header.glow} ring-1 ring-inset ring-white/30`}>
                <HeaderIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Directory · Management
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-[28px]">{header.title}</h1>
                <p className="mt-0.5 text-sm text-slate-500">{header.subtitle}</p>
              </div>
            </div>
          </header>

          {/* ------------------------------ Type Stats ------------------------------ */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-5">
            {STAT_CARDS.map((stat, i) => {
              const Icon = stat.icon;
              const active = selectedType === stat.key;
              const count =
                stat.key === 'all' ? totalCount :
                stat.key === 'IAS' ? iasCount :
                stat.key === 'IPS' ? ipsCount : otherCount;
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
                  placeholder={`Search ${selectedType === 'all' ? 'all officers' : selectedType === 'Other' ? 'contacts' : `${selectedType} officers`} by name, ID, position, cadre, state or email...`}
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


            </div>
          </section>

          {/* --------------------------------- Table -------------------------------- */}
          <section ref={tableRef} className="off-fade-up" style={{ animationDelay: '500ms' }}>
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
                  {searchQuery && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15">
                      filtered
                    </span>
                  )}
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                </div>
                {(searchQuery || selectedType !== 'all') && (
                  <button
                    onClick={() => handleCardClick('all')}
                    className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Column headers */}
              {selectedType === 'Other' ? (
                <div className="hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-3">Designation</div>
                  <div className="col-span-2">Organization</div>
                  <div className="col-span-1">Contact</div>
                  <div className="col-span-1 text-center">Actions</div>
                </div>
              ) : (
                <div className="hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <div className={nameSpan}>Name</div>
                  <div className="col-span-2">Officer ID</div>
                  <div className="col-span-1 text-center">Batch</div>
                  <div className="col-span-1">Cadre</div>
                  <div className="col-span-1">State</div>
                  <div className={positionSpan}>Current Position</div>
                  {selectedType === 'all' && <div className="col-span-1 text-center">Type</div>}
                  <div className="col-span-1 text-center">Actions</div>
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
                                    <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${config.nameHover}`}>
                                      {officer.name || 'N/A'}
                                    </p>
                                    <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${config.accentText}`}>
                                      View Profile <ArrowRight className="h-3 w-3" />
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="col-span-2 truncate text-xs text-slate-600" title={officer.category}>{officer.category || '—'}</div>
                              <div className="col-span-3 truncate text-sm font-medium text-slate-800" title={officer.designation}>{officer.designation || '—'}</div>
                              <div className="col-span-2 truncate text-sm text-slate-600" title={officer.organization || officer.company_name}>
                                {officer.organization || officer.company_name || '—'}
                              </div>
                              <div className="col-span-1 truncate text-xs text-slate-600">{officer.contact_number || '—'}</div>
                              <div className="col-span-1 flex items-center justify-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} title="Edit contact"
                                  className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} title="Move to trash"
                                  className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                  <Trash2 className="h-4 w-4" />
                                </button>
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
                                    <p className={`truncate text-sm font-semibold text-slate-900 transition-colors ${config.nameHover}`}>
                                      {officer.name || 'N/A'}
                                    </p>
                                    <p className={`flex items-center gap-1 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${config.accentText}`}>
                                      View Profile <ArrowRight className="h-3 w-3" />
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="col-span-2 truncate font-mono text-xs text-slate-500">
                                {officer.officer_id || '—'}
                              </div>
                              <div className="col-span-1 text-center text-sm tabular-nums text-slate-600">
                                {officer.batch_year || '—'}
                              </div>
                              <div className="col-span-1 truncate text-sm text-slate-600" title={officer.cadre}>
                                {officer.cadre || '—'}
                              </div>
                              <div className="col-span-1 truncate text-sm text-slate-600" title={officer.state}>
                                {officer.state || '—'}
                              </div>
                              <div className={`${positionSpan} min-w-0`}>
                                <p className="truncate text-sm font-medium text-slate-800" title={officer.current_position}>
                                  {officer.current_position || '—'}
                                </p>
                              </div>
                              {selectedType === 'all' && (
                                <div className="col-span-1 flex justify-center">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.badge}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                                    {config.label}
                                  </span>
                                </div>
                              )}
                              <div className="col-span-1 flex items-center justify-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} title="Edit officer"
                                  className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-sky-50 hover:text-sky-600">
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} title="Move to trash"
                                  className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:scale-110 hover:bg-rose-50/60 hover:text-rose-500">
                                  <Trash2 className="h-4 w-4" />
                                </button>
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
                                    {officer.state && <span>{officer.state}</span>}
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
        const detailFields = Object.keys(selectedOfficer).filter((key) => {
          if (HIDDEN_DETAIL_FIELDS.has(key)) return false;
          if (typeof selectedOfficer[key] === 'object' && selectedOfficer[key] !== null && !Array.isArray(selectedOfficer[key])) return false;
          return formatValue(selectedOfficer[key]) !== 'N/A';
        });

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
                    <button
                      type="button"
                      onClick={() => setSelectedOfficer(null)}
                      className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
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
                <div className="grid grid-cols-2 gap-3">
                  {detailFields.map((key) => (
                    <div
                      key={key}
                      className={`rounded-2xl border border-slate-200/80 bg-white p-4 ${
                        formatValue(selectedOfficer[key]).length > 24 ? 'col-span-2' : ''
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {formatLabel(key)}
                      </p>
                      <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">
                        {formatValue(selectedOfficer[key])}
                      </p>
                    </div>
                  ))}
                </div>

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
  officerType={panelOfficerType}
  editOfficer={editingOfficer}
  onClose={() => { setIsPanelOpen(false); setEditingOfficer(null); }}
  onSuccess={() => { setIsPanelOpen(false); setEditingOfficer(null); loadData(currentPage); refreshCounts(); }}
/>
    </div>
  );
}