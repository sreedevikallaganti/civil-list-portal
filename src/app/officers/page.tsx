'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, User, Shield, Briefcase,
  MapPin, GraduationCap, X, Mail, Phone, Users, Building2,
  Plus, Database, Loader2, ArrowRight, Contact, Pencil, Trash2, AlertCircle,
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
  panelGradient: string;
  buttonGradient: string;
  blurA: string;
  blurB: string;
  glow: string;
}> = {
  IAS: {
    label: 'IAS',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20',
    dot: 'bg-blue-400',
    avatar: 'from-sky-400 to-blue-600',
    panelGradient: 'from-blue-600 via-blue-700 to-indigo-900',
    buttonGradient: 'from-sky-500 to-blue-600',
    blurA: 'bg-sky-400/25',
    blurB: 'bg-blue-500/20',
    glow: 'shadow-blue-600/25',
  },
  IPS: {
    label: 'IPS',
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20',
    dot: 'bg-indigo-400',
    avatar: 'from-indigo-400 to-violet-600',
    panelGradient: 'from-indigo-600 via-violet-700 to-purple-900',
    buttonGradient: 'from-indigo-500 to-violet-600',
    blurA: 'bg-violet-400/25',
    blurB: 'bg-indigo-400/20',
    glow: 'shadow-indigo-600/25',
  },
  Other: {
    label: 'Other',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/25',
    dot: 'bg-amber-400',
    avatar: 'from-amber-400 to-orange-600',
    panelGradient: 'from-amber-500 via-orange-600 to-rose-800',
    buttonGradient: 'from-amber-500 to-orange-600',
    blurA: 'bg-amber-300/25',
    blurB: 'bg-orange-400/20',
    glow: 'shadow-amber-600/25',
  },
};

/* PocketBase collection for each record type (used for edit/delete) */
const COLLECTION_FOR: Record<string, string> = {
  IAS: 'ias_officers',
  IPS: 'ips_officers',
  Other: 'other_contacts',
};

function normalizeOther(o: any) {
  const n: any = { ...o, type: 'Other' };
  if (o.designation) n.current_position = o.designation;
  if (o.contact_number) n.phone = o.contact_number;
  return n;
}

