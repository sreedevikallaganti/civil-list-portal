// lib/occasions.ts — birthdays, service anniversaries, retirements, national days and the
// office's own special events, for the Occasions page. Pure functions (easy to test).

import type { OfficerService } from './officerDirectory';

export type OccasionKind = 'birthday' | 'service' | 'retirement' | 'national' | 'event';

export type OccasionPerson = {
  key: string;          // "IAS:<id>"
  id: string;
  kind: OfficerService | 'Employee';
  name: string;
  role: string;         // current position / designation
  phone: string;
  email: string;
  dob: string;          // YYYY-MM-DD or ''
  serviceStart: string; // YYYY-MM-DD or ''
  batch: string;
  cadre: string;
};

export type SpecialEvent = { id: string; title: string; date: string; repeats: boolean; notes: string };

export type Occasion = {
  id: string;
  kind: OccasionKind;
  date: string;         // YYYY-MM-DD of this occurrence
  inDays: number;       // 0 = today
  title: string;
  person?: OccasionPerson;
  years?: number;       // age turning / years of service
  notes?: string;
  event?: SpecialEvent;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((+startOf(b) - +startOf(a)) / 86_400_000);
const parse = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};

/** Superannuation at 60: retires on the last day of the month in which they turn 60;
    someone born on the 1st of a month retires on the last day of the previous month. */
export function retirementDate(dob: string, age = 60): string {
  const p = parse(dob);
  if (!p) return '';
  const y = p.y + age;
  // day 0 of a month = last day of the month before it
  const last = p.d === 1 ? new Date(y, p.m - 1, 0) : new Date(y, p.m, 0);
  return isoDay(last);
}

/** Next yearly occurrence of a date (today counts), within `days`; 29 Feb falls on 28 Feb in other years. */
function nextYearly(iso: string, today: Date, days: number): { date: Date; years: number } | null {
  const p = parse(iso);
  if (!p) return null;
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    let when = new Date(year, p.m - 1, p.d);
    if (when.getMonth() !== p.m - 1) when = new Date(year, p.m, 0); // 29 Feb → 28 Feb
    const inDays = daysBetween(today, when);
    if (inDays >= 0) return inDays <= days ? { date: when, years: year - p.y } : null;
  }
  return null;
}

export type Milestone = { date: string; inDays: number; years: number };

/** One officer's dates, for their profile: next birthday, next work anniversary, retirement.
    `retired` is true once the superannuation date has passed. */
export function personMilestones(
  { dob, serviceStart, kind }: Pick<OccasionPerson, 'dob' | 'serviceStart' | 'kind'>,
  today = new Date(),
): { birthday: Milestone | null; service: Milestone | null; retirement: Milestone | null; retired: boolean } {
  const start = startOf(today);
  const asMilestone = (hit: { date: Date; years: number } | null) =>
    hit ? { date: isoDay(hit.date), inDays: daysBetween(start, hit.date), years: hit.years } : null;
  const r = kind !== 'Employee' && dob ? retirementDate(dob) : '';
  const retired = Boolean(r && r < isoDay(start));
  const birthday = asMilestone(dob ? nextYearly(dob, start, 366) : null);
  const service = asMilestone(!retired && serviceStart ? nextYearly(serviceStart, start, 366) : null);
  const retirement = r ? { date: r, inDays: daysBetween(start, new Date(`${r}T00:00:00`)), years: 60 } : null;
  return {
    birthday: birthday && birthday.years > 0 ? birthday : null,
    service: service && service.years > 0 ? service : null,
    retirement,
    retired,
  };
}

