/* lib/officerMerge.ts — merging duplicate officers in the IAS / IPS / IFS / IRS directories (pure, tested).

   After a directory is loaded again from a newer civil list, the same officer can be there twice: the old record
   (which the meetings point to) and the new one (with today's details). This finds those pairs by name
   ("A.A. Sindhu" = "Aa Sindhu" = "Dr A A Sindhu"), and for each group:
     • keeps one record (the newest civil-list one) and fills its blanks from the others
     • moves every meeting that points to a duplicate — main participant and other participants — to the kept record
     • links meetings that point to nobody any more (their record is gone) to the officer of that name
   The removed duplicates are archived in `deleted_records` with what they were merged into (the history).

   Same name ≠ same person: records whose officer ID, batch or date of birth differ are treated as different
   people and are only merged when the user ticks them explicitly. */

import { serviceOf, type OfficerService } from '@/lib/officerDirectory';

export type DirectoryRecord = Record<string, any> & { id: string; name: string };

const TITLES = /\b(dr|shri|sri|smt|kum|kumari|mr|mrs|ms|miss|prof|capt|col|ias|ips|ifs|irs|retd)\b\.?/g;

/** "Dr. A.A. Sindhu, IAS" → "aasindhu": case, dots, spaces and titles don't matter. */
export function nameKey(name: unknown): string {
  return String(name ?? '').toLowerCase()
    .replace(/[.,'’`()\-_/]/g, ' ')
    .replace(TITLES, ' ')
    .replace(/[^a-z0-9ऀ-෿]+/g, '');
}

const SYSTEM = new Set(['id', 'collectionId', 'collectionName', 'created', 'updated', 'expand']);
const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);
const day = (v: unknown) => String(v ?? '').slice(0, 10);
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Why two records with the same name are probably different people ('' = nothing tells them apart). */
export function conflictBetween(a: DirectoryRecord, b: DirectoryRecord): string {
  if (!blank(a.officer_id) && !blank(b.officer_id) && norm(a.officer_id) !== norm(b.officer_id)) return 'different officer IDs';
  if (!blank(a.batch) && !blank(b.batch) && Number(a.batch) !== Number(b.batch)) return 'different batches';
  if (day(a.date_of_birth) && day(b.date_of_birth) && day(a.date_of_birth) !== day(b.date_of_birth)) return 'different dates of birth';
  return '';
}

const filled = (r: DirectoryRecord) => Object.entries(r).filter(([k, v]) => !SYSTEM.has(k) && !blank(v)).length;

/** The record to keep: one from the civil list (has an officer ID), then the most recently updated, then the fullest. */
export function pickKeeper(records: DirectoryRecord[]): DirectoryRecord {
  return [...records].sort((a, b) =>
    Number(blank(a.officer_id)) - Number(blank(b.officer_id)) ||
    String(b.updated || '').localeCompare(String(a.updated || '')) ||
    filled(b) - filled(a))[0];
}

export interface DuplicateGroup {
  service: OfficerService;
  key: string;
  records: DirectoryRecord[];
  keepId: string;
  /** why these may be different people ('' = looks like one person) */
  conflict: string;
}

/** Records of one service that share a name. */
export function findDuplicates(service: OfficerService, records: DirectoryRecord[]): DuplicateGroup[] {
  const byName = new Map<string, DirectoryRecord[]>();
  for (const r of records) {
    const k = nameKey(r.name);
    if (!k) continue;
    const list = byName.get(k);
    if (list) list.push(r); else byName.set(k, [r]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byName) {
    if (list.length < 2) continue;
    let conflict = '';
    for (let i = 0; i < list.length && !conflict; i++) {
      for (let j = i + 1; j < list.length && !conflict; j++) conflict = conflictBetween(list[i], list[j]);
    }
    groups.push({ service, key, records: list, keepId: pickKeeper(list).id, conflict });
  }
  return groups.sort((a, b) => Number(!!a.conflict) - Number(!!b.conflict) || a.key.localeCompare(b.key));
}

/** What the kept record gains: every field it has empty, taken from the others (newest first). */
export function fillBlanks(keep: DirectoryRecord, others: DirectoryRecord[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const newestFirst = [...others].sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  for (const o of newestFirst) {
    for (const [k, v] of Object.entries(o)) {
      if (SYSTEM.has(k) || blank(v) || !blank(keep[k]) || k in patch) continue;
      patch[k] = v;
    }
  }
  return patch;
}

/* ── an officer's meetings ────────────────────────────────────────────────────────────────────── */

export interface OfficerRef { id: string; name: string; service: OfficerService }

/** Everyone in a meeting as saved: the main participant, then the others (raw — id, name, type). */
function peopleIn(m: Record<string, any>): { id: string; name: string; type: string; main: boolean }[] {
  const out: { id: string; name: string; type: string; main: boolean }[] = [];
  if (m.officer_name || m.officer_id) out.push({ id: String(m.officer_id || ''), name: String(m.officer_name || ''), type: String(m.officer_type || ''), main: true });
  let list: unknown = m.participants;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = null; } }
  if (Array.isArray(list)) {
    for (const p of list) {
      if (p && typeof p === 'object') out.push({ id: String((p as any).id || ''), name: String((p as any).name || ''), type: String((p as any).type || ''), main: false });
    }
  }
  return out;
}

/**
 * Is this officer in the meeting — and how? Linked = the meeting points to their record. By name = the meeting
 * names them but points to no existing record (saved before the directory was reloaded, or typed in by hand).
 * Someone of the same name who is linked to ANOTHER existing record is a different person and doesn't count.
 * `existsOther(id)` tells whether an id is another existing record of this service.
 */
export function officerInMeeting(
  m: Record<string, any>, officer: OfficerRef, existsOther: (id: string) => boolean,
): { role: 'main' | 'participant'; how: 'linked' | 'by name' } | null {
  const key = nameKey(officer.name);
  let found: { role: 'main' | 'participant'; how: 'linked' | 'by name' } | null = null;
  for (const p of peopleIn(m)) {
    const role = p.main ? 'main' : 'participant';
    if (p.id && p.id === officer.id) return { role, how: 'linked' };
    if (found || !key || nameKey(p.name) !== key) continue;
    const service = serviceOf(p.type);
    if (service && service !== officer.service) continue; // same name in another service
    if (p.id && existsOther(p.id)) continue;               // linked to a different officer of that name
    found = { role, how: 'by name' };
  }
  return found;
}

/** The ids a meeting gives people named like this officer (to check which of them are other officers). */
export function idsNamedLike(m: Record<string, any>, name: string): string[] {
  const key = nameKey(name);
  return key ? peopleIn(m).filter((p) => p.id && nameKey(p.name) === key).map((p) => p.id) : [];
}

/** The longest word of a name — a cheap database filter to find candidate meetings ("Sindhu"). */
export function searchWord(name: string): string {
  return String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(dr|shri|smt|sri|mr|mrs|ms|ias|ips|ifs|irs)$/i.test(w))
    .sort((a, b) => b.length - a.length)[0] || '';
}

