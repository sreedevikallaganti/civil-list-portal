/* scripts/parse-irs-cit-civil-list.mjs — turn the CBIC / DGHRD "Civil List" PDF of IRS (Customs & Indirect Taxes)
   Group 'A' officers into an Excel-ready CSV.

   1. Download the PDF from https://dghrdcbic.gov.in/civil_list
   2. node scripts/parse-irs-cit-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]

   Needs `pdftotext` (xpdf / poppler) on PATH — Git for Windows ships one.
   Photos and date of birth are not kept. Nothing is written to PocketBase. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [pdf, out = 'IRS_CIT_officers.csv', fromArg = '0'] = process.argv.slice(2);
if (!pdf) { console.error('Usage: node scripts/parse-irs-cit-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]'); process.exit(1); }
const fromBatch = Number(fromArg) || 0;

const raw = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');
const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const hasHindi = (s) => /[ऀ-ॿ]/.test(s);
const DATE = /\d{2}-\d{2}-\d{4}/g;
const ONLY_DATE = /^\d{2}-\d{2}-\d{4}$/;
const RECTT = /^([A-Za-z.]+)-((?:19|20)\d{2})$/; // "DR-1990": source of recruitment + batch
const SERIAL = /^\d{1,4}$/;
const RECRUITMENT = { DR: 'Direct Recruit', PA: 'Promotee (PA)', PC: 'Promotee (PC)', PE: 'Promotee (PE)' };

// longest first, so "Principal Chief Commissioner" wins over "Chief Commissioner"
const DESIGNATIONS = [
  'Principal Chief Commissioner', 'Principal Director General', 'Principal Additional Director General', 'Principal Commissioner',
  'Principal Additional Director', 'Principal Addl. Director General', 'Principal Addl. Commissioner', 'Addl. Director General',
  'Addl. Commissioner', 'Addl. Director', 'Chief Commissioner', 'Director General', 'Additional Director General', 'Additional Commissioner',
  'Additional Director', 'Joint Commissioner', 'Joint Director', 'Deputy Commissioner', 'Deputy Director', 'Assistant Commissioner',
  'Assistant Director', 'Commissioner', 'Director', 'Chairman', 'Member', 'Officer on Special Duty', 'OSD', 'Probationer',
].sort((a, b) => b.length - a.length);

const rows = [];
for (let a = 0; a < lines.length; a++) {
  const rec = RECTT.exec(lines[a]);
  if (!rec || !/^\d+$/.test(lines[a - 1] ?? '') || !ONLY_DATE.test(lines[a - 2] ?? '')) continue;
  const identity = lines[a - 1];

  // name: English lines between the serial number and the date of birth
  const name = [];
  for (let b = a - 3; b > a - 12 && b >= 0; b--) {
    if (SERIAL.test(lines[b])) break;
    if (!hasHindi(lines[b])) name.unshift(lines[b]);
  }

  // qualification, then date of appointment to Group A and date of promotion to the present grade
  let k = a + 1;
  const qual = [];
  let dates = 0;
  for (; k < lines.length && k < a + 8 && dates < 2; k++) {
    const found = lines[k].match(DATE) ?? [];
    dates += found.length;
    const rest = lines[k].replace(DATE, '').trim();
    if (rest && !hasHindi(rest)) qual.push(rest);
  }

  // designation & posting (Hindi lines skipped), until the date of joining the posting
  const post = [];
  let since = '';
  for (; k < lines.length && k < a + 25; k++) {
    if (ONLY_DATE.test(lines[k])) { since = lines[k]; break; }
    if (SERIAL.test(lines[k]) || RECTT.test(lines[k])) break;
    if (hasHindi(lines[k])) continue;
    // "CEO, GSTN, Delhi 15-06-2020 (On Deputation)": the date of joining sits inside the line
    const inline = lines[k].match(DATE);
    if (inline) { since = inline[0]; const rest = lines[k].replace(DATE, '').trim(); if (rest) post.push(rest); break; }
    post.push(lines[k]);
  }
  const text = post.join(' ').replace(/\s+/g, ' ').trim();
  const designation = DESIGNATIONS.find((d) => text.toLowerCase().startsWith(d.toLowerCase())) ?? '';
  const posting = text.slice(designation.length).trim();

  rows.push({
    name: name.join(' ').replace(/\s+/g, ' ').replace(/\s*\((Ms|Mrs|Dr)\.?\)/i, '').trim(),
    service: 'IRS (C&IT)', batch_year: rec[2], identity_no: identity, cadre: '', domicile: '',
    recruitment: RECRUITMENT[rec[1].toUpperCase()] ?? rec[1],
    designation, department: posting, location: '', current_position: text, posting_since: since.replace(/-/g, '/'),
    pay_scale: '', qualification: qual.join(' ').replace(/\s+/g, ' ').trim(), remarks: '',
  });
}

// the Chairman & Members also appear in the main list: keep each ID once
const seen = new Set();
const unique = rows.filter((r) => !seen.has(r.identity_no) && seen.add(r.identity_no));
const kept = unique.filter((r) => Number(r.batch_year) >= fromBatch);
const cols = Object.keys(rows[0]);
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(out, '﻿' + [cols.join(','), ...kept.map((r) => cols.map((c) => cell(String(r[c] ?? ''))).join(','))].join('\r\n'));

const perBatch = {};
for (const r of kept) perBatch[r.batch_year] = (perBatch[r.batch_year] ?? 0) + 1;
console.log(Object.entries(perBatch).sort().map(([y, n]) => `${y}: ${n}`).join('  '));
console.log(`Saved ${kept.length} of ${unique.length} officers to ${out} (${rows.length - unique.length} repeated entries skipped)`);
