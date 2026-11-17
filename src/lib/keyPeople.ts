'use client';

/* lib/keyPeople.ts — people the MD has starred as important ("key persons"): officers and employees.
   Kept as one row in PocketBase `system_settings` (setting_key "key_people", the list as JSON), so the MD and the PA
   see the same stars on every computer. One shared, live copy for the whole app — every star button, the dashboard
   card and the Key persons panel read the same list (loaded once, updated in real time). */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import pb from '@/lib/pocketbase';
import { serviceOf } from '@/lib/officerDirectory';

export type KeyPerson = {
  /** "IAS:<record id>" for officers, "Employee:<id>" for employees — same form as /officers?open= and /meetings?person= */
  ref: string;
  name: string;
  role?: string;
  starredAt: string;
};

/** "IAS" / "IPS" / "IFS" / "IRS" or "Employee" — what kind of person a ref is. */
export const refKind = (ref: string) => ref.split(':')[0];
export const isEmployeeRef = (ref: string) => refKind(ref) === 'Employee';

/** "IAS:<id>" / "Employee:<id>" refs of everyone in a meeting — the main person and the added participants.
    Employees are saved as type "Employee" (participants) or "Other" with an id (main person). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refsOf(m: any): string[] {
  const out: string[] = [];
  const add = (type: unknown, id: unknown) => {
    if (!id) return;
    const s = serviceOf(type);
    if (s) out.push(`${s}:${id}`);
    else if (/employee|other|^$/i.test(String(type ?? ''))) out.push(`Employee:${id}`);
  };
  add(m?.officer_type, m?.officer_id);
  let extra: unknown = m?.participants;
  if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch { extra = []; } }
  if (Array.isArray(extra)) for (const p of extra) add(p?.type, p?.id);
  return out;
}

const COLLECTION = 'system_settings';
const KEY = 'key_people';

function parse(v: unknown): KeyPerson[] {
  try {
    const list = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(list) ? list.filter((p) => p && typeof p.ref === 'string' && p.ref.includes(':')) : [];
  } catch {
    return [];
  }
}

/* ── the one shared copy ── */

type Snapshot = { people: KeyPerson[] | null; error: boolean };
let snapshot: Snapshot = { people: null, error: false };
let rowId: string | null = null;
let started = false;
const listeners = new Set<() => void>();
const set = (next: Partial<Snapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach((l) => l()); };

async function load(): Promise<KeyPerson[]> {
  const row = await pb.collection(COLLECTION).getFirstListItem(`setting_key = "${KEY}"`, { requestKey: null }).catch((e) => {
    if (e?.status === 404) return null;
    throw e;
  });
  rowId = row?.id ?? null;
  return parse(row?.setting_value);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  load().then((l) => set({ people: l, error: false })).catch((e) => {
    console.warn('[key-people] loading the starred list failed:', e);
    set({ people: [], error: true });
    started = false; // try again next time a star is shown
  });
  pb.collection(COLLECTION).subscribe('*', (ev) => {
    if (ev.record?.setting_key !== KEY) return;
    rowId = ev.action === 'delete' ? null : ev.record.id;
    set({ people: ev.action === 'delete' ? [] : parse(ev.record.setting_value) });
  }).catch(() => { /* realtime unavailable — the list loads again on the next visit */ });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

async function save(list: KeyPerson[]) {
  const data = {
    setting_key: KEY, category: 'general', setting_value: JSON.stringify(list),
    description: 'Officers and employees starred as key persons',
    updated_by: (pb.authStore.model as { name?: string; email?: string } | null)?.name || pb.authStore.model?.email || '',
    updated_at: new Date().toISOString(),
  };
  if (!rowId) await load();
  if (rowId) await pb.collection(COLLECTION).update(rowId, data, { requestKey: null });
  else rowId = (await pb.collection(COLLECTION).create(data, { requestKey: null })).id;
}

const SERVER: Snapshot = { people: null, error: false };

/** The starred people, live. `toggle` stars / un-stars one person. */
export function useKeyPeople() {
  useEffect(start, []);
  const { people, error } = useSyncExternalStore(subscribe, () => snapshot, () => SERVER);

  const isKey = useCallback((ref: string) => !!people?.some((p) => p.ref === ref), [people]);

  const toggle = useCallback(async (person: Omit<KeyPerson, 'starredAt'>) => {
    // re-read first so two people starring at the same time don't overwrite each other
    const current = await load().catch(() => snapshot.people ?? []);
    const next = current.some((p) => p.ref === person.ref)
      ? current.filter((p) => p.ref !== person.ref)
      : [...current, { ...person, starredAt: new Date().toISOString() }];
    set({ people: next });
    try {
      await save(next);
    } catch (e) {
      console.warn('[key-people] saving the starred list failed:', e);
      set({ people: current });
      throw e;
    }
    return next.some((p) => p.ref === person.ref);
  }, []);

  return { people, error, isKey, toggle };
}
