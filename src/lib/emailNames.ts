'use client';

// lib/emailNames.ts — names for participants that were saved as an e-mail address only.
//
// Older meetings (and participants added by e-mail) have just the address in `attendees`.
// This looks the address up in the directory — IAS / IPS / IFS / IRS officers, other contacts, employees
// (HRMS + app) — once per page visit, and every component showing participants re-renders
// with the name. Lookups from many components are batched into one round of requests.

import { useEffect, useSyncExternalStore } from 'react';
import pb from '@/lib/pocketbase';
import { loadDirectoryEmployees } from '@/components/employees/employee-api';
import { OFFICER_COLLECTIONS } from '@/lib/officerDirectory';

const names = new Map<string, string>(); // e-mail → name ('' = not in the directory)
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let employees: Promise<Map<string, string>> | null = null;

const COLLECTIONS = [...OFFICER_COLLECTIONS, 'other_contacts'];
const CHUNK = 25;
const pbq = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const employeesByEmail = () =>
  (employees ??= loadDirectoryEmployees()
    .then(({ employees: rows }) => new Map(rows
      .filter((e) => e.email && e.name)
      .map((e) => [String(e.email).toLowerCase(), e.name] as [string, string])))
    .catch(() => { employees = null; return new Map<string, string>(); }));

async function flush() {
  timer = null;
  const batch = [...pending];
  pending.clear();
  if (!batch.length) return;

  const found = new Map<string, string>();
  const lookups: Promise<void>[] = [];
  for (let i = 0; i < batch.length; i += CHUNK) {
    const filter = batch.slice(i, i + CHUNK).map((e) => `email = "${pbq(e)}"`).join(' || ');
    for (const col of COLLECTIONS) {
      lookups.push(pb.collection(col).getFullList({ filter, fields: 'email,name', requestKey: null })
        .then((rows) => rows.forEach((r: any) => {
          const email = String(r.email || '').toLowerCase();
          if (email && r.name && !found.has(email)) found.set(email, String(r.name));
        }))
        .catch(() => {}));
    }
  }
  lookups.push(employeesByEmail().then((emp) => batch.forEach((e) => {
    if (!found.has(e) && emp.has(e)) found.set(e, emp.get(e)!);
  })));
  await Promise.all(lookups);

  batch.forEach((e) => names.set(e, found.get(e) || ''));
  version++;
  listeners.forEach((l) => l());
}

function request(emails: string[]) {
  let added = false;
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (e.includes('@') && !names.has(e) && !pending.has(e)) { pending.add(e); added = true; }
  }
  if (added && !timer) timer = setTimeout(flush, 30);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

/** e-mail → name for these addresses (fills in as the directory answers). */
export function useEmailNames(emails: string[]): ReadonlyMap<string, string> {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const key = emails.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { request(emails); }, [key]);
  return names;
}
