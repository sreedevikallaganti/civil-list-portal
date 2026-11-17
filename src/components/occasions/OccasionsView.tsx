'use client';

/* OccasionsView — /occasions: birthdays, service anniversaries, retirements, national & service
   days and the office's own special events — with one-click wishes.
   Special events are stored in the PocketBase `special_events` collection when it exists
   (shared with everyone); otherwise in this browser, with a note on how to share them.

   Officers come straight from the officers directory (ias / ips / ifs / irs_directory):
   birthdays from `date_of_birth`, work anniversaries from `date_of_joining`, retirements
   from the date of birth. Changes made in the Officers Directory show up here live. */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Award, Cake, CalendarHeart, CalendarPlus, Copy, Flag, Loader2, Mail, MessageCircle, Plus, Sparkles, Sunset, Trash2, X,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { OFFICER_COLLECTION, OFFICER_SERVICES, cadreName, positionOf, serviceOf, type OfficerService } from '@/lib/officerDirectory';
import { useAuth } from '@/contexts/AuthContext';
import { showToast } from '@/components/Toaster';
import SendAsPicker, { useSendAs, type SendAsState } from '@/components/SendAsPicker';
import { apiJSON } from '@/lib/apiClient';
import { occasionEmail, type OccasionEmailKind, type SendAs } from '@/lib/emailTemplates';
import {
  buildOccasions, isoDay, retirementDate, whatsappUrl,
  type Occasion, type OccasionKind, type OccasionPerson, type SpecialEvent,
} from '@/lib/occasions';

type Tab = 'all' | OccasionKind;
type Scope = 'mine' | 'all';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'service', label: 'Service anniversaries' },
  { value: 'retirement', label: 'Retirements' },
  { value: 'national', label: 'National & service days' },
  { value: 'event', label: 'Special events' },
];
const RANGES = [
  { days: 0, label: 'Today' },
  { days: 7, label: 'Next 7 days' },
  { days: 30, label: 'Next 30 days' },
  { days: 182, label: 'Next 6 months' },
];
const KIND: Record<OccasionKind, { icon: typeof Cake; tint: string; label: string }> = {
  birthday: { icon: Cake, tint: 'bg-pink-50 text-pink-600', label: 'Birthday' },
  service: { icon: Award, tint: 'bg-amber-50 text-amber-600', label: 'Service anniversary' },
  retirement: { icon: Sunset, tint: 'bg-slate-100 text-slate-600', label: 'Retirement' },
  national: { icon: Flag, tint: 'bg-emerald-50 text-emerald-600', label: 'National / service day' },
  event: { icon: Sparkles, tint: 'bg-violet-50 text-violet-600', label: 'Special event' },
};
const PAGE = 120;
const LOCAL_KEY = 'civillist:special-events';
const day10 = (v: unknown) => String(v || '').slice(0, 10);

