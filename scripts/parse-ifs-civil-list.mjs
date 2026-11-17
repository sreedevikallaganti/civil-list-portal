/* scripts/parse-ifs-civil-list.mjs — turn the MoEFCC "Indian Forest Service Civil List" PDF into an Excel-ready CSV.

   1. Download the latest civil list PDF from moef.gov.in (Forest Services → IFS civil list)
   2. node scripts/parse-ifs-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]

   Needs `pdftotext` (xpdf / poppler) on PATH — Git for Windows ships one.
   Date of birth and phone numbers are not kept; the official @ifs.nic.in / @nic.in e-mail is.
   Nothing is written to PocketBase. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [pdf, out = 'IFS_officers.csv', fromArg = '0'] = process.argv.slice(2);
if (!pdf) { console.error('Usage: node scripts/parse-ifs-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]'); process.exit(1); }
const fromBatch = Number(fromArg) || 0;

const raw = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');

const CADRES = {
  'AGMUT (ARUNACHAL-GOA-MIZORAM-UTs)': 'AGMUT', 'ANDHRA PRADESH': 'Andhra Pradesh', 'ASSAM & MEGHALAYA': 'Assam-Meghalaya',
  BIHAR: 'Bihar', CHHATTISGARH: 'Chhattisgarh', GUJARAT: 'Gujarat', HARYANA: 'Haryana', 'HIMACHAL PRADESH': 'Himachal Pradesh',
  JHARAKHAND: 'Jharkhand', JHARKHAND: 'Jharkhand', KARNATAKA: 'Karnataka', KERALA: 'Kerala', 'MADHYA PRADESH': 'Madhya Pradesh',
  MAHARASHTRA: 'Maharashtra', MANIPUR: 'Manipur', NAGALAND: 'Nagaland', ODISHA: 'Odisha', PUNJAB: 'Punjab', RAJASTHAN: 'Rajasthan',
  SIKKIM: 'Sikkim', 'TAMIL NADU': 'Tamil Nadu', TELANGANA: 'Telangana', TRIPURA: 'Tripura', 'UTTAR PRADESH': 'Uttar Pradesh',
  UTTRAKHAND: 'Uttarakhand', UTTARAKHAND: 'Uttarakhand', 'WEST BENGAL': 'West Bengal',
};
// column headings repeated on every page
const HEADER = new Set(['STATE', 'S.NO.', 'OFFICER', 'CODE NO.', "OFFICER'S NAME", 'DATE OF BIRTH', 'RECTT. SOURCE', 'QUALIFICATION',
  'BATCH', 'DATE OF', 'APPOINT. TO', 'IFS', 'PRESENT SCALE', 'OF PAY IN', 'DATE OF APPTT. TO', 'SCALE', 'PRESENT POST', 'DATE OF APPTT.',
  'TO PRESENT', 'POST/ E-MAIL', 'TELEPHONE', 'NO. (OFFICE)', '(RESIDENCE)', '(MOBILE)']);

// the officer code's prefix names the cadre (more reliable than the page headings)
const PREFIX = {
  AGMU: 'AGMUT', AM: 'Assam-Meghalaya', AP: 'Andhra Pradesh', BH: 'Bihar', CHH: 'Chhattisgarh', GJ: 'Gujarat', HP: 'Himachal Pradesh',
  HR: 'Haryana', JHK: 'Jharkhand', KR: 'Kerala', KT: 'Karnataka', MN: 'Manipur', MP: 'Madhya Pradesh', MS: 'Maharashtra',
  NG: 'Nagaland', OR: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TG: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura',
  UP: 'Uttar Pradesh', UTT: 'Uttarakhand', WB: 'West Bengal',
};
const DATE = /^\d{2}\/\d{2}\/\d{4}/;
const CODE = /^[A-Z]{2,4}\/\s?\d+$/;
const hasHindi = (s) => /[ऀ-ॿ]/.test(s);

// one pass: keep cadre headings (as markers) and plain-English data lines
const lines = [];
for (let l of raw.split(/\r?\n/)) {
  l = l.replace(/\s+/g, ' ').trim();
  if (!l) continue;
  if (hasHindi(l)) {
    const latin = l.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    if (CADRES[latin]) lines.push({ cadre: CADRES[latin] });
    continue;
  }
  if (HEADER.has(l) || /^https?:\/\/ifs\.nic\.in/i.test(l) || /^\f/.test(l)) continue;
  lines.push(l);
}

const rows = [];
let cadre = '';
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (typeof l === 'object') { cadre = l.cadre; continue; }
  if (!/^\d{4}$/.test(l) || !CODE.test(lines[i + 1] ?? '')) continue; // serial, then officer code

  const code = lines[i + 1].replace(/\s/g, '');
  // the entry runs until the next serial + code
  let end = i + 2;
  while (end < lines.length && !(typeof lines[end] === 'string' && /^\d{4}$/.test(lines[end]) && CODE.test(lines[end + 1] ?? ''))) end++;
  const e = lines.slice(i + 2, end).filter((x) => typeof x === 'string');
  const cadreAfter = lines.slice(i + 2, end).find((x) => typeof x === 'object');

  let k = 0;
  const name = [];
  while (k < e.length && !DATE.test(e[k])) name.push(e[k++]);
  k++; // date of birth (not kept)
  const recruitment = e[k++] ?? '';
  const qual = [];
  // qualification runs until the batch year (recently inducted SFS officers have no batch yet: straight to a date)
  while (k < e.length && !/^(19|20)\d{2}$/.test(e[k]) && !DATE.test(e[k])) qual.push(e[k++]);
  const batch = /^(19|20)\d{2}$/.test(e[k] ?? '') ? e[k++] : '';
  k++; // date of appointment to IFS
  // pay band lines ("67700-208700", "225000", "EX-CADRE", "AGAINST SDR") come before the pay level
  const lv = e.slice(k, k + 5).findIndex((x) => /^Level\s/i.test(x));
  const level = lv >= 0 ? e[k + lv] : '';
  if (lv >= 0) k += lv + 1;
  if (DATE.test(e[k] ?? '')) k++; // date of appointment to scale
  const post = [];
  let since = '';
  for (; k < e.length; k++) {
    if (DATE.test(e[k])) { since = e[k].slice(0, 10); break; }
    // phone numbers / e-mail follow the post
    if (e[k].includes('@') || /^[\d\s()+\-/,]{6,}$/.test(e[k])) break;
    post.push(e[k]);
  }
  const email = (e.find((x) => /@/.test(x)) ?? '').split(/\s+/).find((x) => x.includes('@')) ?? '';

  const posting = post.join(' ').replace(/\s+/g, ' ').trim();
  const parts = posting.split(',').map((s) => s.trim()).filter(Boolean);
  rows.push({
    name: name.join(' '), service: 'IFS', batch_year: batch, identity_no: code, cadre: PREFIX[code.split('/')[0]] ?? cadre, domicile: '', recruitment,
    designation: parts[0] ?? '', department: parts.slice(1).join(', '), location: '', current_position: posting,
    posting_since: since, pay_scale: level ? `${level} in the Pay Matrix` : '', qualification: qual.join(' '), email, remarks: '',
  });
  if (cadreAfter) cadre = cadreAfter.cadre;
  i = end - 1;
}

const kept = rows.filter((r) => Number(r.batch_year) >= fromBatch);
const cols = Object.keys(rows[0]);
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(out, '﻿' + [cols.join(','), ...kept.map((r) => cols.map((c) => cell(String(r[c] ?? ''))).join(','))].join('\r\n'));

const perBatch = {};
for (const r of kept) perBatch[r.batch_year] = (perBatch[r.batch_year] ?? 0) + 1;
console.log(Object.entries(perBatch).sort().map(([y, n]) => `${y}: ${n}`).join('  '));
console.log(`Saved ${kept.length} of ${rows.length} officers to ${out}`);
