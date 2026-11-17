import { describe, expect, it } from 'vitest';
import { meetingParticipants, parseParticipants, participantsSummary, samePerson, unnamedEmails } from '@/lib/participants';

const meeting = {
  officer_name: 'Ravi Kumar', officer_id: 'o1', officer_type: 'IAS', email: 'ravi@gov.in',
  participants: [
    { id: 'e7', name: 'Anita Rao', type: 'Employee', email: 'anita@btl.com' },
    { id: '', name: 'Walk-in Guest' },
  ],
  attendees: 'anita@btl.com, someone@x.com, RAVI@gov.in',
};

describe('meetingParticipants', () => {
  it('lists the main participant first, then the others, without duplicates', () => {
    expect(meetingParticipants(meeting).map((p) => p.name))
      .toEqual(['Ravi Kumar', 'Anita Rao', 'Walk-in Guest', 'someone@x.com']);
  });

  it('works for older meetings that only have attendee e-mails', () => {
    const old = { officer_name: 'Ravi Kumar', attendees: 'a@x.com,b@x.com' };
    expect(participantsSummary(old)).toMatchObject({ first: { name: 'Ravi Kumar' }, more: 2 });
  });

  it('shows the directory name for people saved as an e-mail only', () => {
    const old = { officer_name: 'Ravi Kumar', attendees: 'a@x.com, b@x.com' };
    expect(unnamedEmails(old)).toEqual(['a@x.com', 'b@x.com']);
    const names = new Map([['a@x.com', 'Anita Rao'], ['b@x.com', '']]);
    expect(meetingParticipants(old, names).map((p) => p.name)).toEqual(['Ravi Kumar', 'Anita Rao', 'b@x.com']);
  });

  it('reads the field when it comes back as JSON text', () => {
    expect(parseParticipants('[{"name":"A"}]')).toHaveLength(1);
    expect(parseParticipants('not json')).toEqual([]);
    expect(parseParticipants(null)).toEqual([]);
  });
});

describe('samePerson', () => {
  it('matches by id, then e-mail, then name', () => {
    expect(samePerson({ id: 'o1', name: 'X' }, { id: 'o1', name: 'Y' })).toBe(true);
    expect(samePerson({ id: 'o1', name: 'X' }, { id: 'o2', name: 'X' })).toBe(false);
    expect(samePerson({ email: 'A@x.com', name: 'A' }, { email: 'a@x.com', name: 'B' })).toBe(true);
    expect(samePerson({ name: 'Walk-in Guest' }, { name: 'walk-in guest ' })).toBe(true);
  });
});
