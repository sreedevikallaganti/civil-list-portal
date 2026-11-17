#!/usr/bin/env node
// scripts/multi-tenant-pocketbase.mjs — turns the PocketBase database into a multi-organisation one.
//
//   node scripts/multi-tenant-pocketbase.mjs            (asks before changing anything)
//   node scripts/multi-tenant-pocketbase.mjs --dry-run  (only shows what it would do)
//
// What it does, in this order (safe to run again — finished steps are skipped):
//   1. creates the `organizations` collection (name, status, home_city, google_enabled)
//   2. adds an `org` relation field to users and every data collection
//   3. creates your first organisation (or uses the existing one) and puts every record
//      that has no org yet into it — so the existing data and logins keep working
//   4. replaces the API rules: signed-in people only ever see / change records of their
//      own organisation; viewers are read-only; only org admins manage that org's users
//   5. makes `org` required, so no record can be created without one
//
// Afterwards PocketBase superusers (the platform owner) create more organisations on the
// app's /organizations page. Signs in with a SUPERUSER email + password (the dashboard login),
// or PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD from the environment.

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DRY = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');
const argValue = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** collections whose records belong to an organisation (same list as src/lib/tenancy.ts) */
const TENANT = [
  'users', 'meetings', 'other_contacts', 'employees', // (the officers directory is shared — no org)
  'activity_logs', 'update_logs', 'deleted_records', 'meeting_actions', 'special_events',
  'associates', 'associate_fields', 'associate_imports',
];

/* ── access rules ─────────────────────────────────────────────────── */
const all = (...parts) => parts.filter(Boolean).join(' && ');
const MEMBER = all('@request.auth.id != ""', '@request.auth.org != ""', '@request.auth.org.status != "suspended"');
const SAME_ORG = 'org = @request.auth.org';
// (an empty JSON `permissions` makes `!~` false in PocketBase, hence the explicit null / "" checks)
const WRITER = all('@request.auth.role !~ "viewer"',
  '(@request.auth.permissions = null || @request.auth.permissions = "" || @request.auth.permissions !~ "viewer")');
const ADMIN = '(@request.auth.role ~ "admin" || @request.auth.permissions ~ "admin")';
const NEW_IN_MY_ORG = '@request.body.org = @request.auth.org';
const ORG_UNCHANGED = '(@request.body.org:isset = false || @request.body.org = @request.auth.org)';
// people may edit their own profile, but not their role / permissions / status
const OWN_PROFILE = all('id = @request.auth.id', '@request.body.role:isset = false',
  '@request.body.permissions:isset = false', '@request.body.status:isset = false');

const DATA_RULES = {
  listRule: all(MEMBER, SAME_ORG),
  viewRule: all(MEMBER, SAME_ORG),
  createRule: all(MEMBER, WRITER, NEW_IN_MY_ORG),
  updateRule: all(MEMBER, SAME_ORG, WRITER, ORG_UNCHANGED),
  deleteRule: all(MEMBER, SAME_ORG, WRITER),
};
const RULES = {
  users: {
    listRule: all(MEMBER, SAME_ORG),
    viewRule: all(MEMBER, SAME_ORG),
    createRule: all(MEMBER, ADMIN, NEW_IN_MY_ORG),
    updateRule: all(MEMBER, SAME_ORG, ORG_UNCHANGED, `(${ADMIN} || (${OWN_PROFILE}))`),
    deleteRule: all(MEMBER, SAME_ORG, ADMIN, 'id != @request.auth.id'),
  },
  // everyone (viewers too) writes their own log entries; nobody edits them
  activity_logs: {
    listRule: all(MEMBER, SAME_ORG),
    viewRule: all(MEMBER, SAME_ORG),
    createRule: all(MEMBER, NEW_IN_MY_ORG),
    updateRule: null,
    deleteRule: all(MEMBER, SAME_ORG, ADMIN),
  },
};
const ORG_RULES = {
  listRule: 'id = @request.auth.org',
  viewRule: 'id = @request.auth.org',
  createRule: null, // superusers only
  // an org's admins may rename it / change its home city — not (un)suspend it
  updateRule: all('id = @request.auth.org', ADMIN, '@request.body.status:isset = false', '@request.body.google_enabled:isset = false'),
  deleteRule: null,
};
const RULE_KEYS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];

