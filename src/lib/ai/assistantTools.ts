/* lib/ai/assistantTools.ts — the tools the AI assistant may use (server side).

   Every tool only READS PocketBase, through the caller's own session (see PbReader), so the
   collection rules and organisation scoping apply. Nothing here creates, changes or deletes a
   record: `draft_meeting` returns a draft that the browser opens in the New Meeting form for the
   MD to review and save.

   Privacy: results sent to the model carry no phone numbers, e-mails or dates of birth. */

import type Anthropic from '@anthropic-ai/sdk';
import {
  canonicalState, metFor, metIndex, normBatch, normText, peopleMetIn, todayISO, toBatchOfficer,
  type BatchOfficer, type Service,
} from '@/lib/batchmates';
import { OFFICER_COLLECTION, OFFICER_SERVICES, serviceOf } from '@/lib/officerDirectory';

/* ── PocketBase access (injected — the route reads with the caller's token; tests use a fake) ── */

export type PbList = { items: Record<string, any>[]; totalItems: number; totalPages: number };
export interface PbReader {
  list(collection: string, opts: { filter?: string; sort?: string; fields?: string; perPage?: number; page?: number }): Promise<PbList>;
}

/* ── what a turn collects for the browser (cards + drafts) ── */

export type PersonCard = {
  ref: string;        // "IAS:<id>" / "IPS:<id>" / "Contact:<id>" — '' when only a name is known
  name: string;
  service: string;    // IAS / IPS / IFS / IRS / Other
  subtitle: string;   // post · cadre · batch
  badge: string;      // "Met 12 Mar 2026" / "Never met" / …
};

export type MeetingDraft = {
  title: string;
  refs: string[];     // directory people, main participant first
  names: string[];    // people with no directory match — kept by name
  date: string;       // YYYY-MM-DD ('' = MD picks)
  time: string;       // HH:mm ('' = MD picks)
  duration: number;   // minutes (0 = MD picks)
  mode: 'online' | 'offline';
  venue: string;
  city: string;
};

export type ToolContext = {
  pb: PbReader;
  today: string;              // YYYY-MM-DD in the app's timezone
  people: PersonCard[];       // filled as tools run
  drafts: MeetingDraft[];
};

/* ── helpers ── */

const COL: Record<Service, string> = OFFICER_COLLECTION;
const OFFICER_FIELDS = 'id,name,service,batch,cadre,designation,department';
const MEETING_FIELDS = 'id,officer_id,officer_name,officer_type,designation,current_position,participants,meeting_date,meeting_time,duration,status,deleted,city,location,address,agenda';
const MAX_RESULTS = 25;

/** escape a value for a PocketBase filter string */
export const pbq = (v: unknown) => String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 80);
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const limitOf = (v: unknown, fallback = 15) => Math.max(1, Math.min(MAX_RESULTS, Number(v) || fallback));
const servicesOf = (v: unknown): Service[] => { const s = serviceOf(v); return s ? [s] : [...OFFICER_SERVICES]; };
const fmtDay = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

function addCard(ctx: ToolContext, card: PersonCard) {
  const key = card.ref || `name:${normText(card.name)}`;
  if (ctx.people.some((p) => (p.ref || `name:${normText(p.name)}`) === key)) return;
  if (ctx.people.length < 40) ctx.people.push(card);
}

function officerCard(o: BatchOfficer, badge = ''): PersonCard {
  return {
    ref: `${o.service}:${o.id}`, name: o.name, service: o.service,
    subtitle: [o.position, o.cadre && `${o.cadre} cadre`, o.batch && `${o.batch} batch`].filter(Boolean).join(' · '),
    badge,
  };
}

const metBadge = (m: { count: number; last: string; next: string }) =>
  m.next ? `Booked ${fmtDay(m.next)}` : m.count ? `Met ${fmtDay(m.last)}` : 'Never met';

