/* lib/batchmates.ts — "Batchmates": other officers of the same batch year, and who the MD
   has already met (overall, or in a particular state / city).

   Pure functions — no network — so the Batchmates card, the batch-meet flow and the AI
   assistant all agree on the rules. The PocketBase queries live in lib/batchmatesData.ts.

   Data quirks handled here:
     • meetings.batch_year is text ("1992"), officers.batch_year is a number (1992)
     • cadre / state values can carry stray spaces and mixed case ("Tamil Nadu ")
     • a meeting's place is free text (city / location / address), not a state field —
       meetings.state is the OFFICER's state, so it is not used for "met in <state>" */

import { cityKey, cityLabel, findCity } from '@/lib/cities';
import { meetingParticipants, type Participant } from '@/lib/participants';
import { positionOf, type OfficerService } from '@/lib/officerDirectory';

export type Service = OfficerService;

export type BatchOfficer = {
  id: string;
  name: string;
  service: Service;
  batch: string;      // "1988"
  cadre: string;
  state: string;
  position: string;   // current posting / designation
  department: string;
};

export type MetInfo = {
  count: number;      // past meetings with this person
  last: string;       // YYYY-MM-DD of the latest past meeting ('' = never)
  next: string;       // YYYY-MM-DD of the next booked meeting ('' = none)
};

export type BatchmateRow = BatchOfficer & {
  met: MetInfo;
  samePlace: boolean; // posted in the state / city of the meeting being looked at
};

/* ── normalising ── */

/** "1988", 1988, " 1988 batch" → "1988"; anything else → "" */
export function normBatch(v: unknown): string {
  const m = /\b(19|20)\d{2}\b/.exec(String(v ?? ''));
  return m ? m[0] : '';
}

/** "  Tamil  Nadu " → "tamil nadu" */
export const normText = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const pad2 = (n: number) => String(n).padStart(2, '0');
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayOf = (m: any) => String(m?.meeting_date || '').slice(0, 10);
const isOff = (m: any) => !!m?.deleted || /cancel|reject/i.test(String(m?.status || ''));

/* ── states ── */

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

const STATE_ALIASES: Record<string, string> = {
  orissa: 'Odisha', pondicherry: 'Puducherry', 'new delhi': 'Delhi', nct: 'Delhi', 'delhi ncr': 'Delhi',
  'j&k': 'Jammu and Kashmir', 'j & k': 'Jammu and Kashmir', uttaranchal: 'Uttarakhand', up: 'Uttar Pradesh',
  mp: 'Madhya Pradesh', ap: 'Andhra Pradesh', tn: 'Tamil Nadu', wb: 'West Bengal',
};

/* city key (lib/cities) or common city name → state */
const CITY_STATE: Record<string, string> = {
  'new-delhi': 'Delhi', hyderabad: 'Telangana', mumbai: 'Maharashtra', bengaluru: 'Karnataka',
  chennai: 'Tamil Nadu', kolkata: 'West Bengal', pune: 'Maharashtra', gurugram: 'Haryana',
  noida: 'Uttar Pradesh', visakhapatnam: 'Andhra Pradesh', vijayawada: 'Andhra Pradesh', ahmedabad: 'Gujarat',
  amaravati: 'Andhra Pradesh', lucknow: 'Uttar Pradesh', jaipur: 'Rajasthan', bhopal: 'Madhya Pradesh',
  patna: 'Bihar', ranchi: 'Jharkhand', bhubaneswar: 'Odisha', raipur: 'Chhattisgarh', gandhinagar: 'Gujarat',
  thiruvananthapuram: 'Kerala', trivandrum: 'Kerala', kochi: 'Kerala', guwahati: 'Assam', dispur: 'Assam',
  shimla: 'Himachal Pradesh', dehradun: 'Uttarakhand', srinagar: 'Jammu and Kashmir', jammu: 'Jammu and Kashmir',
  panaji: 'Goa', shillong: 'Meghalaya', imphal: 'Manipur', aizawl: 'Mizoram', kohima: 'Nagaland',
  agartala: 'Tripura', gangtok: 'Sikkim', itanagar: 'Arunachal Pradesh', leh: 'Ladakh', chandigarh: 'Chandigarh',
  puducherry: 'Puducherry', mysuru: 'Karnataka', mysore: 'Karnataka', coimbatore: 'Tamil Nadu', madurai: 'Tamil Nadu',
  nagpur: 'Maharashtra', indore: 'Madhya Pradesh', surat: 'Gujarat', vadodara: 'Gujarat', varanasi: 'Uttar Pradesh',
  warangal: 'Telangana', tirupati: 'Andhra Pradesh', guntur: 'Andhra Pradesh', faridabad: 'Haryana',
};

