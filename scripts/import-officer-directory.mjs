/* scripts/import-officer-directory.mjs — load the combined officers directory into PocketBase.

   Creates four NEW collections (the existing ias_officers / ips_officers are never read or changed):
     ias_directory, ips_directory, ifs_directory, irs_directory (IRS (IT) + IRS (C&IT), told apart by `service`)

   Input: a JSON array of rows with name, service, batch, cadre, designation, department, date_of_birth (dd/mm/yyyy),
          officer_id, contact_number, email, status, photo_url  (exported from All_Officers_Combined.xlsx)

   node scripts/import-officer-directory.mjs <officers.json>            → dry run: checks the data, writes nothing
   node scripts/import-officer-directory.mjs <officers.json> --apply    → creates the collections (if missing) and upserts

   Login: a PocketBase superuser, read from .env.local — PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (never printed).
   Upsert key: officer_id within each collection, so running it again updates instead of duplicating. Nothing is deleted. */

import { readFileSync } from 'node:fs';
import PocketBase from 'pocketbase';

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
if (!file) { console.error('Usage: node scripts/import-officer-directory.mjs <officers.json> [--apply]'); process.exit(1); }

// .env.local (simple KEY=value lines)
const env = { ...process.env };
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env.local */ }
const url = env.POCKETBASE_URL || env.NEXT_PUBLIC_POCKETBASE_URL;

const COLLECTION = { IAS: 'ias_directory', IPS: 'ips_directory', IFS: 'ifs_directory', 'IRS (IT)': 'irs_directory', 'IRS (C&IT)': 'irs_directory' };
const STATUSES = ['Serving', 'On Deputation', 'Under Training', 'Awaiting Posting', 'Under Suspension', 'Retired'];

const FIELDS = [
  { name: 'name', type: 'text', required: true, max: 200 },
  { name: 'service', type: 'select', required: true, maxSelect: 1, values: ['IAS', 'IPS', 'IFS', 'IRS (IT)', 'IRS (C&IT)'] },
  { name: 'batch', type: 'number', onlyInt: true, min: 1900, max: 2100 },
  { name: 'cadre', type: 'text', max: 100 },
  { name: 'designation', type: 'text', max: 300 },
  { name: 'department', type: 'text', max: 500 },
  { name: 'date_of_birth', type: 'date' },
  { name: 'officer_id', type: 'text', max: 50 },
  { name: 'contact_number', type: 'text', max: 200 },
  { name: 'email', type: 'text', max: 200 },
  { name: 'status', type: 'select', maxSelect: 1, values: STATUSES },
  { name: 'photo_url', type: 'text', max: 1000 },
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

/* ── read + check the data ── */
const str = (v) => (v == null ? '' : String(v).trim());
function toRecord(r) {
  const dob = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(r.date_of_birth));
  return {
    name: str(r.name),
    service: str(r.service),
    batch: Number(r.batch) || null,
    cadre: str(r.cadre),
    designation: str(r.designation),
    department: str(r.department),
    date_of_birth: dob ? `${dob[3]}-${dob[2]}-${dob[1]} 00:00:00.000Z` : '',
    officer_id: str(r.officer_id),
    contact_number: str(r.contact_number),
    email: str(r.email),
    status: STATUSES.includes(str(r.status)) ? str(r.status) : 'Serving',
    photo_url: str(r.photo_url),
  };
}

const rows = JSON.parse(readFileSync(file, 'utf8')).map(toRecord);
const groups = {};
const problems = [];
for (const r of rows) {
  const col = COLLECTION[r.service];
  if (!col) { problems.push(`unknown service "${r.service}" for ${r.name}`); continue; }
  if (!r.name) { problems.push(`row without a name (${r.service} ${r.officer_id})`); continue; }
  (groups[col] ??= []).push(r);
}
// one record per service + officer_id (IRS (IT) and IRS (C&IT) share a collection and their ID ranges overlap);
// officers without an ID are matched by name + batch
const keyOf = (r) => `${r.service}|${r.officer_id || `${String(r.name).toLowerCase()}|${r.batch}`}`;
for (const [col, list] of Object.entries(groups)) {
  const seen = new Map();
  for (const r of list) seen.set(keyOf(r), r);
  if (seen.size !== list.length) problems.push(`${col}: ${list.length - seen.size} duplicate officer(s) in the file — the last one wins`);
  groups[col] = [...seen.values()];
}