/** compact officer for the model — no contact details */
const brief = (o: BatchOfficer) => ({
  id: o.id, service: o.service, name: o.name, batch: o.batch || null, cadre: o.cadre || null,
  state: o.state || null, post: o.position || null,
});

async function allMeetings(pb: PbReader): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await pb.list('meetings', { fields: MEETING_FIELDS, perPage: 500, page });
    out.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return out;
}

async function searchOfficers(pb: PbReader, services: Service[], parts: string[], perPage: number) {
  const filter = parts.join(' && ');
  const lists = await Promise.all(services.map(async (service) => {
    const res = await pb.list(COL[service], { filter, sort: 'name', fields: OFFICER_FIELDS, perPage })
      .catch(() => ({ items: [], totalItems: 0, totalPages: 0 }));
    return { service, total: res.totalItems, items: res.items.map((r) => toBatchOfficer(r, service)) };
  }));
  return lists;
}

/** One officer by id, or by name (exact match preferred). */
async function findOfficer(pb: PbReader, who: { id?: string; name?: string; service?: string }): Promise<BatchOfficer | null> {
  for (const service of servicesOf(who.service)) {
    const filter = who.id ? `id = "${pbq(who.id)}"` : who.name ? `name ~ "${pbq(who.name)}"` : '';
    if (!filter) return null;
    const res = await pb.list(COL[service], { filter, sort: 'name', fields: OFFICER_FIELDS, perPage: 10 })
      .catch(() => ({ items: [] as Record<string, any>[], totalItems: 0, totalPages: 0 }));
    const rows = res.items.map((r) => toBatchOfficer(r, service));
    const exact = rows.find((o) => normText(o.name) === normText(who.name));
    if (exact || rows[0]) return exact || rows[0];
  }
  return null;
}

/* ── tool definitions ── */

export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_officers',
    description: 'Search the IAS / IPS / IFS / IRS officer directory. Use it for questions like "IPS officers of Rajasthan cadre", '
      + '"1988 batch IAS officers", "collectors in Tamil Nadu". At least one filter is required. Returns at most 25 '
      + 'officers per service plus the total count, without contact details.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['IAS', 'IPS', 'IFS', 'IRS', 'any'], description: 'Which service (IFS = Indian Forest Service, IRS = Indian Revenue Service). Default: any.' },
        batch_year: { type: 'integer', description: 'Batch year, e.g. 1988.' },
        cadre: { type: 'string', description: 'Cadre, e.g. "Rajasthan", "AGMUT". Partial text matches.' },
        state: { type: 'string', description: 'State (matched against the cadre). Partial text matches.' },
        designation: { type: 'string', description: 'Words from the current post, e.g. "Collector", "DGP", "Secretary".' },
        name: { type: 'string', description: 'Part of the officer\'s name.' },
        limit: { type: 'integer', description: 'Max officers per service (1-25). Default 15.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'find_officer',
    description: 'Look up one IAS / IPS / IFS / IRS officer by name to learn their service, batch year, cadre and current post. '
      + 'Use it before questions about "the same cadre / batch as <name>", and to get an officer id for a draft.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The officer\'s name (or part of it).' },
        service: { type: 'string', enum: ['IAS', 'IPS', 'IFS', 'IRS', 'any'] },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'batchmates',
    description: 'Officers of the same batch year as a given officer, marked with whether the MD has met them before. '
      + 'Same service by default; set include_other_service to also list the other services (IAS, IPS, IFS, IRS).',
    input_schema: {
      type: 'object',
      properties: {
        officer_name: { type: 'string', description: 'Name of the officer whose batchmates to list.' },
        officer_id: { type: 'string', description: 'Directory id, when known (from another tool).' },
        include_other_service: { type: 'boolean', description: 'Also list the other services (IAS, IPS, IFS, IRS). Default false.' },
        limit: { type: 'integer', description: 'Max people (1-25). Default 20.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'people_met_before',
    description: 'People the MD has already met (past, not cancelled meetings), latest first, with how often and when. '
      + 'Optionally only in a state and/or city. Use it for "who have I met in Tamil Nadu", "who did the MD meet" '
      + '(no state or city = everyone, anywhere), or to suggest people to meet on a visit.',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'State name, e.g. "Tamil Nadu".' },
        city: { type: 'string', description: 'City name, e.g. "Chennai".' },
        since: { type: 'string', description: 'Only meetings on or after this date (YYYY-MM-DD).' },
        limit: { type: 'integer', description: 'Max people (1-25). Default 15.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'check_availability',
    description: 'The MD\'s booked meetings on a day, and whether a given start time + duration is free. '
      + 'Suggests free 30-minute-aligned slots in working hours (09:30-18:30) when it is not.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:mm, 24-hour. Optional.' },
        duration_minutes: { type: 'integer', description: 'Default 30.' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_meeting',
    description: 'Prepare a meeting DRAFT for the MD to review. It is NOT saved: the app opens it in the New Meeting '
      + 'form, pre-filled. Use officer ids from other tools when you have them; people without a directory match are '
      + 'kept by name. Leave date or time empty if the MD has not given them.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Agenda / title, e.g. "1988 Batch Meet".' },
        people: {
          type: 'array',
          description: 'Participants, main participant first.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              id: { type: 'string', description: 'Directory id from search_officers / find_officer / batchmates.' },
              service: { type: 'string', enum: ['IAS', 'IPS', 'IFS', 'IRS', 'Other'] },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        date: { type: 'string', description: 'YYYY-MM-DD, or empty.' },
        time: { type: 'string', description: 'HH:mm 24-hour, or empty.' },
        duration_minutes: { type: 'integer' },
        mode: { type: 'string', enum: ['online', 'offline'], description: 'online = video link; offline = in person.' },
        venue: { type: 'string', description: 'Address / venue for an in-person meeting.' },
        city: { type: 'string' },
      },
      required: ['title', 'people', 'mode'],
      additionalProperties: false,
    },
  },
];

