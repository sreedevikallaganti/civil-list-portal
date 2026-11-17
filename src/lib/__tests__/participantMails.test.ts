import { describe, expect, it } from 'vitest';
import { dueGreetings, dueReminders, officerRefs } from '../participantMails';
import { serviceOf } from '../officerDirectory';

const tz = 'Asia/Kolkata';
const at = (iso: string) => Date.parse(`${iso}+05:30`); // a local IST wall-clock time
const meeting = (over: Record<string, any> = {}) => ({
  id: 'm1', status: 'Scheduled', send_invite: true, meeting_date: '2026-11-12 00:00:00.000Z', meeting_time: '11:00',
  officer_name: 'A. Kumar', email: 'kumar@gov.in', participants: [{ name: 'B. Rao', email: 'rao@gov.in' }], ...over,
});

describe('dueReminders', () => {
  it('24 hours before, then 1 hour before, to everyone with an email', () => {
    const day = dueReminders([meeting()], { now: at('2026-11-11T11:00:00'), timeZone: tz });
    expect(day.map((r) => r.before)).toEqual(['day']);
    expect(day[0].recipients.map((r) => r.email)).toEqual(['kumar@gov.in', 'rao@gov.in']);
    expect(dueReminders([meeting()], { now: at('2026-11-11T12:30:00'), timeZone: tz })).toEqual([]);
    expect(dueReminders([meeting()], { now: at('2026-11-12T10:05:00'), timeZone: tz }).map((r) => r.before)).toEqual(['hour']);
    expect(dueReminders([meeting()], { now: at('2026-11-12T11:01:00'), timeZone: tz })).toEqual([]);
  });
  it('a new time gets a new key; cancelled or no-email meetings get none', () => {
    const a = dueReminders([meeting()], { now: at('2026-11-12T10:30:00'), timeZone: tz })[0].key;
    const b = dueReminders([meeting({ meeting_time: '11:15' })], { now: at('2026-11-12T10:30:00'), timeZone: tz })[0].key;
    expect(a).not.toBe(b);
    expect(dueReminders([meeting({ status: 'Cancelled' })], { now: at('2026-11-12T10:30:00'), timeZone: tz })).toEqual([]);
    expect(dueReminders([meeting({ send_invite: false })], { now: at('2026-11-12T10:30:00'), timeZone: tz })).toEqual([]);
  });
});

describe('dueGreetings', () => {
  const people = [
    { service: 'IAS', id: 'a', name: 'A', email: 'a@gov.in', date_of_birth: '1980-11-04', date_of_joining: '2006-11-04' },
    { service: 'IPS', id: 'b', name: 'B', email: '', date_of_birth: '1980-11-04' },
    { service: 'IFS', id: 'c', name: 'C', email: 'c@gov.in', date_of_birth: '1960-11-04', date_of_joining: '1985-11-04' },
  ];
  it('from 09:00 on the day; officers without email skipped; no anniversaries after retirement', () => {
    expect(dueGreetings(people, { now: at('2026-11-04T08:30:00'), timeZone: tz })).toEqual([]);
    const due = dueGreetings(people, { now: at('2026-11-04T09:05:00'), timeZone: tz });
    expect(due.map((g) => `${g.kind}:${g.person.id}:${g.years}`)).toEqual(['birthday:a:46', 'service:a:20', 'birthday:c:66']);
  });
});

describe('officerRefs', () => {
  it('main officer and added participants, by service', () => {
    const refs = officerRefs([
      { officer_type: 'IAS', officer_id: 'aaaaaaaaaaaaaaa', participants: [{ type: 'IFS', id: 'bbbbbbbbbbbbbbb' }, { type: 'Employee', id: 'ccccccccccccccc' }] },
    ], serviceOf);
    expect([...refs.get('IAS')!]).toEqual(['aaaaaaaaaaaaaaa']);
    expect([...refs.get('IFS')!]).toEqual(['bbbbbbbbbbbbbbb']);
    expect(refs.has('Employee')).toBe(false);
  });
});
