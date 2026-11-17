// lib/participants.ts — everyone in a meeting, not just the main officer.
//
// A meeting has one main participant (officer_name / officer_id / email) and any number of
// others. The others are kept in the `participants` JSON field (name + directory id + email,
// so people without an email are kept too). Older meetings only have their e-mails in
// `attendees` — those show up by e-mail address.

export type Participant = {
  id?: string;          // directory record id (officer / contact / employee), '' for a walk-in
  name: string;
  type?: string;        // IAS / IPS / Other / Employee
  email?: string;
  designation?: string;
};

/** Shown when PocketBase dropped the field because the collection doesn't have it yet. */
export const PARTICIPANTS_FIELD_MISSING =
  'The meeting is saved, but the extra participants couldn’t be stored. Please ask your administrator.';

/** For the developer (console): what to fix. */
export const PARTICIPANTS_FIELD_HINT =
  '[participants] not stored — add a JSON field named "participants" to the meetings collection in PocketBase';

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** The `participants` field as a list (JSON field, JSON text or nothing). */
export function parseParticipants(v: unknown): Participant[] {
  let arr: unknown = v;
  if (typeof v === 'string') {
    try { arr = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? '').trim(),
      type: String(p.type ?? ''),
      email: low(p.email),
      designation: String(p.designation ?? ''),
    }))
    .filter((p) => p.name || p.email);
}

/** The e-mails in `attendees` (comma-separated text, or an array/object from older records). */
export function attendeeEmails(v: unknown): string[] {
  let arr: unknown[] = [];
  if (typeof v === 'string') arr = v.split(',');
  else if (Array.isArray(v)) arr = v;
  else if (v && typeof v === 'object') {
    const inner = (v as any).attendees ?? Object.values(v);
    arr = Array.isArray(inner) ? inner : [];
  }
  return arr.map(low).filter((e) => e.includes('@'));
}

/** Same person: same directory id, same e-mail, or (when neither is known) same name. */
export function samePerson(a: Partial<Participant>, b: Partial<Participant>) {
  if (a.id && b.id) return a.id === b.id;
  if (a.email && b.email && low(a.email) === low(b.email)) return true;
  return !!low(a.name) && low(a.name) === low(b.name);
}

/** Everyone in the meeting — the main participant first, no duplicates.
    `names` (lib/emailNames) gives a name to people saved as an e-mail address only. */
export function meetingParticipants(m: any, names?: ReadonlyMap<string, string>): Participant[] {
  const out: Participant[] = [];
  const add = (p: Participant) => {
    if (!p.name && !p.email) return;
    if (out.some((x) => samePerson(x, p) || (!!p.email && low(x.email) === low(p.email)))) return;
    const onlyEmail = !p.name || low(p.name) === low(p.email);
    out.push({ ...p, name: (onlyEmail && names?.get(low(p.email))) || p.name || p.email || '' });
  };
  if (m?.officer_name) {
    add({
      id: m.officer_id || '', name: String(m.officer_name).trim(), type: m.officer_type || '',
      email: low(m.email), designation: m.designation || m.current_position || '',
    });
  }
  parseParticipants(m?.participants).forEach(add);
  attendeeEmails(m?.attendees).forEach((email) => add({ name: email, email }));
  return out;
}

/** The e-mails of people saved without a name — to look up with useEmailNames. */
export function unnamedEmails(m: any): string[] {
  return meetingParticipants(m).filter((p) => p.email && low(p.name) === low(p.email)).map((p) => p.email!);
}

/** "Ravi Kumar +2" */
export function participantsSummary(m: any, names?: ReadonlyMap<string, string>) {
  const all = meetingParticipants(m, names);
  return { first: all[0], more: Math.max(0, all.length - 1), all };
}