/* Colorful stat cards */
const STAT_CARDS = [
  { key: 'all' as const,   label: 'Total',         caption: 'All records',          icon: Users,     iconGradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/40', glow: 'shadow-violet-600/25' },
  { key: 'IAS' as const,   label: 'IAS Officers',  caption: 'Administrative',       icon: Briefcase, iconGradient: 'from-sky-500 to-blue-600',      ring: 'ring-blue-500/40',   glow: 'shadow-blue-600/25' },
  { key: 'IPS' as const,   label: 'IPS Officers',  caption: 'Police service',       icon: Shield,    iconGradient: 'from-indigo-500 to-violet-600', ring: 'ring-indigo-500/40', glow: 'shadow-indigo-600/25' },
  { key: 'Other' as const, label: 'Other Contacts', caption: 'Additional contacts',  icon: Building2, iconGradient: 'from-amber-500 to-orange-600',  ring: 'ring-amber-500/40',  glow: 'shadow-amber-600/25' },
];

/* Page header per selected type */
const HEADER_CONFIG = {
  all:   { title: 'Officers Directory', subtitle: 'Browse and manage all officers and contacts', icon: Users,     gradient: 'from-violet-600 to-indigo-600', glow: 'shadow-violet-600/25' },
  IAS:   { title: 'IAS Officers',       subtitle: 'Indian Administrative Service records',        icon: Briefcase, gradient: 'from-sky-500 to-blue-600',      glow: 'shadow-blue-600/25' },
  IPS:   { title: 'IPS Officers',       subtitle: 'Indian Police Service records',                icon: Shield,    gradient: 'from-indigo-600 to-violet-600', glow: 'shadow-indigo-600/25' },
  Other: { title: 'Other Contacts',     subtitle: 'Additional contacts directory',                icon: Contact,   gradient: 'from-amber-500 to-orange-600',  glow: 'shadow-amber-600/25' },
} as const;

const PER_PAGE_OPTIONS = [10, 25, 50];

/* Generates page numbers with ellipsis, e.g. [1, '...', 4, 5, 6, '...', 12] */
function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

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

  /* SERVER-SIDE SEARCH — debounced so we don't hit PocketBase on every keystroke */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadToken = useRef(0); /* guards against stale responses overwriting newer ones */

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1); /* new query → always restart at page 1 */
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /* Load data whenever page / type / page size / committed search changes */
  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, selectedType, perPage, debouncedSearch]);

  /* If the current page becomes empty (e.g. after deleting its last row), step back a page */
  useEffect(() => {
    if (!loading && currentPage > 1 && officers.length === 0) {
      setCurrentPage((p) => p - 1);
    }
  }, [loading, currentPage, officers.length]);

  /* Lock body scroll while the delete modal is open */
  useEffect(() => {
    if (!deleteTarget) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [deleteTarget]);

  /* Close overlays with Escape key */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (isPanelOpen) return; /* handled inside CreateOfficerPanel */
      if (deleteTarget && !deleteLoading) { setDeleteTarget(null); setDeleteError(null); return; }
      if (selectedOfficer) setSelectedOfficer(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOfficer, isPanelOpen, deleteTarget, deleteLoading]);

  /* ------------------------------ Data Loading ----------------------------- */

  /* Fetch one page of a collection, applying the search query server-side.
     Falls back to name-only search if some fields don't exist in a collection's schema. */
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

      const query = debouncedSearch; /* SERVER-SIDE search */
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
        /* Fetch all three */
        const [iasResult, ipsResult, otherResult] = await Promise.all([
          fetchPage('ias_officers', page, perPage, query),
          fetchPage('ips_officers', page, perPage, query),
          fetchPage('other_contacts', page, perPage, query),
        ]);

        officersData = [
  ...iasResult.items.map((o: any) => ({ ...o, type: 'IAS' })),
  ...ipsResult.items.map((o: any) => ({ ...o, type: 'IPS' })),
  ...otherResult.items.map(normalizeOther),          // ← changed
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

      /* Discard stale responses (a newer load superseded this one) */
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

  /* Lightweight count refresh (used after create/edit/delete so stat cards stay accurate) */
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

  /* Client-side safety net (instant feedback while typing, before the server round-trip) */
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
  };

  const handleCreateNew = (type: 'IAS' | 'IPS' | 'Other' | null) => {
    setEditingOfficer(null);
    setPanelOfficerType(type);
    setIsPanelOpen(true);
  };

  /* EDIT — open the form panel pre-filled with this officer */
  const handleEdit = (officer: any) => {
    setEditingOfficer(officer);
    setPanelOfficerType(officer.type);
    setIsPanelOpen(true);
  };

  /* DELETE — open the confirmation modal */
  const handleDelete = (officer: any) => {
    setDeleteError(null);
    setDeleteTarget(officer);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    const collection = COLLECTION_FOR[deleteTarget.type] ?? 'other_contacts';
    try {
      setDeleteLoading(true);
      setDeleteError(null);

      await pb.collection(collection).delete(deleteTarget.id);

      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      if (selectedOfficer?.id === deletedId) setSelectedOfficer(null);

      await Promise.all([loadData(currentPage), refreshCounts()]);
    } catch (err) {
      console.error('Delete failed:', err);
      const status = (err as any)?.status;
      let message = 'Failed to delete this record. Please try again.';
      if (status === 401) message = 'Your session has expired — please sign in again.';
      else if (status === 403) message = `Permission denied — check the Delete rule on the "${collection}" collection (PocketBase Admin → Collection → API Rules).`;
      else if (status === 404) message = 'This record was not found — it may have already been deleted.';
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

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading && officers.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50/70 p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
              <div className="space-y-2">
                <div className="h-7 w-44 bg-gray-200 rounded-lg" />
                <div className="h-4 w-60 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-11 w-40 bg-gray-200 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[118px] bg-gray-100 rounded-2xl border border-gray-200" />
            ))}
          </div>
          <div className="h-[70px] bg-gray-100 rounded-2xl" />
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <div className="w-9 h-9 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-gray-100 rounded" />
                  <div className="h-3 w-1/4 bg-gray-50 rounded" />
                </div>
                <div className="h-4 w-24 bg-gray-50 rounded" />
                <div className="h-6 w-16 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- Main View ------------------------------- */

  return (
    <div className="min-h-screen bg-slate-50/70 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ------------------------------ Page Header ----------------------------- */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${header.gradient} flex items-center justify-center shadow-lg ${header.glow}`}>
              <HeaderIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">{header.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{header.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => handleCreateNew(selectedType === 'all' ? null : selectedType === 'Other' ? 'Other' : selectedType)}
            className={`inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r ${header.gradient} text-white font-semibold rounded-xl shadow-lg ${header.glow} hover:shadow-xl transition-all hover:-translate-y-px`}
          >
            <Plus className="w-5 h-5" />
            Create New Record
          </button>
        </div>

        {/* ------------------------------ Type Stats ------------------------------ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STAT_CARDS.map((stat) => {
            const Icon = stat.icon;
            const active = selectedType === stat.key;
            const count =
              stat.key === 'all' ? iasCount + ipsCount + otherCount :
              stat.key === 'IAS' ? iasCount :
              stat.key === 'IPS' ? ipsCount : otherCount;

            return (
              <button
                key={stat.key}
                onClick={() => handleCardClick(stat.key)}
                className={`group text-left bg-white rounded-2xl border p-4 lg:p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  active ? `ring-2 ${stat.ring} border-transparent shadow-md` : 'border-gray-200 shadow-sm hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.iconGradient} flex items-center justify-center shadow-md ${stat.glow} transition-transform group-hover:scale-110`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{count}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-gray-800">{stat.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.caption}</p>
              </button>
            );
          })}
        </div>

        {/* ------------------------------- Search Bar ----------------------------- */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 lg:p-5">
          <div className="relative lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${selectedType === 'all' ? 'all officers' : selectedType === 'Other' ? 'contacts' : `${selectedType} officers`} by name, ID, position, cadre, state or email...`}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setDebouncedSearch(''); setCurrentPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* --------------------------------- Table -------------------------------- */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Table header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-gray-800">{header.title}</h3>
              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[11px] font-bold text-gray-500 tabular-nums">
                {totalItems}
              </span>
              {searchQuery && (
                <span className="px-2 py-0.5 bg-blue-50 rounded-full text-[11px] font-bold text-blue-600">
                  filtered
                </span>
              )}
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
            </div>
            {(searchQuery || selectedType !== 'all') && (
              <button
                onClick={() => handleCardClick('all')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          
                    {/* Column headers */}
          {selectedType === 'Other' ? (
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-3">Designation</div>
              <div className="col-span-2">Organization</div>
              <div className="col-span-1">Contact</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>
          ) : (
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
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

          <div className={`divide-y divide-gray-100 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {filteredOfficers.length === 0 && !loading ? (
              /* Empty state */
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${header.gradient} flex items-center justify-center shadow-lg ${header.glow}`}>
                  <User className="w-8 h-8 text-white" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-800">No officers found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search, or create a new record.</p>
                <button
                  onClick={() => handleCreateNew(selectedType === 'all' ? null : selectedType === 'Other' ? 'Other' : selectedType)}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create New Record
                </button>
              </div>
            ) : (
                            filteredOfficers.map((officer) => {
                const config = getConfig(officer.type);

                return (
                  <div key={officer.id} onClick={() => setSelectedOfficer(officer)}>

                    {/* Desktop row */}
                    {selectedType === 'Other' ? (
                      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer transition-colors group hover:bg-blue-50/40">
                        <div className="col-span-3 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0 bg-gradient-to-br ${config.avatar} transition-transform group-hover:scale-110`}>
                              {getInitials(officer.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-blue-700 transition-colors">
                                {officer.name || 'N/A'}
                              </p>
                              <p className="text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                View Profile <ArrowRight className="w-3 h-3" />
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 text-xs text-gray-600 truncate" title={officer.category}>{officer.category || '—'}</div>
                        <div className="col-span-3 text-sm font-medium text-gray-800 truncate" title={officer.designation}>{officer.designation || '—'}</div>
                        <div className="col-span-2 text-sm text-gray-600 truncate" title={officer.organization || officer.company_name}>
                          {officer.organization || officer.company_name || '—'}
                        </div>
                        <div className="col-span-1 text-xs text-gray-600 truncate">{officer.contact_number || '—'}</div>
                        <div className="col-span-1 flex items-center justify-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} title="Edit contact"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} title="Delete contact"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer transition-colors group hover:bg-blue-50/40">
                        <div className={`${nameSpan} min-w-0`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0 bg-gradient-to-br ${config.avatar} transition-transform group-hover:scale-110`}>
                              {getInitials(officer.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-blue-700 transition-colors">
                                {officer.name || 'N/A'}
                              </p>
                              <p className="text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                View Profile <ArrowRight className="w-3 h-3" />
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 text-xs text-gray-600 font-mono truncate">
                          {officer.officer_id || '—'}
                        </div>
                        <div className="col-span-1 text-center text-sm text-gray-600 tabular-nums">
                          {officer.batch_year || '—'}
                        </div>
                        <div className="col-span-1 text-sm text-gray-600 truncate" title={officer.cadre}>
                          {officer.cadre || '—'}
                        </div>
                        <div className="col-span-1 text-sm text-gray-600 truncate" title={officer.state}>
                          {officer.state || '—'}
                        </div>
                        <div className={`${positionSpan} min-w-0`}>
                          <p className="text-sm font-medium text-gray-800 truncate" title={officer.current_position}>
                            {officer.current_position || '—'}
                          </p>
                        </div>
                        {selectedType === 'all' && (
                          <div className="col-span-1 flex justify-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                              {config.label}
                            </span>
                          </div>
                        )}
                        {/* Row actions: Edit / Delete */}
                        <div className="col-span-1 flex items-center justify-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }} title="Edit officer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }} title="Delete officer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mobile card */}
                    {selectedType === 'Other' ? (
                      <div className="md:hidden p-4 cursor-pointer hover:bg-blue-50/40 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm bg-gradient-to-br ${config.avatar}`}>
                            {getInitials(officer.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{officer.name || 'N/A'}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${config.badge}`}>
                                <span className={`w-1 h-1 rounded-full ${config.dot}`} />Contact
                              </span>
                            </div>
                            {officer.designation && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{officer.designation}</p>}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
                              {officer.category && <span>{officer.category}</span>}
                              {officer.organization && <span>{officer.organization}</span>}
                              {officer.contact_number && <span>{officer.contact_number}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-2.5">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="md:hidden p-4 cursor-pointer hover:bg-blue-50/40 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm bg-gradient-to-br ${config.avatar}`}>
                            {getInitials(officer.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                                {officer.name || 'N/A'}
                              </p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${config.badge}`}>
                                <span className={`w-1 h-1 rounded-full ${config.dot}`} />
                                {config.label}
                              </span>
                            </div>
                            {officer.current_position && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{officer.current_position}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
                              {officer.officer_id && <span className="font-mono">{officer.officer_id}</span>}
                              {officer.batch_year && <span>{officer.batch_year}</span>}
                              {officer.cadre && <span>{officer.cadre}</span>}
                              {officer.state && <span>{officer.state}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-2.5">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(officer); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(officer); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ------------------------------- Pagination ---------------------------- */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/50">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <p>
                  Showing <span className="font-bold text-gray-700">{start}–{end}</span> of{' '}
                  <span className="font-bold text-gray-700">{totalItems}</span> records
                </p>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-gray-300">|</span>
                  <label className="hidden sm:inline text-gray-400">Per page</label>
                  <select
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/60 cursor-pointer"
                  >
                    {PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                {paginationRange.map((item, i) =>
                  item === 'dots' ? (
                    <span key={`dots-${i}`} className="px-2 py-2 text-xs text-gray-400 select-none">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item)}
                      disabled={loading}
                      className={`w-8 h-8 text-xs font-bold rounded-lg tabular-nums transition-all disabled:opacity-40 ${
                        item === safePage
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ----------------------- Off-Canvas Officer Profile --------------------- */}
          {selectedOfficer && (() => {
            const config = getConfig(selectedOfficer.type);
            const isOther = selectedOfficer.type === 'Other';
            const phone = selectedOfficer.phone || selectedOfficer.mobile || selectedOfficer.contact_number;

  /* Quick info tiles with colorful icons */
  const tiles = isOther
    ? [
        { label: 'Designation',  value: selectedOfficer.designation,  icon: Briefcase,  iconColor: 'text-sky-500' },
        { label: 'Organization', value: selectedOfficer.organization, icon: Building2,  iconColor: 'text-amber-500' },
        { label: 'Category',     value: selectedOfficer.category,     icon: Contact,    iconColor: 'text-violet-500' },
        { label: 'Company',      value: selectedOfficer.company_name, icon: Building2,  iconColor: 'text-emerald-500' },
      ]
    : [
        { label: 'Position', value: selectedOfficer.current_position, icon: Briefcase, iconColor: 'text-sky-500' },
        { label: 'Cadre', value: selectedOfficer.cadre, icon: Shield, iconColor: 'text-indigo-500' },
        { label: 'State', value: selectedOfficer.state, icon: MapPin, iconColor: 'text-rose-500' },
        { label: 'Batch Year', value: selectedOfficer.batch_year, icon: GraduationCap, iconColor: 'text-emerald-500' },
      ];
            return (
            <>
              {/* Overlay */}
              <div
                className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
                onClick={() => setSelectedOfficer(null)}
              />

              {/* Panel */}
              <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">

                {/* Colorful gradient header — matches officer type */}
                <div className={`relative bg-gradient-to-br ${config.panelGradient} px-6 pt-6 pb-5 overflow-hidden flex-shrink-0`}>
                  <div className={`absolute -top-20 -right-20 w-56 h-56 ${config.blurA} rounded-full blur-3xl`} />
                  <div className={`absolute -bottom-24 -left-16 w-48 h-48 ${config.blurB} rounded-full blur-3xl`} />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-xl bg-gradient-to-br ${config.avatar} ring-2 ring-white/25`}>
                          {getInitials(selectedOfficer.name)}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold text-white leading-tight line-clamp-2">
                            {selectedOfficer.name || 'Unknown'}
                          </h2>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 text-white ring-1 ring-inset ring-white/25">
                              <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                              {selectedOfficer.type === 'Other' ? 'Contact' : `${selectedOfficer.type} Officer`}
                            </span>
                            {selectedOfficer.officer_id && (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-slate-200 ring-1 ring-inset ring-white/15 font-mono">
                                {selectedOfficer.officer_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedOfficer(null)}
                        className="p-2 -mr-2 -mt-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {selectedOfficer.current_position && (
                      <p className="mt-3 text-sm text-white/80 flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4 text-white/60 flex-shrink-0" />
                        <span className="truncate">{selectedOfficer.current_position}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4 bg-slate-50/70">

                  {/* Quick info tiles — colorful icons */}
                  <div className="grid grid-cols-2 gap-3">
                    {tiles.map((tile, idx) => (
                      <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                          <tile.icon className={`w-3.5 h-3.5 ${tile.iconColor}`} /> {tile.label}
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-gray-900 line-clamp-2">{tile.value || '—'}</p>
                      </div>
                    ))}
                  </div>

                  {/* Contact info */}
                  {(phone || selectedOfficer.email) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                      {phone && (
                        <a href={`tel:${phone}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Phone className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Phone</p>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors truncate">
                              {phone}
                            </p>
                          </div>
                        </a>
                      )}
                      {selectedOfficer.email && (
                        <a href={`mailto:${selectedOfficer.email}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Email</p>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate">
                              {selectedOfficer.email}
                            </p>
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* All fields */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/80 border-b border-gray-100">
                      <Database className="w-4 h-4 text-violet-500" />
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">All Fields</h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {Object.entries(selectedOfficer).map(([key, value]) => {
  const skipFields = ['id', 'collectionId', 'collectionName', 'expand', 'type'];
  if (isOther && ['current_position', 'phone'].includes(key)) return null; /* avoid duplicates of designation/contact_number */
  if (skipFields.includes(key)) return null;

                        const formattedValue = formatValue(value);
                        if (formattedValue === 'N/A') return null;

                        return (
                          <div key={key} className="px-4 py-2.5 flex gap-3 hover:bg-slate-50/70 transition-colors">
                            <div className="w-2/5 flex-shrink-0">
                              <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight tracking-wider">
                                {formatLabel(key)}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs text-gray-800 break-words ${
                                typeof value === 'object' || Array.isArray(value)
                                  ? 'font-mono bg-gray-100 p-1.5 rounded text-[10px]'
                                  : ''
                              }`}>
                                {formattedValue}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sticky action footer — Edit / Delete */}
                <div className="flex items-center gap-3 p-5 border-t border-gray-200 bg-white/95 backdrop-blur flex-shrink-0">
                  <button
                    onClick={() => handleEdit(selectedOfficer)}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r ${config.buttonGradient} text-white font-semibold rounded-xl transition-all hover:shadow-lg ${config.glow}`}
                  >
                    <Pencil className="w-4 h-4" /> Edit Details
                  </button>
                  <button
                    onClick={() => handleDelete(selectedOfficer)}
                    disabled={deleteLoading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-red-600 font-semibold rounded-xl border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* --------------------------- Delete Confirmation ------------------------- */}
        {deleteTarget && (
          <>
            <div
              className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-200"
              onClick={() => !deleteLoading && (setDeleteTarget(null), setDeleteError(null))}
            />
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="mt-4 text-center text-base font-bold text-gray-900">Delete this record?</h3>
                  <p className="mt-1.5 text-center text-sm text-gray-500 leading-relaxed">
                    <span className="font-semibold text-gray-700">{deleteTarget.name || 'Unnamed record'}</span>
                    {deleteTarget.officer_id ? <span className="font-mono"> ({deleteTarget.officer_id})</span> : null}{' '}
                    will be permanently removed. This action cannot be undone.
                  </p>

                  {deleteError && (
                    <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-red-700 leading-relaxed">{deleteError}</p>
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                      disabled={deleteLoading}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDelete}
                      disabled={deleteLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                      {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deleteLoading ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

                {/* ---------------------------- Create / Edit Officer Panel ---------------------- */}
        <CreateOfficerPanel
          key={editingOfficer ? `edit-${editingOfficer.id}` : panelOfficerType ? `create-${panelOfficerType}` : 'create'}
          isOpen={isPanelOpen}
          onClose={() => { setIsPanelOpen(false); setEditingOfficer(null); }}
          onSuccess={() => {
            loadData(currentPage);
            refreshCounts();
            if (editingOfficer && selectedOfficer && selectedOfficer.id === editingOfficer.id) {
              pb.collection(COLLECTION_FOR[editingOfficer.type])
                .getOne(editingOfficer.id)
                .then((fresh: any) => setSelectedOfficer(
                  editingOfficer.type === 'Other' ? normalizeOther(fresh) : { ...fresh, type: editingOfficer.type }
                ))
                .catch(() => setSelectedOfficer(null));
            }
            setEditingOfficer(null);
            setIsPanelOpen(false);
          }}
          officerType={panelOfficerType ?? undefined}
          editOfficer={editingOfficer}
        />
      </div>
    </div>
  );
}