'use client';

/* ================================================================
   ParticipantsCard — everyone in the meeting (meeting details panel).
   Each name opens that person's meeting history. "Add participant"
   records people who join while the meeting is on — picked from the
   directory (IAS / IPS / contacts / employees) or typed by name.
   Saved to the `participants` JSON field (lib/participants); their
   e-mails also go into `attendees`, like participants added in the form.
================================================================ */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Users, UserPlus, X, Loader2, Plus, ChevronRight, ChevronUp } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { OFFICER_COLLECTION, OFFICER_SERVICES, positionOf } from '@/lib/officerDirectory';
import { showToast } from '@/components/Toaster';
import { logActivity, meetingLabel } from '@/lib/activity';
import { cleanName } from '@/lib/validation';
import { loadDirectoryEmployees } from '@/components/employees/employee-api';
import { associateSummary } from '@/lib/associates';
import { listAssociates, listFields } from '@/lib/associatesApi';
import { useEmailNames } from '@/lib/emailNames';
import {
  attendeeEmails, meetingParticipants, parseParticipants, samePerson, unnamedEmails,
  PARTICIPANTS_FIELD_HINT, PARTICIPANTS_FIELD_MISSING, type Participant,
} from '@/lib/participants';

const pbq = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const TYPE_CHIP: Record<string, string> = {
  IAS: 'bg-sky-50 text-sky-700 ring-sky-500/20',
  IPS: 'bg-violet-50 text-violet-700 ring-violet-500/20',
  Employee: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20',
  Associate: 'bg-indigo-50 text-indigo-700 ring-indigo-500/20',
};

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

/* employees come from the HRMS — loaded once per page visit */
let employeesCache: Promise<Participant[]> | null = null;
const employeePool = () =>
  (employeesCache ??= loadDirectoryEmployees()
    .then(({ employees }) => employees.map((e) => ({
      id: e.id, name: e.name, type: 'Employee', email: (e.email || '').toLowerCase(), designation: e.designation || '',
    })))
    .catch(() => { employeesCache = null; return []; }));

/* associates (/associates) — loaded once per page visit; their fields are the organisation's own */
let associatesCache: Promise<{ p: Participant; hay: string }[]> | null = null;
const associatePool = () =>
  (associatesCache ??= Promise.all([listFields(), listAssociates()])
    .then(([fields, people]) => people.map((a) => {
      const s = associateSummary(a, fields);
      return {
        p: { id: a.id, name: a.name, type: 'Associate', email: s.email, designation: s.designation || s.organization },
        hay: [a.name, ...Object.values(a.data || {})].join(' ').toLowerCase(),
      };
    }))
    .catch(() => { associatesCache = null; return []; }));

async function searchDirectory(q: string): Promise<Participant[]> {
  const like = (fields: string[]) => fields.map((f) => `${f} ~ "${pbq(q)}"`).join(' || ');
  const officers = (name: string, type: string, fields: string[]) =>
    pb.collection(name).getList(1, 6, { filter: like(fields), sort: 'name', requestKey: null })
      .then((r) => r.items.map((o: any): Participant => ({
        id: o.id, name: o.name || '', type, email: String(o.email || '').toLowerCase(),
        designation: type === 'Other' ? o.designation || o.current_position || o.occupation || '' : positionOf(o),
      })))
      .catch(() => [] as Participant[]);
  const ql = q.toLowerCase();
  const [directory, other, emps, assocs] = await Promise.all([
    Promise.all(OFFICER_SERVICES.map((s) => officers(OFFICER_COLLECTION[s], s, ['name', 'designation', 'email']))),
    officers('other_contacts', 'Other', ['name', 'email']),
    employeePool().then((all) => all.filter((e) => e.name.toLowerCase().includes(ql) || e.email?.includes(ql)).slice(0, 6)),
    associatePool().then((all) => all.filter((a) => a.hay.includes(ql)).slice(0, 6).map((a) => a.p)),
  ]);
  return [...assocs, ...directory.flat(), ...other, ...emps];
}

