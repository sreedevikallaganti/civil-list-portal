/* scripts/parse-ips-civil-list.mjs — turn the MHA "IPS Civil List" PDF into an Excel-ready CSV.

   1. Download the PDF from https://ips.gov.in/ips_civillist.aspx (e.g. Empanelment/CivilList2026.pdf)
   2. node scripts/parse-ips-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]
        e.g. node scripts/parse-ips-civil-list.mjs CivilList2026.pdf IPS_officers.csv 1985

   Needs `pdftotext` (xpdf / poppler) on PATH — Git for Windows ships one.
   Date of birth and date of joining are not kept. Nothing is written to PocketBase. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [pdf, out = 'IPS_officers.csv', fromArg = '0'] = process.argv.slice(2);
if (!pdf) { console.error('Usage: node scripts/parse-ips-civil-list.mjs <CivilList.pdf> [out.csv] [fromBatch]'); process.exit(1); }
const fromBatch = Number(fromArg) || 0;

const raw = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');

const CADRES = {
  'andhra pradesh': 'Andhra Pradesh', 'arunachal pradesh-goa-mizoram-uts': 'AGMUT', 'assam-meghalaya': 'Assam-Meghalaya',
  bihar: 'Bihar', chhattisgarh: 'Chhattisgarh', gujarat: 'Gujarat', haryana: 'Haryana', 'himachal pradesh': 'Himachal Pradesh',
  jharkhand: 'Jharkhand', karnataka: 'Karnataka', kerala: 'Kerala', 'madhya pradesh': 'Madhya Pradesh', maharashtra: 'Maharashtra',
  manipur: 'Manipur', nagaland: 'Nagaland', odisha: 'Odisha', punjab: 'Punjab', rajasthan: 'Rajasthan', sikkim: 'Sikkim',
  'tamil nadu': 'Tamil Nadu', telangana: 'Telangana', tripura: 'Tripura', 'uttar pradesh': 'Uttar Pradesh',
  uttarakhand: 'Uttarakhand', 'west bengal': 'West Bengal',
};
// keep only Latin text (the PDF also carries Hindi headings that extract as noise)
const clean = (s) => s.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
const cadreOf = (line) => CADRES[clean(line).replace(/^[-\s]+/, '').toLowerCase()];

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
// "72", "72 ..", "39 -2", "360 :": serial numbers sometimes carry stray marks.
// At most 3 digits, so a medal year wrapped onto its own line ("2004") is not taken for one.
const SERIAL = /^\d{1,3}(?![\d/,A-Za-z])/;
const ID = /^(19|20)\d{6}$/;
const RECRUIT = /^(RR|SPS|NON-?SPS|SCS|NSCS)$/i;
const DEGREE = /(^|\s)(B|M|Ph|LL|D)\.\s?[A-Za-z(]|\b(MBBS|BDS|B\.?\s?Com|M\.?\s?Com|B\.?\s?Sc|M\.?\s?Sc|B\.?\s?Tech|M\.?\s?Tech|BE|ME|MBA|LLB|LLM|AMIE|CA|PhD|Ph\.D|BSc|MSc|BA|MA|BCom|MCom|M\.?Phil|PGD\w*|Gradu\w*|Batchelor\w*|Bachelor\w*|Master|Degree|Shastri|Chartered|Diploma|Post\s?Graduate|Matric\w*|Inter\w*|MD|MS|BBA|BCA|MCA|B\.?Arch|B\.?Ed|M\.?Ed)\b/i;

const rows = [];
let cadre = '';
let batch = '';
for (const page of raw.split('\f')) {
  const lines = page.split(/\r?\n/).map(clean).filter(Boolean);
  // the cadre heading sits at the top of every list page
  for (const l of lines.slice(0, 4)) { const c = cadreOf(l); if (c) { cadre = c; break; } }
  if (!lines.some((l) => /^\(1\) \(2\) \(3\)/.test(l))) continue; // not a list page (contents, appendix, index)

  for (let i = 0; i < lines.length; i++) {
    const a = /^Allotment Year\s*:?\s*((19|20)\d{2})/i.exec(lines[i]);
    if (a) { batch = a[1]; continue; }
    if (!SERIAL.test(lines[i])) continue; // serial number starts an entry
    // name / qualification lines run until the recruitment code, which is followed by the ID
    let r = i + 1;
    while (r < lines.length && r < i + 8 && !RECRUIT.test(lines[r])) r++;
    if (r >= lines.length || !RECRUIT.test(lines[r]) || !ID.test(lines[r + 1] ?? '')) continue;

    // a heading or another serial between here and the code means the entry really starts later
    let start = i + 1;
    for (let h = i + 1; h < r; h++) if (/^Allotment Year/i.test(lines[h]) || SERIAL.test(lines[h])) start = h + 1;
    const head = lines.slice(start, r);
    let q = head.findIndex((l, k) => k > 0 && DEGREE.test(l));
    if (q < 0) q = head.length > 2 ? 2 : head.length; // no degree found: assume at most 2 name lines
    const name = head.slice(0, q).join(' ').replace(/^[\s.)(:-]+/, '');
    const qualification = head.slice(q).join(' ');
    const recruitment = lines[r].toUpperCase();
    const identity = lines[r + 1];

    let k = r + 2;
    let domicile = '';
    if (!DATE.test(lines[k] ?? '')) domicile = lines[k++] ?? '';
    // date of birth and date of joining: skipped
    while (k < lines.length && DATE.test(lines[k]) && k < r + 6) k++;
    const post = [];
    let since = '';
    let level = '';
    for (; k < lines.length && k < r + 20; k++) {
      const l = lines[k];
      if (/^Level\s+\d/i.test(l)) { level = l; break; }
      if (/^Allotment Year/i.test(l) || SERIAL.test(l)) break;
      if (DATE.test(l)) since = l; else post.push(l);
    }
    i = k - 1;

    // the ID always starts with the allotment year (checked against every "Allotment Year" heading)
    const batchYear = identity.slice(0, 4) || batch;
    const posting = post.join(' ').replace(/\s+/g, ' ').trim();
    const parts = posting.split(',').map((s) => s.trim()).filter(Boolean);
    rows.push({
      name, service: 'IPS', batch_year: batchYear, identity_no: identity, cadre, domicile, recruitment,
      designation: parts[0] ?? '', department: parts.slice(1).join(', '), location: '',
      current_position: posting, posting_since: since, pay_scale: level ? `${level} in the Pay Matrix` : '',
      qualification, remarks: '',
    });
  }
}

const kept = rows.filter((r) => Number(r.batch_year) >= fromBatch);
const cols = Object.keys(kept[0] ?? rows[0]);
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(out, '﻿' + [cols.join(','), ...kept.map((r) => cols.map((c) => cell(String(r[c] ?? ''))).join(','))].join('\r\n'));

const perBatch = {};
for (const r of kept) perBatch[r.batch_year] = (perBatch[r.batch_year] ?? 0) + 1;
console.log(Object.entries(perBatch).sort().map(([y, n]) => `${y}: ${n}`).join('\n'));
console.log(`Saved ${kept.length} of ${rows.length} officers to ${out}`);
