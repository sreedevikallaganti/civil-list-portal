/**
 * lib/liveDirectory.ts — the CURRENT directory record for everyone you have meetings with.
 *
 * A meeting stores a copy of the officer's details from the day it was created.
 * This fetches today's record (only for the people in your meetings, by id) so
 * screens can show up-to-date contact details and spot changes:
 *   • hydrate()        meetings with today's email / phone / designation
 *   • postingChanges() "was X at your last meeting, now Y"
 *   • occasions()      birthdays and service anniversaries in the next N days
 */
import { useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbase';

export type LivePerson = {
  id: string;
  name: string;
  type: 'IAS' | 'IPS' | 'Other';
  designation: string;
  email: string;
  phone: string;
  dob: string;          // YYYY-MM-DD or ''
  serviceStart: string; // appointment_date, YYYY-MM-DD or ''
};

type AnyMeeting = Record<string, any>;

const SOURCES: Record<LivePerson['type'], string[]> = {
  IAS: ['ias_officers'],
  IPS: ['ips_officers'],
  Other: ['other_contacts', 'employees'],
};

const day10 = (v: unknown) => {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};
const typeOf = (m: AnyMeeting): LivePerson['type'] => {
  const t = String(m.officer_type || '').toUpperCase();
  return t.includes('IAS') ? 'IAS' : t.includes('IPS') ? 'IPS' : 'Other';
};

async function fetchByIds(collection: string, ids: string[], type: LivePerson['type']): Promise<LivePerson[]> {
  const out: LivePerson[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const filter = ids.slice(i, i + 30).map((id) => `id = "${id.replace(/"/g, '')}"`).join(' || ');
    try {
      const res = await pb.collection(collection).getList(1, 30, { filter, requestKey: null });
      for (const o of res.items as AnyMeeting[]) {
        out.push({
          id: o.id,
          name: o.name || '',
          type,
          designation: o.current_position || o.designation || o.rank || '',
          email: o.email || '',
          phone: o.contact_number || o.mobile_no || o.phone || '',
          dob: day10(o.date_of_birth),
          serviceStart: day10(o.appointment_date),
        });
      }
    } catch {
      /* collection missing or not readable — skip it */
    }
  }
  return out;
}

/** Today's directory records for everyone referenced by these meetings (keyed by officer_id). */
export async function loadLivePeople(meetings: AnyMeeting[]): Promise<Map<string, LivePerson>> {
  const wanted: Record<LivePerson['type'], Set<string>> = { IAS: new Set(), IPS: new Set(), Other: new Set() };
  for (const m of meetings) if (m.officer_id) wanted[typeOf(m)].add(String(m.officer_id));

  const lists = await Promise.all(
    (Object.keys(SOURCES) as LivePerson['type'][]).flatMap((type) =>
      wanted[type].size ? SOURCES[type].map((col) => fetchByIds(col, [...wanted[type]], type)) : []),
  );
  const map = new Map<string, LivePerson>();
  lists.flat().forEach((p) => map.set(p.id, p));
  return map;
}

/** Meetings with today's email / phone / designation (the saved copy is kept in `saved_designation`). */
export function hydrate<T extends AnyMeeting>(meetings: T[], people: Map<string, LivePerson>): T[] {
  if (!people.size) return meetings;
  return meetings.map((m) => {
    const p = m.officer_id ? people.get(String(m.officer_id)) : undefined;
    if (!p) return m;
    return {
      ...m,
      saved_designation: m.designation,
      designation: p.designation || m.designation,
      email: p.email || m.email,
      contact_number: p.phone || m.contact_number,
    };
  });
}

/* designations often carry dates / deputation notes — ignore those when comparing */
const normPost = (s: string) =>
  s.toLowerCase()
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .replace(/\bon cd since\b|\(on central deputation\)|\bsince\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export type PostingChange = {
  person: LivePerson;
  was: string;
  now: string;
  lastMeeting: AnyMeeting;       // most recent meeting whose saved designation differs
  nextMeeting: AnyMeeting | null; // upcoming meeting with them, if any
};

/** People whose current post differs from what was saved on your latest meeting with them. */
export function postingChanges(meetings: AnyMeeting[], people: Map<string, LivePerson>, today = new Date()): PostingChange[] {
  const todayIso = localIso(today);
  const byPerson = new Map<string, AnyMeeting[]>();
  for (const m of meetings) {
    if (!m.officer_id || !people.has(String(m.officer_id))) continue;
    const list = byPerson.get(String(m.officer_id)) ?? [];
    list.push(m);
    byPerson.set(String(m.officer_id), list);
  }
  const out: PostingChange[] = [];
  for (const [id, list] of byPerson) {
    const person = people.get(id)!;
    const now = person.designation.trim();
    const withPost = list.filter((m) => String(m.designation || '').trim())
      .sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date)));
    const latest = withPost[0];
    if (!latest || !now) continue;
    const was = String(latest.designation).trim();
    if (!normPost(was) || normPost(was) === normPost(now)) continue;
    const next = list
      .filter((m) => String(m.meeting_date || '').slice(0, 10) >= todayIso && !/cancel|reject/i.test(m.status || ''))
      .sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)))[0] || null;
    out.push({ person, was, now, lastMeeting: latest, nextMeeting: next });
  }
  return out.sort((a, b) => Number(!!b.nextMeeting) - Number(!!a.nextMeeting));
}

export type Occasion = {
  person: LivePerson;
  kind: 'birthday' | 'service';
  date: string;   // this year's date, YYYY-MM-DD
  inDays: number; // 0 = today
  years: number;  // age turning / years of service
};

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Birthdays and service anniversaries in the next `days` days (today included). */
export function occasions(people: Map<string, LivePerson>, days = 7, today = new Date()): Occasion[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: Occasion[] = [];
  const check = (p: LivePerson, iso: string, kind: Occasion['kind']) => {
    if (!iso) return;
    const [y, mo, d] = iso.split('-').map(Number);
    for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
      const when = new Date(year, mo - 1, d);
      if (when.getMonth() !== mo - 1) continue; // 29 Feb in a non-leap year
      const inDays = Math.round((+when - +start) / 86_400_000);
      if (inDays >= 0 && inDays <= days && year - y > 0) {
        out.push({ person: p, kind, date: localIso(when), inDays, years: year - y });
        return;
      }
    }
  };
  for (const p of people.values()) {
    check(p, p.dob, 'birthday');
    check(p, p.serviceStart, 'service');
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.person.name.localeCompare(b.person.name));
}

/** React hook: live records for the people in `meetings` (re-fetched when the set of people changes). */
export function useLivePeople(meetings: AnyMeeting[]) {
  const key = useMemo(
    () => [...new Set(meetings.map((m) => `${typeOf(m)}:${m.officer_id || ''}`).filter((k) => !k.endsWith(':')))].sort().join(','),
    [meetings],
  );
  const [people, setPeople] = useState<Map<string, LivePerson>>(new Map());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!key) { setPeople(new Map()); return; }
    let live = true;
    setLoading(true);
    loadLivePeople(meetings)
      .then((p) => live && setPeople(p))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { people, loading };
}
