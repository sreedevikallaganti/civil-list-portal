/* scripts/fetch-ias-civil-list.mjs — download IAS officers of one or more batch (allotment) years
   from the public DoPT civil list (iascivillist.dopt.gov.in → General Query) into an Excel-ready CSV.

   Usage:
     node scripts/fetch-ias-civil-list.mjs 2011              → ias_2011.csv
     node scripts/fetch-ias-civil-list.mjs 2005-2015         → ias_2005-2015.csv
     node scripts/fetch-ias-civil-list.mjs 2011 out.csv      → out.csv

   Read-only: it only reads the public list, one batch at a time with a pause in between.
   Photos, date of birth and date of superannuation are not kept. Nothing is written to PocketBase. */

import { writeFileSync } from 'node:fs';

const URL_ = 'https://iascivillist.dopt.gov.in/Home/GeneralQuery';
const PAUSE_MS = 3000;

const [range, outArg] = process.argv.slice(2);
const m = /^(\d{4})(?:-(\d{4}))?$/.exec(range ?? '');
if (!m) {
  console.error('Usage: node scripts/fetch-ias-civil-list.mjs <year | from-to> [out.csv]');
  process.exit(1);
}
const from = Number(m[1]);
const to = Number(m[2] ?? m[1]);
const out = outArg ?? `ias_${range}.csv`;

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (html) => decode(String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** the value after a "<b>Label:</b>" in a card */
const field = (card, label) => {
  const r = new RegExp(`<b>${label}:?</b>([\\s\\S]*?)</p>`, 'i').exec(card);
  return r ? text(r[1]) : '';
};

function parse(html) {
  const cards = html.split('class="IAS_cardCont"').slice(1);
  return cards.map((card) => {
    const name = text(/<b>Name:<\/b>([\s\S]*?)<\/a>/i.exec(card)?.[1]);
    const [cadre = '', domicile = ''] = field(card, 'Cadre & Domicile').split('&').map((s) => s.trim());
    const postings = [...card.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((li) => {
      const [post, since = ''] = li[1].split(/Posting W\.E\.F\.:/i);
      return { post: text(post).replace(/\.$/, ''), since: text(since) };
    });
    const first = postings[0] ?? { post: '', since: '' };
    const parts = first.post.split(',').map((s) => s.trim()).filter(Boolean);
    return {
      name,
      service: 'IAS',
      batch_year: field(card, 'Allotment Year'),
      identity_no: field(card, 'Identity No\\.'),
      cadre,
      domicile,
      recruitment: field(card, 'Source of Recruitment'),
      designation: parts[0] ?? '',
      department: parts.slice(1, -1).join(', '),
      location: parts.length > 1 ? parts[parts.length - 1] : '',
      current_position: postings.map((p) => p.post).join(' | '),
      posting_since: first.since,
      pay_scale: field(card, 'Pay Scale'),
      qualification: field(card, 'Qualification\\(Subject\\)'),
      remarks: field(card, 'Remarks'),
    };
  }).filter((r) => r.name);
}

async function fetchYear(year) {
  const body = new URLSearchParams({
    ViewCadreCode: '', Allotmentyear: String(year), OfficerName: '', gender: '', payout: '',
    Recutment: '', Retairment: '', btn_general_query: 'Submit',
  });
  const res = await fetch(URL_, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parse(await res.text());
}

const rows = [];
for (let year = from; year <= to; year++) {
  try {
    const got = await fetchYear(year);
    console.log(`${year}: ${got.length} officers`);
    rows.push(...got);
  } catch (e) {
    console.warn(`${year}: failed (${e.message}) — run this year again later`);
  }
  if (year < to) await new Promise((r) => setTimeout(r, PAUSE_MS));
}

if (!rows.length) { console.error('No officers found.'); process.exit(1); }
const cols = Object.keys(rows[0]);
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// BOM so Excel opens it as UTF-8 (Hindi names, ₹ etc. stay intact)
writeFileSync(out, '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(String(r[c] ?? ''))).join(','))].join('\r\n'));
console.log(`Saved ${rows.length} officers to ${out}`);
