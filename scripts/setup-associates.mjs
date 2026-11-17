#!/usr/bin/env node
// scripts/setup-associates.mjs — creates the collections the /associates page needs,
// on the PocketBase server the app uses (the same as pb_migrations/1790900000_associates.js,
// and 1791000000_associate_imports.js, but through the API, so nothing has to be copied to the server).
//
//   node scripts/setup-associates.mjs
//
//   associate_fields  the list's columns (key · label · type · options · required · show_in_table · sort_order)
//   associates        one person per record: name + data (JSON, keyed by field key)
//   associate_imports one record per uploaded Excel / CSV file — the staging area for bulk imports
//
// Both get an `org` field and the same access rules as the rest of the data when the database
// is multi-organisation (members read, everyone except viewers writes). Safe to run again —
// collections that already exist are left alone.
// Signs in with a SUPERUSER email + password (the PocketBase dashboard login),
// or PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD from the environment.

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/* ── access rules (same as scripts/multi-tenant-pocketbase.mjs) ─────── */
const all = (...parts) => parts.filter(Boolean).join(' && ');
const SIGNED_IN = '@request.auth.id != ""';
const WRITER = all('@request.auth.role !~ "viewer"',
  '(@request.auth.permissions = null || @request.auth.permissions = "" || @request.auth.permissions !~ "viewer")');

function rules(tenant) {
  if (!tenant) {
    return {
      listRule: SIGNED_IN, viewRule: SIGNED_IN,
      createRule: all(SIGNED_IN, WRITER), updateRule: all(SIGNED_IN, WRITER), deleteRule: all(SIGNED_IN, WRITER),
    };
  }
  const MEMBER = all(SIGNED_IN, '@request.auth.org != ""', '@request.auth.org.status != "suspended"');
  const SAME_ORG = 'org = @request.auth.org';
  return {
    listRule: all(MEMBER, SAME_ORG),
    viewRule: all(MEMBER, SAME_ORG),
    createRule: all(MEMBER, WRITER, '@request.body.org = @request.auth.org'),
    updateRule: all(MEMBER, SAME_ORG, WRITER, '(@request.body.org:isset = false || @request.body.org = @request.auth.org)'),
    deleteRule: all(MEMBER, SAME_ORG, WRITER),
  };
}

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

const stamps = [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

/* ── main ─────────────────────────────────────────────────────────── */
const rl = readline.createInterface({ input, output });
try {
  BASE = pbUrl();
  console.log(`\nPocketBase: ${BASE}`);
  const email = process.env.PB_ADMIN_EMAIL || (await rl.question('Superuser email: '));
  const password = process.env.PB_ADMIN_PASSWORD || (await rl.question('Superuser password: '));
  ({ token: TOKEN } = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST', body: { identity: email.trim(), password },
  }));
  console.log('Signed in as superuser.\n');

  const orgs = await getCollection('organizations');
  const tenant = !!orgs;
  console.log(tenant ? 'Multi-organisation database: each organisation gets its own associates.' : 'Single-organisation database.');
  const org = tenant ? [{ name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true, cascadeDelete: false }] : [];

  const wanted = [
    {
      name: 'associate_fields',
      fields: [
        { name: 'key', type: 'text', required: true, max: 64, pattern: '^[a-z][a-z0-9_]*$' },
        { name: 'label', type: 'text', required: true, max: 80 },
        { name: 'type', type: 'select', required: true, maxSelect: 1, values: ['text', 'longtext', 'number', 'date', 'email', 'phone', 'url', 'select'] },
        { name: 'options', type: 'json', maxSize: 20000 },
        { name: 'required', type: 'bool' },
        { name: 'show_in_table', type: 'bool' },
        { name: 'sort_order', type: 'number', onlyInt: true },
        ...org, ...stamps,
      ],
      indexes: [tenant
        ? 'CREATE UNIQUE INDEX idx_associate_fields_org_key ON associate_fields (org, `key`)'
        : 'CREATE UNIQUE INDEX idx_associate_fields_key ON associate_fields (`key`)'],
    },
    {
      name: 'associates',
      fields: [
        { name: 'name', type: 'text', required: true, max: 200 },
        { name: 'data', type: 'json', maxSize: 200000 },
        ...org, ...stamps,
      ],
      indexes: tenant ? ['CREATE INDEX idx_associates_org ON associates (org)'] : [],
    },
    {
      // the staging area: one record per uploaded file — rows wait here until the batch is submitted
      name: 'associate_imports',
      fields: [
        { name: 'file_name', type: 'text', required: true, max: 255 },
        { name: 'file', type: 'file', maxSelect: 1, maxSize: 15728640, protected: true },
        { name: 'file_hash', type: 'text', max: 64 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['uploaded', 'validating', 'draft', 'ready', 'submitted', 'failed'] },
        { name: 'settings', type: 'json', maxSize: 2000000 },
        { name: 'rows', type: 'json', maxSize: 30000000 },
        ...['total', 'valid', 'invalid', 'duplicates'].map((name) => ({ name, type: 'number', onlyInt: true })),
        { name: 'result', type: 'json', maxSize: 20000 },
        { name: 'error', type: 'text', max: 2000 },
        { name: 'uploaded_by', type: 'text', max: 200 },
        { name: 'submitted_by', type: 'text', max: 200 },
        { name: 'submitted_at', type: 'date' },
        ...org, ...stamps,
      ],
      indexes: tenant
        ? ['CREATE INDEX idx_associate_imports_org ON associate_imports (org, created)',
           'CREATE INDEX idx_associate_imports_hash ON associate_imports (org, file_hash)']
        : ['CREATE INDEX idx_associate_imports_hash ON associate_imports (file_hash)'],
    },
  ];

  for (const c of wanted) {
    if (await getCollection(c.name)) {
      console.log(`✓ ${c.name} already exists — left as it is`);
      continue;
    }
    await api('/api/collections', { method: 'POST', body: { type: 'base', ...c, ...rules(tenant) } });
    console.log(`✓ created ${c.name}`);
  }
  console.log('\nDone. Reload the Associates page in the app.\n');
} catch (err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
}
