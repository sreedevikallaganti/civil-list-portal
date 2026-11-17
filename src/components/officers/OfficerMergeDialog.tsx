'use client';

/* Merge duplicate officers (Officers page → "Merge duplicates", admins).

   1. Scan   — reads the IAS / IPS / IFS / IRS directories and all meetings, finds officers that appear twice by name.
   2. Review — each group shows its records, which one is kept, and how many meetings each has. Groups that look like
               one person are ticked; groups whose officer ID / batch / birth date differ are left unticked.
               Also lists the meetings that point to nobody any more and can be linked by name.
   3. Merge  — after approval: meetings move to the kept record (main participant and other participants), the kept
               record fills its blanks from the duplicates, and each duplicate is archived in `deleted_records`
               (with what it was merged into and which meetings moved — the history) before it is removed. */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, GitMerge, Link2, Loader2, Search, X } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { logActivity } from '@/lib/activity';
import { OFFICER_COLLECTION, OFFICER_SERVICES, type OfficerService } from '@/lib/officerDirectory';
import { meetingParticipants } from '@/lib/participants';
import {
  fillBlanks, findDuplicates, relinkContext, relinkMeeting,
  type DirectoryRecord, type DuplicateGroup, type MeetingFix, type MeetingLink,
} from '@/lib/officerMerge';

const ARCHIVE = 'deleted_records';
const gid = (g: DuplicateGroup) => `${g.service}:${g.key}`;
const errText = (e: any) => e?.response?.message || e?.message || 'Unknown error';

async function pool<T>(items: T[], work: (t: T) => Promise<void>, onStep: () => void, lanes = 4) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, async () => {
    while (next < items.length) { const it = items[next++]; await work(it); onStep(); }
  }));
}

type Loaded = { dir: Record<OfficerService, DirectoryRecord[]>; meetings: MeetingLink[] };
type Outcome = { merged: number; archived: number; meetings: number; failures: string[]; report: string };

