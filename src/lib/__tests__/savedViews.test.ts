import { describe, expect, it } from 'vitest';
import { matchesWhen } from '@/components/meetings/SavedViews';

const now = new Date(2026, 9, 7, 12, 0); // Wed 7 Oct 2026 — week is Mon 5 … Sun 11 Oct
const m = (fields: Record<string, string>) => ({ id: 'x', ...fields });

describe('matchesWhen (saved views)', () => {
  it('today / this week / past', () => {
    expect(matchesWhen(m({ meeting_date: '2026-10-07' }), 'today', now)).toBe(true);
    expect(matchesWhen(m({ meeting_date: '2026-10-05' }), 'week', now)).toBe(true);
    expect(matchesWhen(m({ meeting_date: '2026-10-11' }), 'week', now)).toBe(true);
    expect(matchesWhen(m({ meeting_date: '2026-10-12' }), 'week', now)).toBe(false);
    expect(matchesWhen(m({ meeting_date: '2026-10-06' }), 'past', now)).toBe(true);
  });

  it('upcoming leaves out completed and cancelled meetings', () => {
    expect(matchesWhen(m({ meeting_date: '2026-10-09', status: 'Scheduled' }), 'upcoming', now)).toBe(true);
    expect(matchesWhen(m({ meeting_date: '2026-10-09', status: 'Cancelled' }), 'upcoming', now)).toBe(false);
  });

  it('needs a status = past and still Scheduled', () => {
    expect(matchesWhen(m({ meeting_date: '2026-10-01', status: 'Scheduled' }), 'needs-status', now)).toBe(true);
    expect(matchesWhen(m({ meeting_date: '2026-10-01', status: 'Completed' }), 'needs-status', now)).toBe(false);
    expect(matchesWhen(m({ meeting_date: '2026-10-09', status: 'Scheduled' }), 'needs-status', now)).toBe(false);
  });

  it('follow-ups due = overdue or within 7 days, not cancelled', () => {
    expect(matchesWhen(m({ follow_up_date: '2026-10-01' }), 'followups', now)).toBe(true);
    expect(matchesWhen(m({ follow_up_date: '2026-10-14' }), 'followups', now)).toBe(true);
    expect(matchesWhen(m({ follow_up_date: '2026-10-20' }), 'followups', now)).toBe(false);
    expect(matchesWhen(m({ follow_up_date: '2026-10-01', status: 'Cancelled' }), 'followups', now)).toBe(false);
  });

  it('no minutes yet = completed without minutes', () => {
    expect(matchesWhen(m({ status: 'Completed' }), 'no-minutes', now)).toBe(true);
    expect(matchesWhen(m({ status: 'Completed', minutes: 'Agreed on X' }), 'no-minutes', now)).toBe(false);
  });
});