/* ── tool handlers ── */

type Input = Record<string, any>;

async function runSearchOfficers(ctx: ToolContext, input: Input) {
  const parts: string[] = [];
  const batch = normBatch(input.batch_year);
  if (batch) parts.push(`batch = ${Number(batch)}`);
  if (input.cadre) parts.push(`cadre ~ "${pbq(input.cadre)}"`);
  // the directory has no separate state — officers are placed by cadre
  if (input.state) parts.push(`cadre ~ "${pbq(input.state)}"`);
  if (input.designation) parts.push(`(designation ~ "${pbq(input.designation)}" || department ~ "${pbq(input.designation)}")`);
  if (input.name) parts.push(`name ~ "${pbq(input.name)}"`);
  if (!parts.length) return { error: 'Give at least one filter: batch_year, cadre, state, designation or name.' };

  const lists = await searchOfficers(ctx.pb, servicesOf(input.service), parts, limitOf(input.limit));
  const meetings = await allMeetings(ctx.pb).catch(() => []);
  const index = metIndex(meetings, ctx.today);
  return {
    results: lists.map(({ service, total, items }) => ({
      service, total_matching: total,
      officers: items.map((o) => {
        const met = metFor(index, o);
        addCard(ctx, officerCard(o, metBadge(met)));
        return { ...brief(o), met_before: met.count, last_met: met.last || null, next_booked: met.next || null };
      }),
    })),
  };
}

async function runFindOfficer(ctx: ToolContext, input: Input) {
  const o = await findOfficer(ctx.pb, { name: clip(input.name, 80), service: input.service });
  if (!o) return { found: false, note: `No IAS / IPS / IFS / IRS officer named "${clip(input.name, 80)}" in the directory.` };
  const met = metFor(metIndex(await allMeetings(ctx.pb).catch(() => []), ctx.today), o);
  addCard(ctx, officerCard(o, metBadge(met)));
  return { found: true, officer: { ...brief(o), department: o.department || null, met_before: met.count, last_met: met.last || null } };
}