console.log(`${rows.length} rows read from ${file}`);
for (const [col, list] of Object.entries(groups)) {
  const svc = [...new Set(list.map((r) => r.service))].join(' + ');
  console.log(`  ${col.padEnd(14)} ${String(list.length).padStart(5)}  (${svc}; ${list.filter((r) => r.date_of_birth).length} with date of birth)`);
}
if (problems.length) { console.log('Notes:'); for (const p of problems.slice(0, 20)) console.log('  -', p); }

if (!url) { console.error('No PocketBase URL (NEXT_PUBLIC_POCKETBASE_URL) in .env.local'); process.exit(1); }
if (!env.PB_ADMIN_EMAIL || !env.PB_ADMIN_PASSWORD) {
  console.log(`\nTo continue, add a PocketBase superuser login to .env.local:\n  PB_ADMIN_EMAIL=...\n  PB_ADMIN_PASSWORD=...`);
  process.exit(apply ? 1 : 0);
}

/* ── PocketBase ── */
const pb = new PocketBase(url);
pb.autoCancellation(false);
try {
  await pb.collection('_superusers').authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
} catch (e) {
  console.error(`Could not log in to PocketBase at ${url} as a superuser (${e?.status ?? ''} ${e?.message ?? e}).`);
  process.exit(1);
}

// new collections get the same access rules as the existing ias_officers (read only, never changed)
let rules = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
try {
  const ref = await pb.collections.getOne('ias_officers');
  rules = { listRule: ref.listRule, viewRule: ref.viewRule, createRule: ref.createRule, updateRule: ref.updateRule, deleteRule: ref.deleteRule };
} catch { console.log('Note: ias_officers not found — new collections will be superuser-only until rules are set.'); }

async function ensureCollection(name) {
  try { return await pb.collections.getOne(name); } catch (e) { if (e?.status !== 404) throw e; }
  if (!apply) return null;
  const created = await pb.collections.create({
    name, type: 'base', fields: FIELDS, ...rules,
    indexes: [
      `CREATE UNIQUE INDEX idx_${name}_officer_id ON ${name} (service, officer_id) WHERE officer_id != ''`,
      `CREATE INDEX idx_${name}_batch ON ${name} (batch)`,
      `CREATE INDEX idx_${name}_service ON ${name} (service)`,
    ],
  });
  console.log(`  created collection ${name}`);
  return created;
}

async function runPool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); }));
}

for (const [col, list] of Object.entries(groups)) {
  const exists = await ensureCollection(col);
  const existing = new Map();
  if (exists) {
    for (const rec of await pb.collection(col).getFullList({ fields: 'id,service,officer_id,name,batch', batch: 1000 })) existing.set(keyOf(rec), rec.id);
  }
  const toUpdate = list.filter((r) => existing.has(keyOf(r)));
  const toCreate = list.filter((r) => !existing.has(keyOf(r)));
  console.log(`\n${col}: ${toCreate.length} to add, ${toUpdate.length} to update${exists ? '' : ' (collection will be created)'}`);
  if (!apply) continue;

  let done = 0;
  const failed = [];
  await runPool(list, 8, async (r) => {
    try {
      const id = existing.get(keyOf(r));
      if (id) await pb.collection(col).update(id, r); else await pb.collection(col).create(r);
    } catch (e) {
      failed.push(`${r.name} (${r.officer_id}): ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`);
    }
    if (++done % 1000 === 0) console.log(`  ${done} / ${list.length}`);
  });
  console.log(`  done: ${list.length - failed.length} saved, ${failed.length} failed`);
  for (const f of failed.slice(0, 10)) console.log('   -', f);
}

if (!apply) console.log('\nDry run only — nothing was written. Add --apply to import.');