export default function OfficerMergeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'same' | 'different' | 'byname'>('same');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, running]);

  /* 1. scan */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dir = {} as Loaded['dir'];
        await Promise.all(OFFICER_SERVICES.map(async (s) => {
          dir[s] = await pb.collection(OFFICER_COLLECTION[s]).getFullList<DirectoryRecord>({ batch: 1000, requestKey: null })
            .catch((e) => { if (e?.status === 404) return []; throw e; });
        }));
        const meetings = await pb.collection('meetings').getFullList<MeetingLink>({
          batch: 1000, requestKey: null,
          fields: 'id,officer_id,officer_name,officer_type,participants,agenda,meeting_date',
        });
        if (!alive) return;
        setData({ dir, meetings });
        const groups = OFFICER_SERVICES.flatMap((s) => findDuplicates(s, dir[s]));
        setSelected(new Set(groups.filter((g) => !g.conflict).map(gid)));
      } catch (e) {
        if (alive) setLoadError(errText(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => (data ? OFFICER_SERVICES.flatMap((s) => findDuplicates(s, data.dir[s])) : []), [data]);
  const keepOf = (g: DuplicateGroup) => keep[gid(g)] || g.keepId;

  /* how many meetings point at each record */
  const meetingCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data?.meetings || []) {
      for (const p of meetingParticipants(x)) if (p.id) m.set(p.id, (m.get(p.id) || 0) + 1);
    }
    return m;
  }, [data]);

  /* 2. the plan for what is ticked */
  const plan = useMemo(() => {
    if (!data) return null;
    const moved = new Map<string, string>();
    const chosen = groups.filter((g) => selected.has(gid(g)));
    for (const g of chosen) for (const r of g.records) if (r.id !== keepOf(g)) moved.set(r.id, keepOf(g));
    const remaining = {} as Record<OfficerService, DirectoryRecord[]>;
    for (const s of OFFICER_SERVICES) remaining[s] = data.dir[s].filter((r) => !moved.has(r.id));
    const ctx = relinkContext(remaining, moved);
    const fixes = data.meetings.map((m) => relinkMeeting(m, ctx)).filter((f): f is MeetingFix => !!f);
    const byName = fixes.filter((f) => f.changes.some((c) => c.why === 'by name'));
    return { chosen, moved, fixes, byName, dupCount: moved.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groups, selected, keep]);

  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => (tab === 'same' ? !g.conflict : !!g.conflict))
    .filter((g) => !q || g.records.some((r) => String(r.name).toLowerCase().includes(q)));

  const toggle = (g: DuplicateGroup) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(gid(g))) n.delete(gid(g)); else n.add(gid(g));
    return n;
  });

  /* 3. merge */
  async function apply() {
    if (!data || !plan) return;
    const failures: string[] = [];
    const lines = ['Kind,Service,Name,Record id,Kept record id,Meeting id,Note'];
    let step = 0;
    const total = plan.fixes.length + plan.dupCount + plan.chosen.length;
    const tick = () => setRunning(`Working… ${++step} of ${total}`);
    setRunning('Starting…');
    const movedMeetings = new Map<string, string[]>(); // duplicate id → meeting ids moved off it

    // a. meetings first: they always point to a record that still exists
    await pool(plan.fixes, async (f) => {
      try {
        await pb.collection('meetings').update(f.id, f.patch, { requestKey: null });
        for (const c of f.changes) {
          if (c.from && c.why === 'merged') movedMeetings.set(c.from, [...(movedMeetings.get(c.from) || []), f.id]);
          lines.push(['meeting', '', c.name, c.from, c.to, f.id, c.why].map(csv).join(','));
        }
      } catch (e) { failures.push(`Meeting ${f.id}: ${errText(e)}`); }
    }, tick);

    // b. each group: archive + remove the duplicates, then fill the kept record's blanks
    let merged = 0, archived = 0;
    for (const g of plan.chosen) {
      const keepRec = g.records.find((r) => r.id === keepOf(g))!;
      const dups = g.records.filter((r) => r.id !== keepRec.id);
      let ok = true;
      for (const d of dups) {
        try {
          const { id, collectionId, collectionName, expand, ...rest } = d;
          void collectionId; void collectionName; void expand;
          await pb.collection(ARCHIVE).create({
            original_collection: OFFICER_COLLECTION[g.service],
            original_id: id,
            record_type: `${g.service} officer (merged)`,
            record_data: {
              ...rest,
              merged_into: keepRec.id, merged_into_name: keepRec.name, merged_at: new Date().toISOString(),
              meetings_moved: movedMeetings.get(id) || [],
            },
            deleted_at: new Date().toISOString(),
          }, { requestKey: null });
          archived++;
          await pb.collection(OFFICER_COLLECTION[g.service]).delete(id, { requestKey: null });
          lines.push(['merged', g.service, d.name, id, keepRec.id, '', 'archived in deleted_records'].map(csv).join(','));
        } catch (e) {
          ok = false;
          failures.push(`${g.service} “${d.name}” (${d.id}): ${errText(e)} — this record was left as it was.`);
        }
        tick();
      }
      const patch = fillBlanks(keepRec, dups);
      if (Object.keys(patch).length) {
        try { await pb.collection(OFFICER_COLLECTION[g.service]).update(keepRec.id, patch, { requestKey: null }); }
        catch (e) { failures.push(`${g.service} “${keepRec.name}”: details from the duplicate weren’t copied — ${errText(e)}`); }
      }
      tick();
      if (ok) merged++;
    }

    logActivity('updated', 'officer',
      `Merged ${merged} duplicate officer ${merged === 1 ? 'group' : 'groups'}, relinked ${plan.fixes.length - failures.filter((f) => f.startsWith('Meeting')).length} meetings`);
    setRunning('');
    setOutcome({ merged, archived, meetings: plan.fixes.length, failures, report: lines.join('\n') });
    onDone();
  }

  /* ── render ── */
  const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="merge-off-title">
      <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><GitMerge className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="merge-off-title" className="text-lg font-bold text-slate-900">Merge duplicate officers</h2>
            <p className="text-sm text-slate-500">The same officer twice in IAS / IPS / IFS / IRS — merged into one, with all their meetings.</p>
          </div>
          <button type="button" onClick={onClose} disabled={!!running} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">{body}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-7">{footer}</footer>}
      </div>
    </div>
  );

  if (loadError) return shell(<p className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-800" role="alert">The directory couldn’t be read: {loadError}</p>);
  if (!data || !plan) {
    return shell(<p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> Reading the officers and meetings…</p>);
  }

  if (outcome) {
    return shell(
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-950">
            <p className="text-base font-bold">Done</p>
            <p>{outcome.merged} {outcome.merged === 1 ? 'officer' : 'officers'} merged · {outcome.archived} duplicate {outcome.archived === 1 ? 'record' : 'records'} archived · {outcome.meetings - outcome.failures.filter((f) => f.startsWith('Meeting')).length} meetings relinked</p>
            <p className="mt-1 text-emerald-800">The removed duplicates are kept in <strong>deleted_records</strong> with the record they were merged into and the meetings that moved.</p>
          </div>
        </div>
        {outcome.failures.length > 0 && (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900" role="alert">
            <p className="font-semibold">{outcome.failures.length} {outcome.failures.length === 1 ? 'step' : 'steps'} didn’t work (nothing was lost):</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">{outcome.failures.slice(0, 12).map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </div>,
      <>
        <button type="button" onClick={() => download(outcome.report)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> Download report
        </button>
        <button type="button" onClick={onClose} className="ml-auto rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Close</button>
      </>,
    );
  }

  const same = groups.filter((g) => !g.conflict).length;
  const different = groups.length - same;
  const byMerge = plan.fixes.length - plan.byName.length;

  return shell(
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card tone="indigo" value={plan.chosen.length} label={`of ${groups.length} duplicate ${groups.length === 1 ? 'group' : 'groups'} ticked`} />
        <Card tone="emerald" value={byMerge} label="meetings move to the kept record" />
        <Card tone="sky" value={plan.byName.length} label="meetings linked by name (their record was gone)" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {([['same', `Same person (${same})`], ['different', `Possibly different people (${different})`], ['byname', `Linked by name (${plan.byName.length})`]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        {tab !== 'byname' && (
          <label className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search names</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </label>
        )}
      </div>

      {tab === 'different' && different > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> These share a name, but their officer ID, batch or date of birth differ — usually two different officers. Tick one only if you are sure it is the same person.
        </p>
      )}

      {tab === 'byname' ? (
        plan.byName.length ? (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {plan.byName.slice(0, 200).map((f) => {
              const m = data.meetings.find((x) => x.id === f.id);
              return f.changes.filter((c) => c.why === 'by name').map((c) => (
                <li key={`${f.id}:${c.from}:${c.name}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Link2 className="h-4 w-4 shrink-0 text-sky-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{c.name}</span>
                    <span className="block truncate text-xs text-slate-500">{m?.agenda || 'Meeting'} · {String(m?.meeting_date || '').slice(0, 10)}</span>
                  </span>
                  <span className="text-xs text-slate-400">{c.from ? 'record gone' : 'no record'} → linked</span>
                </li>
              ));
            })}
          </ul>
        ) : <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Every meeting points to an existing officer.</p>
      ) : shown.length ? (
        <ul className="space-y-3">
          {shown.slice(0, 300).map((g) => {
            const on = selected.has(gid(g));
            return (
              <li key={gid(g)} className={`rounded-2xl border p-4 ${on ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200'}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggle(g)} className="h-4 w-4 accent-indigo-600" />
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{g.service}</span>
                  <span className="flex-1 font-semibold text-slate-900">{g.records[0].name}</span>
                  {g.conflict && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{g.conflict}</span>}
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {g.records.map((r) => {
                    const kept = keepOf(g) === r.id;
                    return (
                      <label key={r.id} className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-xs ${kept ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                        <input type="radio" name={`keep-${gid(g)}`} checked={kept} onChange={() => setKeep((k) => ({ ...k, [gid(g)]: r.id }))} className="mt-0.5 accent-emerald-600" />
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">{r.name}</span>
                            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${kept ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{kept ? 'KEEP' : 'MERGE IN'}</span>
                          </span>
                          <Detail k="Batch" v={r.batch} /><Detail k="Cadre" v={r.cadre} /><Detail k="Designation" v={r.designation} />
                          <Detail k="Officer ID" v={r.officer_id} /><Detail k="Email" v={r.email} /><Detail k="Phone" v={r.contact_number} />
                          <span className="block text-slate-400">
                            {meetingCount.get(r.id) || 0} {(meetingCount.get(r.id) || 0) === 1 ? 'meeting' : 'meetings'} · updated {String(r.updated || '').slice(0, 10) || '—'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </li>
            );
          })}
          {shown.length > 300 && <li className="text-center text-xs text-slate-400">Showing 300 of {shown.length} — search to narrow down.</li>}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          {groups.length ? 'Nothing here.' : 'No officer appears twice — nothing to merge.'}
        </p>
      )}
    </div>,
    <>
      <p className="flex-1 text-xs text-slate-500">
        {running || 'Duplicates are archived in deleted_records (with what they were merged into) before they are removed. Meeting names and details stay as they were saved.'}
      </p>
      <button type="button" onClick={onClose} disabled={!!running} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
      <button type="button" onClick={apply} disabled={!!running || (!plan.chosen.length && !plan.fixes.length)}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
        Approve: merge {plan.chosen.length} &amp; relink {plan.fixes.length} {plan.fixes.length === 1 ? 'meeting' : 'meetings'}
      </button>
    </>,
  );
}

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function download(text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `officer-merge-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Card({ tone, value, label }: { tone: 'indigo' | 'emerald' | 'sky'; value: number; label: string }) {
  const c = { indigo: 'text-indigo-700', emerald: 'text-emerald-700', sky: 'text-sky-700' }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <p className={`text-2xl font-bold tabular-nums ${c}`}>{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return <span className="block truncate text-slate-600"><span className="text-slate-400">{k}:</span> {String(v)}</span>;
}
