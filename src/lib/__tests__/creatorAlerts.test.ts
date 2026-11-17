import { describe, expect, it } from 'vitest';
import { creatorAlerts, localMinutes } from '../creatorAlerts';

const TZ = 'Asia/Kolkata';
// a wall-clock time in India (+05:30) as epoch ms
const ist = (d: number, mo: number, h: number, mi: number) => Date.UTC(2026, mo - 1, d, h, mi) - 330 * 60_000;
const run = (meetings: any[], actions: any[], at: number) =>
  creatorAlerts(meetings, actions, { now: at, timeZone: TZ, appUrl: 'http://app.test/' });

const after = (list: { key: string }[]) => list.filter((a) => a.key.startsWith('after:'));

const PA = 'pa@office.gov.in';
const m = (id: string, f: Record<string, any>) => ({
  id, owner_email: PA, status: 'Scheduled', meeting_time: '10:00', duration: 30,
  officer_name: `Officer ${id}`, agenda: `Agenda ${id}`, ...f,
});

describe('localMinutes', () => {
  it('reads the wall clock in the app time zone', () => {
    expect(localMinutes(ist(14, 10, 9, 5), TZ) % 1440).toBe(9 * 60 + 5);
  });
});

describe('creatorAlerts', () => {
  it('asks the creator "how did it go?" from 30 minutes after a meeting that is still Scheduled', () => {
    const data = [
      m('a', { meeting_date: '2026-10-14 00:00:00.000Z' }),                       // ended 10:30
      m('b', { meeting_date: '2026-10-14 00:00:00.000Z', status: 'Completed' }),  // already updated
      m('c', { meeting_date: '2026-10-14 00:00:00.000Z', owner_email: '' }),     // nobody to tell
    ];
    expect(after(run(data, [], ist(14, 10, 10, 59)))).toHaveLength(0);
    const [mail, ...rest] = after(run(data, [], ist(14, 10, 11, 1))) as ReturnType<typeof run>;
    expect(rest).toHaveLength(0);
    expect(mail).toMatchObject({ key: 'after:a:2026-10-14:600', to: PA, subject: 'How did it go? Agenda a' });
    expect(mail.html).toContain('http://app.test/meetings?open=a');
    expect(after(run(data, [], ist(14, 10, 17, 0)))).toHaveLength(0); // too late to ask
  });

  it('sends one morning digest per creator with follow-ups, action items and missing statuses', () => {
    const boss = 'boss@office.gov.in';
    const meetings = [
      m('due', { meeting_date: '2026-10-01', status: 'Completed', follow_up_date: '2026-10-14', follow_up_notes: 'Send the file' }),
      m('late', { meeting_date: '2026-09-20', status: 'Completed', follow_up_date: '2026-10-10', officer_name: 'Late person' }),
      // follow-up already handled: a later meeting with the same person exists
      m('old', { meeting_date: '2026-09-01', status: 'Completed', follow_up_date: '2026-10-12', officer_name: 'Met again' }),
      m('again', { meeting_date: '2026-10-20', officer_name: 'Met again' }),
      m('nostatus', { meeting_date: '2026-10-13' }),
      m('cancelled', { meeting_date: '2026-10-01', status: 'Cancelled', follow_up_date: '2026-10-14' }),
      m('boss', { meeting_date: '2026-10-02', status: 'Completed', follow_up_date: '2026-10-14', owner_email: boss }),
    ];
    const actions = [
      { id: 'x1', meeting: 'due', title: 'Share the report', owner: 'Ravi', due_date: '2026-10-13 00:00:00.000Z', done: false },
      { id: 'x2', meeting: 'due', title: 'Done already', due_date: '2026-10-13', done: true },
    ];
    expect(run(meetings, actions, ist(14, 10, 8, 55)).filter((a) => a.key.startsWith('digest'))).toHaveLength(0);
    const mails = run(meetings, actions, ist(14, 10, 9, 2)).filter((a) => a.key.startsWith('digest'));
    expect(mails.map((x) => x.to).sort()).toEqual([boss, PA]);
    const mine = mails.find((x) => x.to === PA)!;
    expect(mine.key).toBe(`digest:${PA}:2026-10-14`);
    expect(mine.subject).toBe("Today's follow-ups: 4 items");
    expect(mine.html).toContain('Due today · Send the file');
    expect(mine.html).toContain('Overdue since Sat, 10 Oct 2026');
    expect(mine.html).toContain('Share the report · Ravi · overdue since');
    expect(mine.html).toContain('Agenda nostatus');
    expect(mine.html).not.toContain('Met again');
    expect(mine.html).not.toContain('Done already');
    expect(mine.html).not.toContain('Agenda cancelled');
  });
});
