/* scripts/parse-irs-it-civil-list.mjs — turn the "Civil List of the Indian Revenue Service (Income Tax)" PDF
   (Directorate of HRD, CBDT; e.g. Civil List 2026) into an Excel-ready CSV.

   node scripts/parse-irs-it-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]

   Batch: the civil code starts with the batch ("92059" → 1992). Promotee codes ("225AD") and the batch under
   training ("-") carry no batch, so the year of appointment to IRS is used for those.
   Needs `pdftotext` on PATH (Git for Windows ships one). Date of birth is not kept. Nothing is written to PocketBase. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [pdf, out = 'IRS_IT_officers.csv', fromArg = '0'] = process.argv.slice(2);
if (!pdf) { console.error('Usage: node scripts/parse-irs-it-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]'); process.exit(1); }
const fromBatch = Number(fromArg) || 0;

const raw = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');
const all = raw.split(/\r?\n/).map((l) => l.replace(/[\s  ]+/g, ' ').trim()).filter(Boolean);

// the consolidated index at the back gives each officer's rank
const indexAt = all.findIndex((l) => /^CONSOLIDATED INDEX/.test(l));
const lines = indexAt > 0 ? all.slice(0, indexAt) : all;
const rankByCode = new Map();
const rankByName = new Map();
for (const l of indexAt > 0 ? all.slice(indexAt) : []) {
  const m = /^(.+?) (\d{5}[A-Z]?|\d{3}[A-Z]{2}|-) (.+?) \d+$/.exec(l);
  if (!m) continue;
  if (m[2] !== '-') rankByCode.set(m[2], m[3]);
  rankByName.set(m[1].replace(/\s+/g, ' ').toUpperCase(), m[3]);
}

const SERIAL_NAME = /^(\d{1,4}) ([A-Z][A-Z .'()-]*)$/;
const CODE = /^(\d{5}[A-Z]?|\d{3}[A-Z]{2}|-)$/;
const DATE = /^\d{2}-\d{2}-\d{4}$/;
const NAME_MORE = /^[A-Z][A-Z .'()-]*$/;

const rows = [];
for (let i = 0; i < lines.length; i++) {
  const sn = SERIAL_NAME.exec(lines[i]);
  if (!sn) continue;
  // the name can wrap over a couple of lines before the civil code
  const name = [sn[2]];
  let k = i + 1;
  while (k < i + 4 && NAME_MORE.test(lines[k] ?? '') && !CODE.test(lines[k])) name.push(lines[k++]);
  if (!CODE.test(lines[k] ?? '')) continue;
  const code = lines[k++];

  // e-mail (often wrapped), then date of birth
  const mail = [];
  while (k < lines.length && !DATE.test(lines[k]) && mail.length < 4) mail.push(lines[k++]);
  if (!DATE.test(lines[k] ?? '')) continue;
  k++; // date of birth (not kept)
  const qual = [];
  while (k < lines.length && !DATE.test(lines[k]) && qual.length < 6) qual.push(lines[k++]);
  const appointed = DATE.test(lines[k] ?? '') ? lines[k++] : '';
  if (DATE.test(lines[k] ?? '')) k++; // date of appointment in the present grade

  const post = [];
  let since = '';
  for (; k < lines.length && post.length < 6; k++) {
    if (DATE.test(lines[k])) { since = lines[k++]; break; }
    if (/^•/.test(lines[k]) || SERIAL_NAME.test(lines[k]) || lines[k] === '-') break;
    post.push(lines[k]);
  }
  // "Post held by officer in Deputation / CBDT / Directorates": bullet lines
  const held = [];
  for (; k < lines.length && !SERIAL_NAME.test(lines[k]); k++) {
    if (/^•/.test(lines[k])) held.push(lines[k].replace(/^•\s*/, ''));
    else if (held.length && !/^\d+$/.test(lines[k]) && /[a-z]/.test(lines[k])) held[held.length - 1] += ` ${lines[k]}`;
    else if (held.length || /^\d+$/.test(lines[k])) break;
  }
  i = k - 1;

  const fullName = name.join(' ').replace(/\s+/g, ' ').trim();
  const batch = /^\d{5}/.test(code) ? `${Number(code.slice(0, 2)) > 50 ? 19 : 20}${code.slice(0, 2)}` : appointed.slice(-4);
  // "Mumbai • Addl./JDIT, Directorate of Vigilance": a bullet on the same line starts the deputation post
  const [postText, ...inlineHeld] = post.join(' ').split('•');
  held.unshift(...inlineHeld.map((h) => h.trim()).filter(Boolean));
  const posting = postText.replace(/\s+/g, ' ').replace(/[\s-]+$/, '').trim();
  rows.push({
    name: fullName.replace(/\b([A-Z])([A-Z']+)\b/g, (_, a, b) => a + b.toLowerCase()), // "SARITA MISHRA" → "Sarita Mishra"
    service: 'IRS (IT)', batch_year: batch, identity_no: code === '-' ? '' : code, cadre: '', domicile: '',
    recruitment: /^\d{5}/.test(code) ? 'Direct Recruit' : code === '-' ? 'Direct Recruit (under training)' : 'Promotee',
    designation: rankByCode.get(code) ?? rankByName.get(fullName.toUpperCase()) ?? '',
    department: 'Income Tax Department', location: '', current_position: posting, posting_since: since.replace(/-/g, '/'),
    pay_scale: '', qualification: qual.join(' ').replace(/\s+/g, ' ').trim(),
    email: mail.join('').replace(/\s+/g, ''), remarks: held.length ? `Post held: ${held.join('; ')}` : '',
  });
}

const seen = new Set();
const unique = rows.filter((r) => { const key = r.identity_no || r.name; return !seen.has(key) && seen.add(key); });
const kept = unique.filter((r) => Number(r.batch_year) >= fromBatch);
const cols = Object.keys(rows[0]);
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(out, '﻿' + [cols.join(','), ...kept.map((r) => cols.map((c) => cell(String(r[c] ?? ''))).join(','))].join('\r\n'));

const perBatch = {};
for (const r of kept) perBatch[r.batch_year] = (perBatch[r.batch_year] ?? 0) + 1;
console.log(Object.entries(perBatch).sort().map(([y, n]) => `${y}: ${n}`).join('  '));
console.log(`Saved ${kept.length} of ${unique.length} officers to ${out} (${rows.length - unique.length} repeated entries skipped; index lists ${rankByName.size})`);
