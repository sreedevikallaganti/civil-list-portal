'use client';

/* /associates — directors and other senior officials, kept apart from employees and officers.
   The columns are the user's own (Fields). Excel uploads go through drafts first (/associates/imports).
   Data: lib/associates.ts · lib/associatesApi.ts · pb_migrations/1790900000_associates.js */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowDown, ArrowUp, Briefcase, Building2, CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Crown, Download,
  FileSpreadsheet, Loader2, MapPin, Plus, Users,
  Pencil, Search, Settings2, Sparkles, Trash2, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit } from '@/lib/roles';
import { showToast } from '@/components/Toaster';
import {
  compareBy, coreFieldOf, displayValue, meetingWithAssociate, filterableFields, matchesSearch, missingCoreFields, orderedFields, SUGGESTED_FIELDS, tableColumns, toKey,
  type Associate, type AssociateField,
} from '@/lib/associates';
import { createField, deleteAssociate, errorText, listAssociates, listFields, runPool } from '@/lib/associatesApi';
import { exportAssociates } from '@/lib/associateExcel';
import AssociatePanel from '@/components/associates/AssociatePanel';
import ManageFieldsPanel from '@/components/associates/ManageFieldsPanel';
import UploadImportsDialog from '@/components/associates/UploadImportsDialog';
import AssociatesFrame, { Section, SectionHeader, StatCard, type Tone } from '@/components/associates/AssociatesFrame';
import { Avatar, btn } from '@/components/associates/ui';

const CreateMeetingPanel = dynamic(() => import('@/components/CreateMeetingPanel'), { ssr: false });

const PER_PAGE = 50;
type Sort = { key: string; dir: 1 | -1 };