/** National and service days (fixed dates). Festivals change every year — add them as special events. */
export const NATIONAL_DAYS: { md: string; title: string; note: string }[] = [
  { md: '01-26', title: 'Republic Day', note: 'National holiday' },
  { md: '04-21', title: 'Civil Services Day', note: 'Honours the civil services — greet IAS colleagues' },
  { md: '08-15', title: 'Independence Day', note: 'National holiday' },
  { md: '10-02', title: 'Gandhi Jayanti', note: 'National holiday' },
  { md: '10-21', title: 'Police Commemoration Day', note: 'Honours police martyrs — relevant for IPS officers' },
  { md: '10-31', title: 'Rashtriya Ekta Diwas', note: 'National Unity Day (Sardar Patel Jayanti)' },
];

export function buildOccasions(
  people: OccasionPerson[],
  events: SpecialEvent[],
  { days, today = new Date() }: { days: number; today?: Date },
): Occasion[] {
  const start = startOf(today);
  const out: Occasion[] = [];

  for (const p of people) {
    const b = p.dob && nextYearly(p.dob, start, days);
    if (b && b.years > 0) out.push({ id: `b:${p.key}`, kind: 'birthday', date: isoDay(b.date), inDays: daysBetween(start, b.date), title: p.name, person: p, years: b.years });

    // no "years of service" wishes once an officer has retired
    const retired = p.kind !== 'Employee' && p.dob && retirementDate(p.dob) < isoDay(start);
    const s = !retired && p.serviceStart && nextYearly(p.serviceStart, start, days);
    if (s && s.years > 0) out.push({ id: `s:${p.key}`, kind: 'service', date: isoDay(s.date), inDays: daysBetween(start, s.date), title: p.name, person: p, years: s.years });

    // IAS / IPS superannuation (directory staff records have no retirement rule here)
    if (p.dob && p.kind !== 'Employee') {
      const r = retirementDate(p.dob);
      const inDays = r ? daysBetween(start, new Date(`${r}T00:00:00`)) : -1;
      if (inDays >= 0 && inDays <= days) out.push({ id: `r:${p.key}`, kind: 'retirement', date: r, inDays, title: p.name, person: p, years: 60 });
    }
  }

  for (const n of NATIONAL_DAYS) {
    const hit = nextYearly(`2000-${n.md}`, start, days);
    if (hit) out.push({ id: `n:${n.md}`, kind: 'national', date: isoDay(hit.date), inDays: daysBetween(start, hit.date), title: n.title, notes: n.note });
  }

  for (const e of events) {
    if (e.repeats) {
      const hit = nextYearly(e.date, start, days);
      if (hit) out.push({ id: `e:${e.id}`, kind: 'event', date: isoDay(hit.date), inDays: daysBetween(start, hit.date), title: e.title, notes: e.notes, event: e });
    } else {
      const d = parse(e.date);
      if (!d) continue;
      const when = new Date(d.y, d.m - 1, d.d);
      const inDays = daysBetween(start, when);
      if (inDays >= 0 && inDays <= days) out.push({ id: `e:${e.id}`, kind: 'event', date: e.date.slice(0, 10), inDays, title: e.title, notes: e.notes, event: e });
    }
  }

  return out.sort((a, b) => a.inDays - b.inDays || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

/** Ready-to-send greeting for WhatsApp / email. */
export function greeting(o: Occasion, sender = ''): string {
  const name = o.person?.name || '';
  const sign = sender ? `\n\nWarm regards,\n${sender}` : '';
  switch (o.kind) {
    case 'birthday':
      return `Respected ${name},\nMany happy returns of the day! Wishing you good health, happiness and continued success in the year ahead.${sign}`;
    case 'service':
      return `Respected ${name},\nHeartiest congratulations on completing ${o.years} year${o.years === 1 ? '' : 's'} of distinguished service. Wishing you many more years of success.${sign}`;
    case 'retirement':
      return `Respected ${name},\nOn your superannuation, my sincere thanks for your outstanding service and best wishes for a healthy, happy and fulfilling retired life.${sign}`;
    default:
      return `Greetings on ${o.title}!${sign}`;
  }
}

/** wa.me link with the message ready; 10-digit numbers are taken as Indian (+91). */
export function whatsappUrl(phone: string, text: string): string | null {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