async function runBatchmates(ctx: ToolContext, input: Input) {
  const officer = await findOfficer(ctx.pb, { id: input.officer_id, name: input.officer_name });
  if (!officer) return { found: false, note: 'That officer is not in the directory.' };
  if (!officer.batch) return { found: true, officer: brief(officer), note: 'This officer has no batch year recorded.' };

  const services: Service[] = input.include_other_service ? [...OFFICER_SERVICES] : [officer.service];
  const lists = await searchOfficers(ctx.pb, services, [`batch = ${Number(officer.batch)}`, `id != "${pbq(officer.id)}"`], MAX_RESULTS);
  const index = metIndex(await allMeetings(ctx.pb).catch(() => []), ctx.today);
  const rows = lists.flatMap((l) => l.items)
    .map((o) => ({ o, met: metFor(index, o) }))
    .sort((a, b) => Number(b.met.count > 0) - Number(a.met.count > 0) || b.met.last.localeCompare(a.met.last) || a.o.name.localeCompare(b.o.name))
    .slice(0, limitOf(input.limit, 20));
  rows.forEach(({ o, met }) => addCard(ctx, officerCard(o, metBadge(met))));
  return {
    officer: brief(officer),
    batch: officer.batch,
    total_batchmates: lists.reduce((n, l) => n + l.total, 0),
    batchmates: rows.map(({ o, met }) => ({ ...brief(o), met_before: met.count, last_met: met.last || null, next_booked: met.next || null })),
  };
}

async function runPeopleMetBefore(ctx: ToolContext, input: Input) {
  const state = input.state ? canonicalState(input.state) || clip(input.state, 40) : '';
  const city = clip(input.city, 40);
  // no state / city = everyone the MD has met, anywhere
  const meetings = await allMeetings(ctx.pb);
  const people = peopleMetIn(meetings, { state, city, since: /^\d{4}-\d{2}-\d{2}$/.test(input.since || '') ? input.since : '', today: ctx.today });
  const top = people.slice(0, limitOf(input.limit));
  top.forEach((p) => addCard(ctx, {
    ref: p.id && serviceOf(p.type) ? `${serviceOf(p.type)}:${p.id}` : '',
    name: p.name, service: p.type || 'Other',
    subtitle: [p.designation, p.places.join(', ')].filter(Boolean).join(' · '),
    badge: `Met ${p.timesMet}× · last ${fmtDay(p.lastMet)}`,
  }));
  return {
    where: [city, state].filter(Boolean).join(', ') || 'anywhere',
    total_people: people.length,
    people: top.map((p) => ({
      id: p.id || null, name: p.name, service: p.type || null, post: p.designation || null,
      times_met: p.timesMet, last_met: p.lastMet, last_agenda: clip(p.lastAgenda, 80) || null, places: p.places,
    })),
  };
}