/** The canonical state name for a state written any way ("tamil nadu ", "Orissa") — '' when unknown. */
export function canonicalState(v: unknown): string {
  const t = normText(v);
  if (!t) return '';
  const hit = INDIAN_STATES.find((s) => normText(s) === t);
  return hit || STATE_ALIASES[t] || '';
}

/** The state a piece of free text points at: a state name in it, or a known city. */
export function stateOfText(text: unknown): string {
  const t = ` ${normText(text).replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ')} `;
  if (!t.trim()) return '';
  // longest names first, so "West Bengal" wins over "Bengal"-like partials and "Delhi" over aliases
  for (const s of [...INDIAN_STATES].sort((a, b) => b.length - a.length)) {
    if (t.includes(` ${normText(s)} `)) return s;
  }
  for (const [alias, s] of Object.entries(STATE_ALIASES)) {
    if (alias.length > 3 && t.includes(` ${alias} `)) return s;
  }
  const key = cityKey(String(text ?? '').split(',')[0]) || findCity(text)?.key || '';
  if (key && CITY_STATE[key]) return CITY_STATE[key];
  for (const [city, s] of Object.entries(CITY_STATE)) {
    if (t.includes(` ${city.replace(/-/g, ' ')} `)) return s;
  }
  return '';
}

/** Where a meeting took place, as a state ('' = unknown). */
export function meetingPlaceState(m: any): string {
  return stateOfText(m?.city) || stateOfText(m?.location) || stateOfText(m?.address);
}

/** Where a meeting took place, as a city key from lib/cities ('' = unknown). */
export function meetingPlaceCity(m: any): string {
  return cityKey(m?.city) || findCity(m?.location)?.key || '';
}

/* ── who the MD has met ── */

const idKey = (id: unknown) => (id ? `id:${String(id)}` : '');
const nameKey = (name: unknown) => (normText(name) ? `name:${normText(name)}` : '');

/** person → past meeting count, last met, next booked — over the main participant and everyone in `participants`. */
export function metIndex(meetings: any[], today = todayISO()): Map<string, MetInfo> {
  const index = new Map<string, MetInfo>();
  const bump = (key: string, day: string) => {
    if (!key) return;
    const cur = index.get(key) || { count: 0, last: '', next: '' };
    if (day < today) {
      cur.count += 1;
      if (day > cur.last) cur.last = day;
    } else if (!cur.next || day < cur.next) {
      cur.next = day;
    }
    index.set(key, cur);
  };
  for (const m of meetings) {
    const day = dayOf(m);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isOff(m)) continue;
    for (const p of meetingParticipants(m)) {
      bump(idKey(p.id), day);
      bump(nameKey(p.name), day);
    }
  }
  return index;
}

const NEVER: MetInfo = { count: 0, last: '', next: '' };

/** Look a person up by directory id first, then by name. */
export function metFor(index: Map<string, MetInfo>, who: { id?: string; name?: string }): MetInfo {
  return index.get(idKey(who.id)) || index.get(nameKey(who.name)) || NEVER;
}

/* ── batchmates ── */

/** A directory record (ias_directory / ips_directory / ifs_directory / irs_directory) as a BatchOfficer. */
export function toBatchOfficer(rec: Record<string, any>, service: Service): BatchOfficer {
  return {
    id: String(rec.id || ''),
    name: String(rec.name || '').trim(),
    service,
    batch: normBatch(rec.batch_year ?? rec.batch),
    cadre: String(rec.cadre || '').trim(),
    state: String(rec.state || '').trim(),
    position: positionOf(rec),
    department: String(rec.department || '').trim(),
  };
}

/** The officer's state for matching: their state, else their cadre (cadres are mostly states). */
export const officerState = (o: Pick<BatchOfficer, 'state' | 'cadre'>) => canonicalState(o.state) || canonicalState(o.cadre);

