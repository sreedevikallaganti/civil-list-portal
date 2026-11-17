import { describe, expect, it } from 'vitest';
import { inviteText, waLink, waPhone } from '../meetingShare';

const meeting = {
  agenda: 'Budget review', meeting_date: '2026-10-22 00:00:00.000Z', meeting_time: '11:00', duration: 60,
  location: 'Collectorate', meet_link: 'https://meet.google.com/abc-defg-hij',
};

describe('meetingShare', () => {
  it('writes an invitation with everything needed to join', () => {
    const t = inviteText(meeting, 'Ravi');
    expect(t).toContain('Dear Ravi,');
    expect(t).toContain('Budget review');
    expect(t).toContain('22 October 2026');
    expect(t).toContain('11:00 hrs (60 min)');
    expect(t).toContain('📍 Collectorate');
    expect(t).toContain('Join on Google Meet: https://meet.google.com/abc-defg-hij');
    expect(inviteText({ ...meeting, meet_link: 'https://us05web.zoom.us/j/81234567890' })).toContain('Join on Zoom:');
    expect(inviteText({ agenda: 'x' })).not.toContain('Join on');
  });

  it('makes WhatsApp links — to a number, or let WhatsApp ask whom', () => {
    expect(waPhone('98765 43210')).toBe('919876543210');
    expect(waPhone('+971 50 123 4567')).toBe('971501234567');
    expect(waPhone('12345')).toBe('');
    expect(waLink('hi', '9876543210')).toBe('https://wa.me/919876543210?text=hi');
    expect(waLink('hi there')).toBe('https://wa.me/?text=hi%20there');
  });
});