/** "16:00", "4:00 pm", "4 pm" → minutes after midnight (null when unreadable) */
const toMin = (t: unknown) => {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(String(t ?? ''));
  if (!m || (!m[2] && !m[3])) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ampm = (m[3] || '').toLowerCase()[0];
  if (ampm && (h < 1 || h > 12)) return null;
  if (ampm === 'p' && h < 12) h += 12;
  if (ampm === 'a' && h === 12) h = 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function runCheckAvailability(ctx: ToolContext, input: Input) {
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };
  const res = await ctx.pb.list('meetings', {
    filter: `meeting_date >= "${date} 00:00:00" && meeting_date <= "${date} 23:59:59"`,
    fields: MEETING_FIELDS, perPage: 200,
  });
  const busy = res.items
    .filter((m) => !m.deleted && !/cancel|reject/i.test(String(m.status || '')))
    .map((m) => {
      const start = toMin(m.meeting_time);
      return start == null ? null : { start, end: start + (Number(m.duration) || 30), agenda: clip(m.agenda, 60), with: clip(m.officer_name, 60) };
    })
    .filter(Boolean)
    .sort((a, b) => a!.start - b!.start) as { start: number; end: number; agenda: string; with: string }[];

  const duration = Math.max(5, Math.min(600, Number(input.duration_minutes) || 30));
  const clash = (s: number) => busy.find((b) => s < b.end && s + duration > b.start);
  const start = toMin(input.start_time);
  const free: string[] = [];
  for (let s = 9 * 60 + 30; s + duration <= 18 * 60 + 30 && free.length < 6; s += 30) if (!clash(s)) free.push(hhmm(s));

  return {
    date,
    past: date < ctx.today,
    booked: busy.map((b) => ({ from: hhmm(b.start), to: hhmm(b.end), agenda: b.agenda, with: b.with })),
    ...(start != null && {
      requested: `${hhmm(start)}–${hhmm(start + duration)}`,
      requested_is_free: !clash(start),
      clashes_with: clash(start) ? `${clash(start)!.agenda || 'a meeting'} (${hhmm(clash(start)!.start)}–${hhmm(clash(start)!.end)})` : null,
    }),
    free_slots: free,
  };
}

async function runDraftMeeting(ctx: ToolContext, input: Input) {
  const people = Array.isArray(input.people) ? input.people.slice(0, 25) : [];
  if (!people.length) return { error: 'Add at least one person.' };

  const refs: string[] = [];
  const names: string[] = [];
  const resolved: string[] = [];
  for (const p of people) {
    const name = clip(p?.name, 80);
    const service = serviceOf(p?.service) ?? undefined;
    let ref = '';
    if (p?.id && /^[a-z0-9]{15}$/i.test(p.id) && service) ref = `${service}:${p.id}`;
    else if (name) {
      const o = await findOfficer(ctx.pb, { name, service });
      if (o && normText(o.name) === normText(name)) ref = `${o.service}:${o.id}`;
    }
    if (ref) { if (!refs.includes(ref)) refs.push(ref); resolved.push(name); }
    else if (name) names.push(name);
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : '';
  const time = toMin(input.time) != null ? hhmm(toMin(input.time)!) : '';
  const draft: MeetingDraft = {
    title: clip(input.title, 120) || 'Meeting',
    refs, names, date, time,
    duration: Math.max(0, Math.min(600, Number(input.duration_minutes) || 0)),
    mode: input.mode === 'offline' ? 'offline' : 'online',
    venue: clip(input.venue, 200),
    city: clip(input.city, 60),
  };
  ctx.drafts.push(draft);
  return {
    draft_ready: true,
    note: 'Shown to the MD as a draft with an "Open in form" button. Nothing has been saved or sent.',
    matched_in_directory: resolved,
    kept_by_name_only: names,
    ...(date && date < ctx.today && { warning: 'That date is in the past.' }),
  };
}

const HANDLERS: Record<string, (ctx: ToolContext, input: Input) => Promise<unknown>> = {
  search_officers: runSearchOfficers,
  find_officer: runFindOfficer,
  batchmates: runBatchmates,
  people_met_before: runPeopleMetBefore,
  check_availability: runCheckAvailability,
  draft_meeting: runDraftMeeting,
};

/** Run one tool call; errors come back as a message for the model instead of breaking the turn. */
export async function runAssistantTool(ctx: ToolContext, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const handler = HANDLERS[name];
  if (!handler) return { content: `Unknown tool: ${name}`, isError: true };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { content: 'Tool input must be an object.', isError: true };
  try {
    const out = await handler(ctx, input as Input);
    const isError = !!out && typeof out === 'object' && 'error' in (out as object);
    return { content: JSON.stringify(out), isError };
  } catch (e: any) {
    return { content: `The directory could not be read: ${clip(e?.message || e, 200)}`, isError: true };
  }
}

export const newToolContext = (pb: PbReader, today = todayISO()): ToolContext => ({ pb, today, people: [], drafts: [] });