function describe(o: Occasion) {
  if (o.kind === 'birthday') return `Turns ${o.years}`;
  if (o.kind === 'service') return `${o.years} year${o.years === 1 ? '' : 's'} of service`;
  if (o.kind === 'retirement') return 'Retires on superannuation (60)';
  return o.notes || KIND[o.kind].label;
}
function whenLabel(o: Occasion) {
  if (o.inDays === 0) return 'Today';
  if (o.inDays === 1) return 'Tomorrow';
  return new Date(`${o.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ── data ── */
// fields a directory record needs here (a field the collection doesn't have yet is simply left out)
const OFFICER_FIELDS = 'id,name,date_of_birth,date_of_joining,designation,department,contact_number,email,batch,cadre';

/** A directory officer or an employee → a person on the Occasions page. */
function toPerson(kind: OccasionPerson['kind'], o: any): OccasionPerson {
  const officer = kind !== 'Employee';
  return {
    key: `${kind}:${o.id}`, id: o.id, kind,
    name: o.name || '—', role: officer ? positionOf(o) : o.current_position || o.designation || '',
    phone: o.contact_number || o.mobile_no || '', email: o.email || '',
    dob: day10(o.date_of_birth),
    serviceStart: day10(officer ? o.date_of_joining : o.appointment_date || o.joining_date),
    batch: String(o.batch || o.batch_year || ''), cadre: officer ? cadreName(o.cadre) : o.cadre || '',
  };
}
const hasDates = (p: OccasionPerson) => Boolean(p.dob || p.serviceStart);

/** Officers met in meetings, by service → their record ids. */
type MetRefs = Record<OfficerService, Set<string>>;
async function loadMetRefs(): Promise<MetRefs> {
  const refs = Object.fromEntries(OFFICER_SERVICES.map((s) => [s, new Set<string>()])) as MetRefs;
  const rows: any[] = await pb.collection('meetings').getFullList({ fields: 'officer_id,officer_type', batch: 1000, requestKey: null }).catch(() => []);
  for (const r of rows) {
    const s = serviceOf(r.officer_type);
    if (s && r.officer_id) refs[s].add(r.officer_id);
  }
  return refs;
}

/** Only the officers in `refs` (fast — "People I meet"). */
async function loadOfficersById(refs: MetRefs): Promise<OccasionPerson[]> {
  const chunks: [OfficerService, string[]][] = [];
  for (const s of OFFICER_SERVICES) {
    const ids = [...refs[s]].filter((id) => /^[a-z0-9]{15}$/i.test(id));
    for (let i = 0; i < ids.length; i += 40) chunks.push([s, ids.slice(i, i + 40)]);
  }
  const lists = await Promise.all(chunks.map(([s, ids]) =>
    pb.collection(OFFICER_COLLECTION[s])
      .getFullList({ fields: OFFICER_FIELDS, filter: ids.map((id) => `id = "${id}"`).join(' || '), requestKey: null })
      .then((rows: any[]) => rows.map((o) => toPerson(s, o)))
      .catch(() => [] as OccasionPerson[])));
  return lists.flat();
}

/** Every officer in the directory (≈21,000 — loaded only when "Whole directory" is chosen). */
async function loadWholeDirectory(): Promise<OccasionPerson[]> {
  const lists = await Promise.all(OFFICER_SERVICES.map((s) =>
    pb.collection(OFFICER_COLLECTION[s])
      .getFullList({ fields: OFFICER_FIELDS, batch: 1000, requestKey: null })
      .then((rows: any[]) => rows.map((o) => toPerson(s, o)))
      .catch((err) => { console.warn(`[occasions] couldn't load ${OFFICER_COLLECTION[s]}`, err); return [] as OccasionPerson[]; })));
  return lists.flat();
}

async function loadEmployees(): Promise<OccasionPerson[]> {
  const rows: any[] = await pb.collection('employees').getFullList({ batch: 500, requestKey: null }).catch(() => []);
  return rows.map((o) => toPerson('Employee', o));
}

/** Merge people by key (later ones win). */
const mergePeople = (...lists: OccasionPerson[][]) => [...new Map(lists.flat().map((p) => [p.key, p])).values()];

export default function OccasionsView() {
  const { user } = useAuth();
  const sender = String(user?.name || '');
  // who greetings come from — "Tejaswi from Brihaspathi Technologies", on behalf of the MD…
  const sendAs = useSendAs();

  const [people, setPeople] = useState<OccasionPerson[] | null>(null);
  const [metIds, setMetIds] = useState<Set<string>>(new Set());
  const [wholeState, setWholeState] = useState<'no' | 'loading' | 'yes'>('no');
  const [events, setEvents] = useState<SpecialEvent[]>([]);
  const [eventsShared, setEventsShared] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [scope, setScope] = useState<Scope>('mine');
  const [days, setDays] = useState(30);
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);

  // the live-update handlers read these without re-subscribing
  const wholeRef = useRef(false);
  const metRef = useRef<Set<string>>(new Set());
  useEffect(() => { wholeRef.current = wholeState === 'yes'; }, [wholeState]);
  useEffect(() => { metRef.current = metIds; }, [metIds]);

  useEffect(() => {
    // first the people you meet (a few records), the whole directory only when asked for
    (async () => {
      const refs = await loadMetRefs();
      setMetIds(new Set(OFFICER_SERVICES.flatMap((s) => [...refs[s]])));
      const [officers, staff] = await Promise.all([loadOfficersById(refs), loadEmployees()]);
      setPeople((prev) => mergePeople(officers, staff, prev ?? []));
    })().catch(() => setPeople((prev) => prev ?? []));
    pb.collection('special_events').getFullList({ sort: 'date', requestKey: null })
      .then((rows: any[]) => setEvents(rows.map((r) => ({ id: r.id, title: r.title, date: day10(r.date), repeats: !!r.repeats, notes: r.notes || '' }))))
      .catch(() => {
        // no shared collection yet → events kept in this browser
        setEventsShared(false);
        console.info('[occasions] special events are kept in this browser only. To share them, create a PocketBase collection "special_events" with fields title (text), date (date), repeats (bool), notes (text), and let signed-in users list / view / create / delete.');
        try { setEvents(JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')); } catch { setEvents([]); }
      });
  }, []);

  /* "Whole directory" → load every officer once */
  const chooseScope = (v: Scope) => {
    setScope(v);
    setLimit(PAGE);
    if (v !== 'all' || wholeState !== 'no') return;
    setWholeState('loading');
    loadWholeDirectory()
      .then((all) => { setPeople((prev) => mergePeople(all, prev ?? [])); setWholeState('yes'); })
      .catch(() => setWholeState('yes'));
  };

  /* LIVE SYNC — an officer added, edited or deleted in the Officers Directory (or an employee
     on the Employees page) updates this page straight away; a new meeting adds the officer
     to "People I meet". */
  useEffect(() => {
    let alive = true;
    const unsubs: (() => void)[] = [];
    const keep = (u: () => void) => (alive ? unsubs.push(u) : u());
    const upsert = (kind: OccasionPerson['kind'], action: string, rec: any) => setPeople((prev) => {
      if (!prev) return prev;
      const key = `${kind}:${rec.id}`;
      const rest = prev.filter((p) => p.key !== key);
      if (action === 'delete') return rest;
      const tracked = kind === 'Employee' || wholeRef.current || metRef.current.has(rec.id) || rest.length !== prev.length;
      return tracked ? [...rest, toPerson(kind, rec)] : prev;
    });
    const watch = (collection: string, kind: OccasionPerson['kind']) =>
      pb.collection(collection).subscribe('*', (e) => upsert(kind, e.action, e.record))
        .then(keep)
        .catch((err) => console.info(`[occasions] live updates off for ${collection}`, err));

    OFFICER_SERVICES.forEach((s) => watch(OFFICER_COLLECTION[s], s));
    watch('employees', 'Employee');
    pb.collection('meetings').subscribe('*', (e) => {
      const s = serviceOf(e.record.officer_type);
      const id = String(e.record.officer_id || '');
      if (e.action === 'delete' || !s || !id || metRef.current.has(id)) return;
      setMetIds((prev) => new Set(prev).add(id));
      pb.collection(OFFICER_COLLECTION[s]).getOne(id, { fields: OFFICER_FIELDS, requestKey: null })
        .then((rec) => setPeople((prev) => mergePeople(prev ?? [], [toPerson(s, rec)])))
        .catch(() => {});
    }).then(keep).catch(() => {});

    return () => { alive = false; unsubs.forEach((u) => u()); };
  }, []);

  const scoped = useMemo(
    () => (people ?? []).filter((p) => hasDates(p) && (scope === 'all' || metIds.has(p.id))),
    [people, scope, metIds],
  );
  const all = useMemo(() => buildOccasions(scoped, events, { days }), [scoped, events, days]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const o of all) c[o.kind] = (c[o.kind] ?? 0) + 1;
    return c;
  }, [all]);
  const shown = (tab === 'all' ? all : all.filter((o) => o.kind === tab));
  const groups = useMemo(() => {
    const g = new Map<string, Occasion[]>();
    for (const o of shown.slice(0, limit)) g.set(whenLabel(o), [...(g.get(whenLabel(o)) ?? []), o]);
    return [...g.entries()];
  }, [shown, limit]);

  const saveEvents = (next: SpecialEvent[]) => {
    setEvents(next);
    if (!eventsShared) try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const addEvent = async (e: Omit<SpecialEvent, 'id'>) => {
    if (eventsShared) {
      try {
        const rec: any = await pb.collection('special_events').create(e);
        saveEvents([...events, { ...e, id: rec.id }]);
      } catch (err) {
        console.warn('[occasions] could not save — check the special_events collection rules in PocketBase', err);
        showToast('Couldn’t save the event — please try again, or ask your administrator.', 'error');
        return false;
      }
    } else {
      saveEvents([...events, { ...e, id: `local-${Date.now()}` }]);
    }
    showToast(`Added “${e.title}”`, 'success');
    return true;
  };
  const removeEvent = async (ev: SpecialEvent) => {
    if (eventsShared) {
      try { await pb.collection('special_events').delete(ev.id); } catch { showToast('Couldn’t delete the event.', 'error'); return; }
    }
    saveEvents(events.filter((x) => x.id !== ev.id));
    showToast(`Removed “${ev.title}”`, 'success');
  };

  const loading = people === null || (scope === 'all' && wholeState !== 'yes');
  const todayCount = all.filter((o) => o.inDays === 0).length;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <div className="relative mx-auto max-w-[1300px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
        {/* App bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><CalendarHeart className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-900">Occasions</h1>
              <p className="truncate text-[11px] text-slate-400">
                {loading ? 'Loading the directory…' : todayCount ? `${todayCount} today — send your wishes` : 'Birthdays, anniversaries, retirements and special days'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setTab('event'); setAdding(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add special event
          </button>
        </div>

        <div className="space-y-5 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
            <div role="tablist" aria-label="Kind" className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setLimit(PAGE); }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${tab === t.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {t.label}
                  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === t.value ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{loading ? '…' : counts[t.value] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex rounded-full bg-slate-100 p-1">
                {([['mine', 'People I meet'], ['all', 'Whole directory']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => chooseScope(v)} aria-pressed={scope === v}
                    data-tooltip={v === 'mine' ? 'Only officers you have had meetings with' : 'Every IAS, IPS, IFS and IRS officer in the directory, plus employees'}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${scope === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
              <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setLimit(PAGE); }} aria-label="Period"
                className="cursor-pointer rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none">
                {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* who wishes are sent from (also signs the WhatsApp / copied text) */}
          <SendAsPicker state={sendAs} />

          {/* Special events: add form + shared-storage note */}
          {tab === 'event' && (
            <div className="space-y-3">
              {adding && <EventForm onCancel={() => setAdding(false)} onSave={async (e) => { if (await addEvent(e)) setAdding(false); }} />}
              {!eventsShared && (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Special events are saved <b>on this computer only</b> for now. To share them with everyone, please ask your administrator.
                </p>
              )}
              {events.length > 0 && (
                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">All special events</p>
                  <ul className="divide-y divide-slate-100">
                    {[...events].sort((a, b) => a.date.localeCompare(b.date)).map((ev) => (
                      <li key={ev.id} className="flex items-center gap-3 py-2.5">
                        <span className="w-28 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                          {new Date(`${ev.date}T00:00:00`).toLocaleDateString('en-IN', ev.repeats ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{ev.title}</span>
                          {(ev.repeats || ev.notes) && <span className="block truncate text-[11px] text-slate-500">{[ev.repeats && 'Every year', ev.notes].filter(Boolean).join(' · ')}</span>}
                        </span>
                        <button type="button" onClick={() => removeEvent(ev)} aria-label={`Delete ${ev.title}`} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* List */}
          <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Loading the directory…</div>
            ) : shown.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <CalendarHeart className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Nothing in this period</p>
                <p className="mt-1 text-xs text-slate-500">
                  {scope === 'mine' ? 'Try “Whole directory”, or a longer period.' : 'Try a longer period.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {groups.map(([label, items]) => (
                  <div key={label} className="px-4 py-3 sm:px-6">
                    <p className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${label === 'Today' ? 'text-pink-600' : 'text-slate-400'}`}>{label}</p>
                    <ul className="space-y-2">{items.map((o) => <OccasionRow key={o.id} o={o} sender={sender} sendAs={sendAs} />)}</ul>
                  </div>
                ))}
                {shown.length > limit && (
                  <div className="px-6 py-3 text-center">
                    <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="text-xs font-semibold text-violet-600 hover:underline">
                      Show more ({shown.length - limit} left)
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── one occasion with its actions ── */
function OccasionRow({ o, sender, sendAs }: { o: Occasion; sender: string; sendAs: SendAsState }) {
  const k = KIND[o.kind];
  const Icon = k.icon;
  const p = o.person;
  const [sending, setSending] = useState(false);
  // the same words as the email (lib/emailTemplates), signed by the chosen sender
  const signedBy: SendAs = sendAs.me
    ? {
      signer: { name: sendAs.me.label, title: sendAs.me.title, email: sendAs.me.email },
      onBehalfOf: sendAs.onBehalf && sendAs.principal ? { name: sendAs.principal.label, title: sendAs.principal.title } : null,
      org: sendAs.org,
    }
    : { signer: { name: sender || 'Brihaspathi Technologies' }, org: sendAs.org };
  const kind = o.kind as OccasionEmailKind;
  const mail = occasionEmail({ kind, recipientName: p?.name, years: o.years, title: o.title, notes: o.notes, sendAs: signedBy });
  const text = mail.text;
  const sendEmail = async () => {
    if (!p?.email || sending) return;
    setSending(true);
    try {
      await apiJSON('/api/occasion-email', {
        kind, to: p.email, name: p.name, years: o.years, title: o.title, notes: o.notes, ...sendAs.payload,
      }, { timeoutMs: 60_000 });
      showToast(`Wishes emailed to ${p.name}`, 'success');
    } catch (err: any) {
      console.warn('[occasions] email failed', err);
      showToast(err?.message || 'The email couldn’t be sent — please try again.', 'error');
    } finally {
      setSending(false);
    }
  };
  const wa = p ? whatsappUrl(p.phone, text) : null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); showToast('Message copied', 'success'); }
    catch { showToast('Copy didn’t work on this browser', 'error'); }
  };
  const btn = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700';
  const officer = p && p.kind !== 'Employee' ? p : null;
  const retired = officer && officer.dob && o.kind !== 'retirement' && retirementDate(officer.dob) < isoDay(new Date());

  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5 ${o.inDays === 0 ? 'border-pink-200 bg-pink-50/40' : 'border-slate-100'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${k.tint}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {officer ? (
            <Link href={`/officers?open=${officer.kind}:${officer.id}`} className="hover:text-violet-700 hover:underline" data-tooltip="Open this officer’s record in the Officers Directory">
              {o.title}
            </Link>
          ) : o.title}
          {p && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-slate-500">{p.kind}</span>}
          {retired && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-slate-400">Retired</span>}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          <b className="font-semibold text-slate-700">{describe(o)}</b>
          {p && [p.role, p.batch && `Batch ${p.batch}`, p.cadre].filter(Boolean).length > 0 && ` · ${[p.role, p.batch && `Batch ${p.batch}`, p.cadre].filter(Boolean).join(' · ')}`}
        </p>
      </div>
      {p && (
        <div className="flex flex-wrap items-center gap-1.5">
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className={btn} data-tooltip="Open WhatsApp with the message ready to send">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> Wish
            </a>
          )}
          <button type="button" onClick={copy} className={btn} data-tooltip={text}><Copy className="h-3.5 w-3.5" /> Copy</button>
          {p.email && (sendAs.me ? (
            <button type="button" onClick={sendEmail} disabled={sending} className={btn} data-tooltip={`Send a greeting email to ${p.email} as “${sendAs.payload.fromName}”`}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email
            </button>
          ) : (
            <a href={`mailto:${p.email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(text)}`} className={btn} data-tooltip={p.email}>
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          ))}
          {p.kind !== 'Employee' && (
            <Link href={`/meetings?person=${p.kind}:${p.id}`} className={btn} data-tooltip="Schedule a courtesy meeting">
              <CalendarPlus className="h-3.5 w-3.5" /> Meet
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/* ── add a special event ── */
function EventForm({ onSave, onCancel }: { onSave: (e: Omit<SpecialEvent, 'id'>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(isoDay(new Date()));
  const [repeats, setRepeats] = useState(false);
  const [notes, setNotes] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    onSave({ title: title.trim().slice(0, 120), date, repeats, notes: notes.trim().slice(0, 300) });
  };
  const input = 'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10';
  return (
    <form onSubmit={submit} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-violet-200">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">New special event</p>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="What">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office Diwali celebration, Department foundation day" className={input} required />
        </Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} required /></Field>
      </div>
      <div className="mt-3"><Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Venue, who to invite…" className={input} /></Field></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} className="h-4 w-4 accent-violet-600" /> Repeats every year
        </label>
        <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add event</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </label>
  );
}
