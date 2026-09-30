#!/usr/bin/env node
// scripts/lock-pocketbase.mjs — applies the access rules + timestamp fields from
// pb_migrations/1790700000_timestamps_and_roles.js through the PocketBase API,
// for when you can use the dashboard but can't copy files onto the server.
//
//   node scripts/lock-pocketbase.mjs
//
// Asks for a SUPERUSER email + password (the dashboard login), shows every change,
// and only applies them after you type "yes". Safe to run again — already-locked
// rules and existing fields are left alone.

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const STAMPED = ['meetings', 'other_contacts', 'ias_officers', 'ips_officers', 'employees', 'deleted_records'];
const LOCKED = [
  'meetings', 'other_contacts', 'ias_officers', 'ips_officers', 'employees', 'users',
  'deleted_records', 'activity_logs', 'update_logs', 'meeting_actions',
];
const SIGNED_IN = '@request.auth.id != ""';
const NOT_VIEWER = '@request.auth.permissions !~ "viewer"';
const RULES = {
  listRule: [SIGNED_IN], viewRule: [SIGNED_IN],
  createRule: [SIGNED_IN, NOT_VIEWER], updateRule: [SIGNED_IN, NOT_VIEWER], deleteRule: [SIGNED_IN, NOT_VIEWER],
};

function tighten(rule, extra) {
  if (rule === null || rule === undefined) return rule; // superuser-only — already strictest
  const s = String(rule).trim();
  const missing = extra.filter((c) => !s.includes(c));
  if (!missing.length) return rule;
  return s === '' ? missing.join(' && ') : `(${s}) && ${missing.join(' && ')}`;
}

function pbUrl() {
  if (process.env.POCKETBASE_URL) return process.env.POCKETBASE_URL.replace(/\/+$/, '');
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/^\s*(?:POCKETBASE_URL|NEXT_PUBLIC_POCKETBASE_URL)\s*=\s*(\S+)/m);
    if (m) return m[1].replace(/["']/g, '').replace(/\/+$/, '');
  } catch { /* no .env.local */ }
  return 'http://172.30.0.200:8091';
}

async function api(base, path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: token }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.message || ''} ${JSON.stringify(data.data || {})}`);
  return data;
}

const rl = readline.createInterface({ input, output });
try {
  const base = pbUrl();
  console.log(`\nPocketBase: ${base}`);
  const email = process.env.PB_ADMIN_EMAIL || (await rl.question('Superuser email: '));
  const password = process.env.PB_ADMIN_PASSWORD || (await rl.question('Superuser password: '));

  const { token } = await api(base, '/api/collections/_superusers/auth-with-password', {
    method: 'POST', body: { identity: email.trim(), password },
  });
  console.log('Signed in as superuser.\n');

  const plan = [];
  for (const name of new Set([...LOCKED, ...STAMPED])) {
    let col;
    try { col = await api(base, `/api/collections/${name}`, { token }); }
    catch { console.log(`- ${name}: not found, skipped`); continue; }

    const patch = {};
    const notes = [];
    if (LOCKED.includes(name)) {
      for (const [key, extra] of Object.entries(RULES)) {
        const next = tighten(col[key], extra);
        if (next !== col[key]) {
          patch[key] = next;
          notes.push(`  ${key.padEnd(10)} ${JSON.stringify(col[key])}  →  ${JSON.stringify(next)}`);
        }
      }
    }
    if (STAMPED.includes(name) && col.type !== 'view') {
      const fields = [...(col.fields || [])];
      const has = (n) => fields.some((f) => f.name === n);
      if (!has('created')) { fields.push({ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }); notes.push('  + field  created (autodate)'); }
      if (!has('updated')) { fields.push({ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }); notes.push('  + field  updated (autodate)'); }
      if (fields.length !== (col.fields || []).length) patch.fields = fields;
    }

    if (Object.keys(patch).length) {
      plan.push({ name, id: col.id, patch });
      console.log(`● ${name}\n${notes.join('\n')}`);
    } else {
      console.log(`✓ ${name}: already locked`);
    }
  }

  if (!plan.length) {
    console.log('\nNothing to change.');
  } else if ((await rl.question(`\nApply these changes to ${plan.length} collection(s)? Type "yes": `)).trim().toLowerCase() !== 'yes') {
    console.log('Cancelled — nothing was changed.');
  } else {
    for (const { name, id, patch } of plan) {
      await api(base, `/api/collections/${id}`, { token, method: 'PATCH', body: patch });
      console.log(`✔ ${name} updated`);
    }
    console.log('\nDone. Logged-out visitors can no longer read or change your data.');
  }
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