export default function AssociatesPage() {
  const { user } = useAuth();
  const editable = canEdit(user);

  const [fields, setFields] = useState<AssociateField[]>([]);
  const [people, setPeople] = useState<Associate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  /* field key → the value to show only (Cadre = Tamil Nadu, Batch = 2001 …) */
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* the selection the user said "delete" to; any change to the selection asks again */
  const [confirmFor, setConfirmFor] = useState<Set<string> | null>(null);
  const confirmBulk = confirmFor === selected;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  /* "Schedule meeting": the New Meeting form, opened right here with the associate filled in (like Employees) */
  const [scheduleWith, setScheduleWith] = useState<ReturnType<typeof meetingWithAssociate> | null>(null);
  const schedule = (a: Associate) => { setPanel({ open: false, associate: null }); setScheduleWith(meetingWithAssociate(a, fields)); };
  const [panel, setPanel] = useState<{ open: boolean; associate: Associate | null; edit?: boolean }>({ open: false, associate: null });
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const armedDelete = useRef<{ id: string; at: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([listFields(), listAssociates()]);
      setFields(f);
      setPeople(p);
      setLoadError('');
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── the table ── */
  /* Name, Cadre, Batch, Designation, Department — and other fields only once someone has a value in them */
  /* every field (standard ones first) — the form, details, filters and export all use this */
  const ordered = useMemo(() => orderedFields(fields), [fields]);
  const missingCore = useMemo(() => missingCoreFields(fields), [fields]);
  // the table: Name + Department, Cadre, Designation, Batch year — everything else is in each person's details
  const columns = useMemo(() => tableColumns(fields), [fields]);

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v);
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const list = people.filter((a) => matchesSearch(a, query)
      && active.every(([k, v]) => displayValue(byKey.get(k), a.data?.[k]) === v));
    const field = sort.key === 'name' ? 'name' : fields.find((f) => f.key === sort.key);
    return field ? list.sort(compareBy(field, sort.dir)) : list;
  }, [people, query, sort, fields, filters]);

  /* stat cards: how many different cadres / batches / designations / departments, and how many people have one */
  const glance = useMemo(() => {
    const STAT: Record<string, { label: string; icon: typeof Users; tone: Tone }> = {
      cadre: { label: 'Cadres', icon: MapPin, tone: 'sky' },
      batch: { label: 'Batches', icon: CalendarDays, tone: 'emerald' },
      designation: { label: 'Designations', icon: Briefcase, tone: 'indigo' },
      department: { label: 'Departments', icon: Building2, tone: 'rose' },
    };
    return ['cadre', 'batch', 'designation', 'department'].map((core) => {
      const f = fields.find((x) => coreFieldOf(x) === core);
      const values = f ? people.map((a) => String(a.data?.[f.key] ?? '').trim()).filter(Boolean) : [];
      return { core, ...STAT[core], distinct: new Set(values.map((v) => v.toLowerCase())).size, filled: values.length };
    });
  }, [fields, people]);

  const filterOptions = useMemo(() => filterableFields(ordered, people).slice(0, 6), [ordered, people]);

  async function addMissingCore() {
    setStarting(true);
    let order = Math.max(-1, ...fields.map((f) => f.sort_order ?? 0)) + 1;
    const made: AssociateField[] = [];
    const failed = await runPool(missingCore, async (s) => {
      const key = fields.some((f) => f.key === s.key) ? toKey(s.label, fields.map((f) => f.key)) : s.key;
      made.push(await createField({ ...s, key, sort_order: order++ }));
    }, undefined, 1);
    setFields((f) => [...f, ...made]);
    setStarting(false);
    if (failed.length) showToast(failed[0].error, 'error');
    else showToast(`Added ${made.map((f) => f.label).join(', ')}`, 'success');
  }
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const setFilter = (key: string, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const search = (q: string) => { setQuery(q); setPage(1); };

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((s) => {
    const next = new Set(s);
    for (const r of rows) {
      if (allOnPageSelected) next.delete(r.id); else next.add(r.id);
    }
    return next;
  });
  const toggleOne = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* ── actions ── */
  function onSaved(a: Associate, isNew: boolean) {
    setPeople((list) => (isNew ? [...list, a] : list.map((x) => (x.id === a.id ? a : x))));
    if (isNew) setPanel({ open: false, associate: null });
    else setPanel({ open: true, associate: a });
  }

  async function deleteOne(a: Associate) {
    const armed = armedDelete.current;
    if (!armed || armed.id !== a.id || Date.now() - armed.at > 4000) {
      armedDelete.current = { id: a.id, at: Date.now() };
      showToast(`Click delete again to remove ${a.name}`, 'error');
      return;
    }
    armedDelete.current = null;
    try {
      await deleteAssociate(a.id);
      setPeople((list) => list.filter((x) => x.id !== a.id));
      setSelected((s) => { const n = new Set(s); n.delete(a.id); return n; });
      setPanel({ open: false, associate: null });
      showToast(`${a.name} deleted`, 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
    }
  }

  async function deleteSelected() {
    if (!confirmBulk) {
      setConfirmFor(selected);
      return;
    }
    setBulkBusy(true);
    const ids = [...selected];
    const failed = await runPool(ids, (id) => deleteAssociate(id));
    const gone = new Set(ids.filter((id) => !failed.some((f) => f.item === id)));
    setPeople((list) => list.filter((x) => !gone.has(x.id)));
    setSelected(new Set(failed.map((f) => f.item)));
    setBulkBusy(false);
    if (failed.length) showToast(`${failed.length} could not be deleted: ${failed[0].error}`, 'error');
    else showToast(`${gone.size} ${gone.size === 1 ? 'associate' : 'associates'} deleted`, 'success');
  }

  async function exportList(onlySelected: boolean) {
    const list = onlySelected ? filtered.filter((a) => selected.has(a.id)) : filtered;
    try {
      await exportAssociates(fields, list, `associates-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      showToast(errorText(err), 'error');
    }
  }

  async function startWithSuggested() {
    setStarting(true);
    const made: AssociateField[] = [];
    const failed = await runPool(SUGGESTED_FIELDS, async (s) => { made.push(await createField(s)); }, undefined, 1);
    setFields((f) => [...f, ...made].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setStarting(false);
    if (failed.length) showToast(failed[0].error, 'error');
  }

  /* ── render ── */
  const isEmpty = !loading && !loadError && people.length === 0;

  return (
    <AssociatesFrame
      count={loading ? undefined : people.length}
      countLabel={loading ? 'Loading…' : 'Directors and senior officials'}
      actions={!loadError && (
        <>
          {editable && (
            <button type="button" onClick={() => setFieldsOpen(true)} className={btn.secondary}>
              <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Fields</span>
            </button>
          )}
          {people.length > 0 && (
            <button type="button" onClick={() => exportList(false)} className={btn.secondary}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
            </button>
          )}
          {editable && (
            <>
              <button type="button" onClick={() => setImportOpen(true)} className={btn.secondary}>
                <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Upload Excel</span>
              </button>
              <button type="button" onClick={() => setPanel({ open: true, associate: null })} className={btn.primary}>
                <Plus className="h-4 w-4" /> Add associate
              </button>
            </>
          )}
        </>
      )}
    >

      {loadError ? (
        <div className="rounded-3xl bg-rose-50 p-6 text-center ring-1 ring-rose-100" role="alert">
          <p className="font-semibold text-rose-900">The Associates list couldn&apos;t be loaded</p>
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className={`${btn.secondary} mt-4`}>Try again</button>
        </div>
      ) : loading ? (
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-0">
              <span className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
              <span className="h-3 w-40 animate-pulse rounded bg-slate-100" />
              <span className="ml-auto h-3 w-24 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        /* first visit: how to get started */
        <div className="asc-fade-up rounded-3xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-slate-100">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Crown className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Build your list of associates</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Keep directors and other senior officials in one place. Import them from an Excel sheet, or add them one by one.
          </p>
          {editable ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => setImportOpen(true)} className={btn.violet}>
                <FileSpreadsheet className="h-4 w-4" /> Import from Excel
              </button>
              <button type="button" onClick={() => setPanel({ open: true, associate: null })} className={btn.secondary}>
                <Plus className="h-4 w-4" /> Add one person
              </button>
              {fields.length === 0 && (
                <button type="button" onClick={startWithSuggested} disabled={starting} className={btn.ghost}>
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Start with Cadre, Batch, Designation, Department
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Nobody has been added yet.</p>
          )}
          {fields.length > 0 && (
            <p className="mt-5 text-xs text-slate-400">Fields: Name · {ordered.map((f) => f.label).join(' · ')}</p>
          )}
        </div>
      ) : (
        <>
          {/* at a glance — one colour per meaning, like the Officers directory */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:gap-5">
            <StatCard label="Associates" value={people.length} caption="People in the list" icon={Users} tone="violet" pct={100} delay={60} />
            {glance.map((g, i) => (
              <StatCard key={g.core} label={g.label} value={g.distinct} caption={`${g.filled} of ${people.length} filled in`}
                icon={g.icon} tone={g.tone} pct={people.length ? (g.filled / people.length) * 100 : 0} delay={120 + i * 60} />
            ))}
          </section>

          {/* the standard fields the list doesn't have yet */}
          {editable && missingCore.length > 0 && fields.length > 0 && (
            <div className="flex flex-col gap-2 rounded-3xl bg-white px-5 py-3.5 text-sm shadow-sm ring-1 ring-slate-100 sm:flex-row sm:items-center">
              <p className="flex-1 text-slate-600">
                The list has no <strong>{missingCore.map((f) => f.label).join(', ')}</strong> {missingCore.length === 1 ? 'field' : 'fields'} yet.
              </p>
              <button type="button" onClick={addMissingCore} disabled={starting} className={btn.secondary}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add {missingCore.length === 1 ? 'it' : 'them'}
              </button>
            </div>
          )}

          {/* search + filters */}
          <Section className="p-4 lg:p-5" delay={360}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Search associates by name, cadre, batch, designation or department…"
                  aria-label="Search associates"
                  className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
              </div>
              {filterOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {filterOptions.map(({ field, values }) => (
                    <label key={field.key} className="relative">
                      <span className="sr-only">Filter by {field.label}</span>
                      <select
                        value={filters[field.key] || ''}
                        onChange={(e) => setFilter(field.key, e.target.value)}
                        className={`max-w-[15rem] cursor-pointer appearance-none rounded-full border py-2.5 pl-4 pr-9 text-sm font-medium outline-none transition-colors focus:ring-4 focus:ring-violet-500/10 ${
                          filters[field.key] ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <option value="">{field.label}: all</option>
                        {values.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {editable && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-lg shadow-slate-900/10">
              <span className="font-semibold">{selected.size} selected</span>
              <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
                <X className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => exportList(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium hover:bg-white/10">
                <Download className="h-4 w-4" /> Export
              </button>
              <button type="button" onClick={deleteSelected} disabled={bulkBusy}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${confirmBulk ? 'bg-rose-600 hover:bg-rose-500' : 'hover:bg-white/10'}`}>
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {confirmBulk ? `Delete ${selected.size}? Click to confirm` : 'Delete'}
              </button>
            </div>
          )}

          <Section className="overflow-hidden" delay={420}>
            <SectionHeader
              icon={Users}
              title={query || activeFilters > 0 ? 'All associates · search results' : 'All associates'}
              count={filtered.length}
              badge={(query || activeFilters > 0) ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15">filtered</span> : undefined}
              right={(query || activeFilters > 0) ? (
                <button type="button" onClick={() => { search(''); setFilters({}); }}
                  className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100">
                  Clear filters
                </button>
              ) : undefined}
            />
            <div className="nice-scrollbar max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 backdrop-blur">
                  <tr className="border-b border-slate-200/80">
                    {editable && (
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Select all on this page" className="h-4 w-4 accent-violet-600" />
                      </th>
                    )}
                    <SortHeader label="Name" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                    {columns.map((f) => (
                      <SortHeader key={f.key} label={f.label} active={sort.key === f.key} dir={sort.dir} onClick={() => toggleSort(f.key)} />
                    ))}
                    {editable && <th className="w-36 px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setPanel({ open: true, associate: a })}
                      className={`cursor-pointer transition-colors hover:bg-violet-50/40 ${selected.has(a.id) ? 'bg-violet-50/60' : ''}`}
                    >
                      {editable && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} aria-label={`Select ${a.name}`} className="h-4 w-4 accent-violet-600" />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <button type="button" className="flex items-center gap-3 text-left" onClick={(e) => { e.stopPropagation(); setPanel({ open: true, associate: a }); }}>
                          <Avatar name={a.name} />
                          <span className="font-semibold text-slate-900">{a.name}</span>
                        </button>
                      </td>
                      {columns.map((f) => {
                        const v = displayValue(f, a.data?.[f.key]);
                        return (
                          <td key={f.key} className="max-w-[16rem] truncate px-4 py-3 text-slate-600" title={v}>
                            {v ? (f.type === 'select' ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{v}</span> : v) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      {editable && (
                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => schedule(a)}
                              className={`${btn.icon} hover:bg-violet-50 hover:text-violet-600`} aria-label={`Schedule a meeting with ${a.name}`} title="Schedule meeting">
                              <CalendarPlus className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setPanel({ open: true, associate: a, edit: true })}
                              className={btn.icon} aria-label={`Edit ${a.name}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => deleteOne(a)}
                              className={`${btn.icon} hover:bg-rose-50 hover:text-rose-600`} aria-label={`Delete ${a.name}`} title="Delete (click twice)">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={columns.length + (editable ? 3 : 1)} className="px-4 py-14 text-center">
                        <p className="font-semibold text-slate-700">{query ? <>No one matches &ldquo;{query}&rdquo;</> : 'No one matches these filters'}</p>
                        <button type="button" onClick={() => { search(''); setFilters({}); }} className={`${btn.ghost} mt-2`}>Clear search and filters</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3.5 text-sm text-slate-500">
                <span>{(current - 1) * PER_PAGE + 1}–{Math.min(current * PER_PAGE, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1} className={btn.secondary}>
                    <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
                  </button>
                  <button type="button" onClick={() => setPage(current + 1)} disabled={current === pages} className={btn.secondary}>
                    <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      <AssociatePanel
        key={panel.open ? `${panel.associate?.id || 'new'}:${panel.edit ? 'edit' : 'view'}` : 'closed'}
        open={panel.open}
        associate={panel.associate}
        startInEdit={!!panel.edit}
        fields={ordered}
        people={people}
        editable={editable}
        onClose={() => setPanel({ open: false, associate: null })}
        onSaved={onSaved}
        onDelete={deleteOne}
        onManageFields={() => setFieldsOpen(true)}
        onSchedule={schedule}
      />
      {scheduleWith && (
        <CreateMeetingPanel
          key={`schedule-${scheduleWith.officer_id}`}
          isOpen
          duplicateFrom={scheduleWith}
          onClose={() => setScheduleWith(null)}
          onSuccess={() => { setScheduleWith(null); showToast('Meeting scheduled', 'success'); }}
        />
      )}
      {editable && (
        <>
          <ManageFieldsPanel
            open={fieldsOpen}
            onClose={() => setFieldsOpen(false)}
            fields={fields}
            people={people}
            onFieldsChange={setFields}
            onReload={load}
          />
          <UploadImportsDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            fields={fields}
            onUploaded={() => {}}
          />
        </>
      )}
    </AssociatesFrame>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <th className="px-4 py-3" aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-slate-800 ${active ? 'text-slate-900' : ''}`}>
        {label}
        {active && (dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