/**
 * Batchmates of a meeting's officer, ready to show:
 *   people posted where the meeting is first, then people met before (most recent first),
 *   then everyone else A–Z. The meeting's own participants are left out.
 */
export function rankBatchmates(
  officers: BatchOfficer[],
  opts: { exclude?: Participant[]; placeState?: string; placeCity?: string; index: Map<string, MetInfo> },
): BatchmateRow[] {
  const exclude = opts.exclude || [];
  const excluded = (o: BatchOfficer) =>
    exclude.some((p) => (p.id && p.id === o.id) || (!!normText(p.name) && normText(p.name) === normText(o.name)));
  const placeState = canonicalState(opts.placeState) || stateOfText(opts.placeState);
  const placeCity = opts.placeCity ? normText(cityLabel(opts.placeCity, opts.placeCity)) : '';

  const seen = new Set<string>();
  const rows: BatchmateRow[] = [];
  for (const o of officers) {
    if (!o.id || seen.has(`${o.service}:${o.id}`) || excluded(o)) continue;
    seen.add(`${o.service}:${o.id}`);
    const inCity = !!placeCity && normText(o.position).includes(placeCity);
    const samePlace = inCity || (!!placeState && officerState(o) === placeState);
    rows.push({ ...o, met: metFor(opts.index, o), samePlace });
  }
  return rows.sort((a, b) =>
    Number(b.samePlace) - Number(a.samePlace)
    || Number(b.met.count > 0) - Number(a.met.count > 0)
    || b.met.last.localeCompare(a.met.last)
    || a.name.localeCompare(b.name));
}

export type BatchFilter = { service: 'all' | Service; state: string; metOnly: boolean; q: string };

export function filterBatchmates(rows: BatchmateRow[], f: BatchFilter): BatchmateRow[] {
  const q = normText(f.q);
  const state = canonicalState(f.state);
  return rows.filter((r) =>
    (f.service === 'all' || r.service === f.service)
    && (!state || officerState(r) === state)
    && (!f.metOnly || r.met.count > 0)
    && (!q || [r.name, r.position, r.cadre, r.state, r.department].some((v) => normText(v).includes(q))));
}

/** States present in a list of batchmates, for the filter dropdown. */
export function statesOf(rows: BatchOfficer[]): string[] {
  return Array.from(new Set(rows.map(officerState).filter(Boolean))).sort();
}

/* ── people met in a state / city (AI assistant + visit planning) ── */

export type PersonMet = {
  id: string;
  name: string;
  type: string;         // IAS / IPS / Other / Employee
  designation: string;
  timesMet: number;
  lastMet: string;      // YYYY-MM-DD
  lastAgenda: string;
  places: string[];     // cities / locations they were met in
};

/** Everyone met (past, not cancelled) in a state and/or city, latest first. */
export function peopleMetIn(
  meetings: any[],
  where: { state?: string; city?: string; since?: string; today?: string },
): PersonMet[] {
  const today = where.today || todayISO();
  const state = canonicalState(where.state) || stateOfText(where.state);
  const city = cityKey(where.city) || normText(where.city);
  const byPerson = new Map<string, PersonMet>();

  for (const m of meetings) {
    const day = dayOf(m);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today || isOff(m)) continue;
    if (where.since && day < where.since) continue;
    if (state && meetingPlaceState(m) !== state) continue;
    if (city) {
      const mc = meetingPlaceCity(m);
      const text = normText(`${m.city || ''} ${m.location || ''}`);
      if (mc !== city && !text.includes(normText(where.city))) continue;
    }
    const place = String(m.city || m.location || '').split(',')[0].trim();
    for (const p of meetingParticipants(m)) {
      const key = idKey(p.id) || nameKey(p.name);
      if (!key) continue;
      const cur = byPerson.get(key) || {
        id: p.id || '', name: p.name, type: p.type || '', designation: p.designation || '',
        timesMet: 0, lastMet: '', lastAgenda: '', places: [],
      };
      cur.timesMet += 1;
      if (day > cur.lastMet) { cur.lastMet = day; cur.lastAgenda = String(m.agenda || ''); }
      if (place && !cur.places.includes(place)) cur.places.push(place);
      byPerson.set(key, cur);
    }
  }
  return Array.from(byPerson.values()).sort((a, b) => b.lastMet.localeCompare(a.lastMet) || a.name.localeCompare(b.name));
}