/* ── helpers ──────────────────────────────────────────────────────── */
function pbUrl() {
  if (process.env.POCKETBASE_URL) return process.env.POCKETBASE_URL.replace(/\/+$/, '');
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/^\s*(?:POCKETBASE_URL|NEXT_PUBLIC_POCKETBASE_URL)\s*=\s*(\S+)/m);
    if (m) return m[1].replace(/["']/g, '').replace(/\/+$/, '');
  } catch { /* no .env.local */ }
  throw new Error('PocketBase address not found — set POCKETBASE_URL in .env.local (or in the environment).');
}

let BASE = '';
let TOKEN = '';
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(TOKEN && { Authorization: TOKEN }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path.split('?')[0]} → ${res.status} ${data.message || ''} ${JSON.stringify(data.data || {})}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const getCollection = (name) => api(`/api/collections/${name}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
const count = async (name, filter) =>
  (await api(`/api/collections/${name}/records?perPage=1&fields=id&filter=${encodeURIComponent(filter)}`)).totalItems;

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

const show = (v) => (v === null ? 'superusers only' : v === '' ? 'PUBLIC (anyone)' : v);

/* ── main ─────────────────────────────────────────────────────────── */
const rl = readline.createInterface({ input, output });
try {
  BASE = pbUrl();
  console.log(`\nPocketBase: ${BASE}${DRY ? '   (dry run — nothing will be changed)' : ''}`);
  const email = process.env.PB_ADMIN_EMAIL || (await rl.question('Superuser email: '));
  const password = process.env.PB_ADMIN_PASSWORD || (await rl.question('Superuser password: '));
  ({ token: TOKEN } = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST', body: { identity: email.trim(), password },
  }));
  console.log('Signed in as superuser.\n');

  /* what is there now */
  let orgCol = await getCollection('organizations');
  const cols = {};
  for (const name of TENANT) {
    const c = await getCollection(name);
    if (!c) { console.log(`- ${name}: not found, skipped`); continue; }
    if (c.type === 'view') { console.log(`- ${name}: view collection, skipped`); continue; }
    cols[name] = c;
  }
  const hasOrgField = (c) => (c.fields || []).some((f) => f.name === 'org');

  const orgs = orgCol ? (await api('/api/collections/organizations/records?perPage=200&sort=created')).items : [];
  let target = orgs[0] || null;
  let newOrgName = '';
  if (!target) {
    const fallback = argValue('org-name') || 'Main office';
    newOrgName = (YES || DRY ? fallback : (await rl.question(`Name of your organisation [${fallback}]: `)).trim()) || fallback;
  }
  const homeCity = (process.env.NEXT_PUBLIC_HOME_CITY || 'hyderabad').trim().toLowerCase();

  /* plan */
  console.log('\n──────── Plan ────────');
  console.log(orgCol ? '✓ organizations collection exists' : '● create the organizations collection');
  for (const [name, c] of Object.entries(cols)) {
    if (!hasOrgField(c)) console.log(`● ${name}: add field  org → organizations`);
  }
  console.log(target ? `✓ organisation: ${target.name} (records without an org go here)` : `● create organisation “${newOrgName}” (Google sync on, home city ${homeCity}) and put all existing records in it`);
  for (const [name, c] of Object.entries(cols)) {
    const n = hasOrgField(c) ? await count(name, 'org = ""') : (await api(`/api/collections/${name}/records?perPage=1&fields=id`)).totalItems;
    if (n) console.log(`● ${name}: ${n} record(s) to put into the organisation`);
  }
  console.log('● replace the access rules:');
  for (const [name, c] of Object.entries(cols)) {
    const next = RULES[name] || DATA_RULES;
    const changed = RULE_KEYS.filter((k) => c[k] !== next[k]);
    if (!changed.length) { console.log(`  ✓ ${name}: already multi-organisation`); continue; }
    console.log(`  ${name}:`);
    for (const k of changed) console.log(`     ${k.padEnd(10)} ${show(c[k])}\n     ${''.padEnd(10)} → ${show(next[k])}`);
  }

  if (DRY) { console.log('\nDry run — nothing was changed.'); process.exit(0); }
  if (!YES && (await rl.question('\nApply all of this? Type "yes": ')).trim().toLowerCase() !== 'yes') {
    console.log('Cancelled — nothing was changed.');
    process.exit(0);
  }

  /* 1. organizations collection */
  if (!orgCol) {
    orgCol = await api('/api/collections', {
      method: 'POST',
      body: {
        name: 'organizations',
        type: 'base',
        fields: [
          { name: 'name', type: 'text', required: true, max: 120 },
          { name: 'status', type: 'select', values: ['active', 'suspended'], maxSelect: 1 },
          { name: 'home_city', type: 'text', max: 80 },
          { name: 'google_enabled', type: 'bool' },
          { name: 'notes', type: 'text', max: 2000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        ...ORG_RULES,
      },
    });
    console.log('✔ organizations collection created');
  }

  /* 2. org field (optional for now — required once everything has an org) */
  for (const [name, c] of Object.entries(cols)) {
    if (hasOrgField(c)) continue;
    const fields = [...c.fields, { name: 'org', type: 'relation', collectionId: orgCol.id, maxSelect: 1, cascadeDelete: false, required: false }];
    cols[name] = await api(`/api/collections/${c.id}`, { method: 'PATCH', body: { fields } });
    console.log(`✔ ${name}: org field added`);
  }

  /* 3. first organisation + existing records */
  if (!target) {
    target = await api('/api/collections/organizations/records', {
      method: 'POST', body: { name: newOrgName, status: 'active', google_enabled: true, home_city: homeCity },
    });
    console.log(`✔ organisation “${target.name}” created (${target.id})`);
  }
  const failed = [];
  for (const name of Object.keys(cols)) {
    let done = 0;
    let after = '';
    for (;;) {
      // walk the records without an org in id order (failed ones are simply passed over)
      const filter = after ? `org = "" && id > "${after}"` : 'org = ""';
      const page = await api(`/api/collections/${name}/records?perPage=500&sort=id&fields=id&skipTotal=1&filter=${encodeURIComponent(filter)}`);
      const ids = page.items.map((r) => r.id);
      if (!ids.length) break;
      after = ids[ids.length - 1];
      await pool(ids, 8, async (id) => {
        try {
          await api(`/api/collections/${name}/records/${id}`, { method: 'PATCH', body: { org: target.id } });
          done++;
        } catch (e) {
          failed.push({ collection: name, id, error: e.message });
        }
      });
      process.stdout.write(`\r  ${name}: ${done} record(s) moved into “${target.name}”`);
    }
    if (done) process.stdout.write('\n');
  }
  if (failed.length) {
    console.log(`\n⚠ ${failed.length} record(s) could not be updated (PocketBase rejected them — usually an invalid value in another field):`);
    for (const f of failed.slice(0, 20)) console.log(`  ${f.collection}/${f.id}: ${f.error}`);
    if (failed.length > 20) console.log(`  … and ${failed.length - 20} more`);
    console.log('  Fix those records in the dashboard (or set their org by hand) and run this script again.');
  }

  /* 4. rules */
  for (const [name, c] of Object.entries(cols)) {
    const next = RULES[name] || DATA_RULES;
    const patch = Object.fromEntries(RULE_KEYS.filter((k) => c[k] !== next[k]).map((k) => [k, next[k]]));
    if (Object.keys(patch).length) {
      cols[name] = await api(`/api/collections/${c.id}`, { method: 'PATCH', body: patch });
      console.log(`✔ ${name}: rules updated`);
    }
  }
  const orgPatch = Object.fromEntries(RULE_KEYS.filter((k) => orgCol[k] !== ORG_RULES[k]).map((k) => [k, ORG_RULES[k]]));
  if (Object.keys(orgPatch).length) await api(`/api/collections/${orgCol.id}`, { method: 'PATCH', body: orgPatch });

  /* 5. org required, where every record has one */
  for (const [name, c] of Object.entries(cols)) {
    const field = c.fields.find((f) => f.name === 'org');
    if (field.required) continue;
    if (await count(name, 'org = ""')) { console.log(`- ${name}: org left optional (some records still have none)`); continue; }
    const fields = c.fields.map((f) => (f.name === 'org' ? { ...f, required: true } : f));
    await api(`/api/collections/${c.id}`, { method: 'PATCH', body: { fields } });
    console.log(`✔ ${name}: org is now required`);
  }

  console.log(`\nDone. “${target.name}” holds all existing data; people only see their own organisation's records.`);
  console.log('Sign in to the app as a PocketBase superuser and open /organizations to add more organisations.');
  console.log('Also copy pb_hooks/meeting_conflicts.js to the server so clash checks stay within one organisation.');
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