/* ── meetings ─────────────────────────────────────────────────────────────────────────────────── */

export type MeetingLink = Record<string, any> & { id: string };

export interface RelinkContext {
  /** a duplicate's id → the kept record's id */
  moved: Map<string, string>;
  /** per service: every record id that exists after the merge */
  exists: Record<OfficerService, Set<string>>;
  /** per service: name key → the ids of records with that name (after the merge) */
  byName: Record<OfficerService, Map<string, string[]>>;
}

export function relinkContext(remaining: Record<OfficerService, DirectoryRecord[]>, moved: Map<string, string>): RelinkContext {
  const exists = {} as RelinkContext['exists'];
  const byName = {} as RelinkContext['byName'];
  for (const s of Object.keys(remaining) as OfficerService[]) {
    exists[s] = new Set(remaining[s].map((r) => r.id));
    const m = new Map<string, string[]>();
    for (const r of remaining[s]) {
      const k = nameKey(r.name);
      if (!k) continue;
      m.set(k, [...(m.get(k) || []), r.id]);
    }
    byName[s] = m;
  }
  return { moved, exists, byName };
}

type Why = 'merged' | 'by name';

/** The officer one person-link in a meeting should point to, and why — null when it is fine as it is. */
function target(id: unknown, name: unknown, type: unknown, ctx: RelinkContext): { id: string; why: Why } | null {
  const current = String(id ?? '');
  if (current && ctx.moved.has(current)) return { id: ctx.moved.get(current)!, why: 'merged' };
  const service = serviceOf(type);
  if (!service || !ctx.exists[service]) return null;
  if (current && ctx.exists[service].has(current)) return null; // points to a record that exists
  // points to nobody (no id, or its record is gone): link by name when exactly one officer has it
  const hits = ctx.byName[service].get(nameKey(name)) || [];
  return hits.length === 1 && hits[0] !== current ? { id: hits[0], why: 'by name' } : null;
}

export interface MeetingFix {
  id: string;
  patch: { officer_id?: string; participants?: unknown };
  /** one line per changed person: "A A Sindhu → kept record (merged)" */
  changes: { name: string; from: string; to: string; why: Why }[];
}

/** The change a meeting needs (null = none): main participant and the other participants. */
export function relinkMeeting(m: MeetingLink, ctx: RelinkContext): MeetingFix | null {
  const changes: MeetingFix['changes'] = [];
  const patch: MeetingFix['patch'] = {};

  if (m.officer_name || m.officer_id) {
    const t = target(m.officer_id, m.officer_name, m.officer_type, ctx);
    if (t) {
      patch.officer_id = t.id;
      changes.push({ name: String(m.officer_name || ''), from: String(m.officer_id || ''), to: t.id, why: t.why });
    }
  }

  // the other participants: JSON array (or JSON text) — only their ids change, everything else is kept as saved
  let list: unknown = m.participants;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = null; } }
  if (Array.isArray(list)) {
    let touched = false;
    const next = list.map((p) => {
      if (!p || typeof p !== 'object') return p;
      const t = target((p as any).id, (p as any).name, (p as any).type, ctx);
      if (!t) return p;
      touched = true;
      changes.push({ name: String((p as any).name || ''), from: String((p as any).id || ''), to: t.id, why: t.why });
      return { ...(p as object), id: t.id };
    });
    if (touched) patch.participants = next;
  }

  return changes.length ? { id: m.id, patch, changes } : null;
}