export default function ParticipantsCard({ meeting, onPatched, onViewHistory }: {
  meeting: any;
  onPatched: (fields: Record<string, any>) => void;
  onViewHistory?: (person: Participant) => void;
}) {
  const names = useEmailNames(unnamedEmails(meeting));
  const all = meetingParticipants(meeting, names);
  const saved = parseParticipants(meeting.participants);

  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Participant[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setExpanded(false); setAdding(false); setQuery(''); }, [meeting?.id]);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  useEffect(() => {
    const q = query.trim();
    if (!adding || q.length < 2) { setResults([]); return; }
    setSearching(true);
    let live = true;
    const t = setTimeout(() => {
      searchDirectory(q)
        .then((r) => { if (live) setResults(r.filter((p) => !all.some((x) => samePerson(x, p)))); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, adding]);

  async function save(next: Participant[], label: string) {
    if (saving) return;
    setSaving(true);
    try {
      /* attendees keeps the e-mails of everyone besides the main participant */
      const mainEmail = String(meeting.email || '').toLowerCase();
      const savedEmails = new Set(saved.map((p) => p.email).filter(Boolean));
      const typed = attendeeEmails(meeting.attendees).filter((e) => !savedEmails.has(e)); // added by hand in the form
      const attendees = Array.from(new Set([...typed, ...next.map((p) => p.email || '')]))
        .filter((e) => e && e !== mainEmail).join(', ');
      const rec = await pb.collection('meetings').update(meeting.id, { participants: next, attendees });
      if (!('participants' in rec)) {
        console.warn(PARTICIPANTS_FIELD_HINT);
        showToast(PARTICIPANTS_FIELD_MISSING, 'error');
        return;
      }
      onPatched({ participants: rec.participants, attendees: rec.attendees });
      logActivity('updated', 'meeting', meetingLabel(meeting), rec.id);
      showToast(label, 'success');
    } catch (e: any) {
      if (e?.status !== 403) console.error('[participants] save failed:', e);
      showToast(e?.status === 403 ? 'You can view this meeting but not change it' : 'Couldn’t save the participants — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const add = (p: Participant) => {
    if (all.some((x) => samePerson(x, p))) { showToast(`${p.name} is already in this meeting`, 'error'); return; }
    save([...saved, p], `${p.name} added to the meeting`).then(() => { setQuery(''); setResults([]); });
  };
  const remove = (p: Participant) =>
    save(saved.filter((x) => !samePerson(x, p)), `${p.name} removed from the meeting`);

  const typedName = cleanName(query).trim();
  const canAddTyped = typedName.length >= 2 && !results.some((r) => r.name.toLowerCase() === typedName.toLowerCase());

  /* a small tile like the others; the full list (and the add search) opens across both columns */
  const open = expanded || adding;
  const first = all[0];
  const openHistory = (p: Participant) => onViewHistory?.(p);

  return (
    <div className={`${open ? 'col-span-2' : ''} rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/[0.04]`}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Users className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Participants{all.length > 1 ? ` (${all.length})` : ''}
        </p>
        {open ? (
          <button
            type="button"
            onClick={() => { setExpanded(false); setAdding(false); setQuery(''); }}
            title="Show less"
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        ) : meeting.id && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Add a participant (someone who joined)"
            className="rounded-full p-1 text-violet-600 transition-colors hover:bg-violet-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!open && (
        <div className="mt-2 text-sm font-semibold text-slate-900">
          {!first ? '—' : (
            <>
              {onViewHistory ? (
                <button type="button" onClick={() => openHistory(first)} title="See all meetings with this person"
                  className="block max-w-full truncate text-left hover:text-violet-700 hover:underline">
                  {first.name}
                </button>
              ) : (
                <Link href={`/meetings?history=${encodeURIComponent(first.name)}${first.id ? `&hid=${encodeURIComponent(first.id)}` : ''}`}
                  className="block max-w-full truncate hover:text-violet-700 hover:underline">
                  {first.name}
                </Link>
              )}
              <button type="button" onClick={() => (all.length === 1 && onViewHistory ? openHistory(first) : setExpanded(true))}
                className="mt-1 block text-[11px] font-semibold text-violet-600 hover:underline">
                {all.length > 1 ? `+${all.length - 1} more · View all →` : 'View history →'}
              </button>
            </>
          )}
        </div>
      )}

      {open && all.length === 0 && <p className="mt-2 text-sm text-slate-400">No participants recorded.</p>}

      {open && <ul className="mt-2 divide-y divide-slate-100">
        {all.map((p, i) => {
          const removable = i > 0 && saved.some((x) => samePerson(x, p));
          const body = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-600">
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-slate-800 group-hover/p:text-violet-700">{p.name}</span>
                  {i === 0 && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">Main</span>}
                  {p.type && TYPE_CHIP[p.type] && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset ${TYPE_CHIP[p.type]}`}>{p.type}</span>
                  )}
                </span>
                {(p.designation || (p.email && p.email !== p.name)) && (
                  <span className="block truncate text-[11px] text-slate-400">{p.designation || p.email}</span>
                )}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover/p:text-violet-500" />
            </>
          );
          const rowCls = 'group/p flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-violet-50/60';
          return (
            <li key={`${p.id || p.email || p.name}-${i}`} className="flex items-center gap-1" title="See all meetings with this person">
              {onViewHistory ? (
                <button type="button" onClick={() => onViewHistory(p)} className={rowCls}>{body}</button>
              ) : (
                <Link
                  href={`/meetings?history=${encodeURIComponent(p.name)}${p.id ? `&hid=${encodeURIComponent(p.id)}` : ''}`}
                  className={rowCls}
                >
                  {body}
                </Link>
              )}
              {removable && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => remove(p)}
                  title={`Remove ${p.name} from this meeting`}
                  className="rounded-full p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>}

      {adding && (
        <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/40 p-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setQuery(''); } }}
              placeholder="Search officers, contacts, employees — or type a name"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
            {(searching || saving) && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" />}
            <button
              type="button"
              onClick={() => { setAdding(false); setQuery(''); }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {(results.length > 0 || canAddTyped) && (
            <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={`${p.type}-${p.id}`}
                  type="button"
                  disabled={saving}
                  onClick={() => add(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white disabled:opacity-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[9px] font-bold text-slate-600 ring-1 ring-slate-200">
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">{p.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{[p.type, p.designation].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                </button>
              ))}
              {canAddTyped && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => add({ id: '', name: typedName, type: '', email: '', designation: '' })}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-violet-300 px-2 py-1.5 text-left text-xs font-semibold text-violet-700 transition-colors hover:bg-white disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" /> Add “{typedName}” (not in the directory)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
