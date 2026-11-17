import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanFromName, defaultFromName, meetingEmail, meetingMode, occasionEmail, type SendAs } from '../emailTemplates';
import { mailerFor } from '../mailer';

afterEach(() => vi.unstubAllEnvs());

const org = 'Brihaspathi Technologies';
const md = { name: 'Rajasekhar Papolu', title: 'Managing Director', email: 'md@brihaspathi.com' };
const pa = { name: 'Tejaswi', title: 'Personal Assistant to MD', email: 'tejaswi@brihaspathi.com' };
const byMd: SendAs = { signer: md, org };
const byPa: SendAs = { signer: pa, onBehalfOf: md, org };
const base = { recipientName: 'Dr. A. Kumar', agenda: 'Smart city review', date: 'Thu, 12 Nov 2026', time: '11:00 – 11:45 hrs', location: 'Secretariat', link: 'https://meet.google.com/abc', linkLabel: 'Google Meet' };

describe('From name', () => {
  it('"<name> from <company>", or "on behalf of" the MD', () => {
    expect(defaultFromName(byMd)).toBe('Rajasekhar Papolu from Brihaspathi Technologies');
    expect(defaultFromName({ signer: pa, org })).toBe('Tejaswi from Brihaspathi Technologies');
    expect(defaultFromName(byPa)).toBe('Tejaswi on behalf of Rajasekhar Papolu');
  });
  it('a typed name cannot break the From header', () => {
    expect(cleanFromName('Tejaswi "PA" <x@y>\r\nBcc: a@b')).toBe('Tejaswi PA x@y Bcc: a@b');
  });
});

describe('meeting emails', () => {
  it('invitation: details, mode, meeting link, organiser and the person\'s signature', () => {
    const m = meetingEmail('invite', { ...base, sendAs: byPa });
    expect(m.subject).toBe('Meeting Invitation: Smart city review — Thu, 12 Nov 2026');
    expect(m.text).toContain('Dear Dr. A. Kumar,');
    expect(m.text).toContain('We are pleased to invite you to attend Smart city review, scheduled as per the details below.');
    expect(m.text).toContain('- Mode: In-Person & Online');
    expect(m.text).toContain('- Meeting Link: https://meet.google.com/abc');
    expect(m.text).toContain('- Organized By: Rajasekhar Papolu, Managing Director, Brihaspathi Technologies');
    expect(m.text).toContain('Kindly confirm your availability at your convenience.');
    expect(m.text).toMatch(/Warm regards,\nTejaswi, Personal Assistant to MD\nOn behalf of Rajasekhar Papolu, Managing Director\nBrihaspathi Technologies/);
    expect(m.html).toMatch(/<b [^>]*>Smart city review<\/b>/);
    expect(m.html).toContain('Join on Google Meet');
    expect(m.html).not.toContain('Civillist');
  });
  it('a Zoom link is included too', () => {
    const m = meetingEmail('invite', { ...base, location: '', link: 'https://us02web.zoom.us/j/123', linkLabel: 'Zoom', sendAs: byMd });
    expect(m.text).toContain('- Mode: Online');
    expect(m.text).toContain('- Meeting Link: https://us02web.zoom.us/j/123');
    expect(m.html).toContain('Join on Zoom');
  });
  it('confirmation, reminder, rescheduled, cancelled and thank-you', () => {
    const c = meetingEmail('confirmed', { ...base, sendAs: byPa });
    expect(c.text).toContain('Thank you for confirming your availability.');
    expect(c.text).toMatch(/Warm regards,\nBrihaspathi Technologies$/);
    const r = meetingEmail('reminder', { ...base, sendAs: byPa });
    expect(r.text).toContain('This is a gentle reminder regarding your upcoming meeting.');
    expect(r.text).toContain('- Meeting: Smart city review');
    expect(r.text).toMatch(/Best regards,\nBrihaspathi Technologies$/);
    const s = meetingEmail('rescheduled', { ...base, previous: 'Wed, 11 Nov 2026, 10:00 hrs', reason: 'an urgent review.', sendAs: byPa });
    expect(s.text).toContain('has been rescheduled due to an urgent review.');
    expect(s.text).toContain('- Previous Date & Time: Wed, 11 Nov 2026, 10:00 hrs');
    expect(s.text).toContain('- Updated Meeting Link: https://meet.google.com/abc');
    const x = meetingEmail('cancelled', { ...base, sendAs: byPa });
    expect(x.subject).toBe('Meeting Cancelled: Smart city review — Thu, 12 Nov 2026');
    expect(x.text).toContain('scheduled for Thu, 12 Nov 2026 at 11:00 – 11:45 hrs, has been cancelled.');
    expect(x.html).not.toContain('Join on');
    const t = meetingEmail('thanks', { ...base, sendAs: byPa });
    expect(t.text).toContain('Thank you for taking the time to attend Smart city review.');
  });
  it('escapes and drops unsafe links', () => {
    const m = meetingEmail('invite', { agenda: '<b>x</b>', date: 'd', time: 't', link: 'javascript:alert(1)', sendAs: byMd });
    expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(m.html).not.toContain('javascript:');
    expect(m.text).toContain('Dear Sir/Madam,');
  });
  it('mode', () => {
    expect(meetingMode('', 'https://meet.google.com/x')).toBe('Online');
    expect(meetingMode('Online', 'https://zoom.us/j/1')).toBe('Online');
    expect(meetingMode('Office', '')).toBe('In-Person');
  });
});

describe('occasion emails', () => {
  it('birthday and work anniversary use the agreed wording', () => {
    const b = occasionEmail({ kind: 'birthday', recipientName: 'Shri R. Kumar', sendAs: byPa });
    expect(b.text).toContain('Dear Shri R. Kumar,');
    expect(b.text).toContain('Wishing you a wonderful birthday filled with happiness, good health and continued success.');
    expect(b.text).toMatch(/With warm regards,\nBrihaspathi Technologies$/);
    const w = occasionEmail({ kind: 'service', recipientName: 'Shri R. Kumar', years: 25, sendAs: byPa });
    expect(w.subject).toBe('Congratulations on 25 Years of Service');
    expect(w.text).toContain('valuable contributions to public service');
    expect(w.text).toMatch(/With best wishes,\nBrihaspathi Technologies$/);
  });
  it.each(['retirement', 'posting', 'national', 'event'] as const)('%s', (kind) => {
    const m = occasionEmail({ kind, recipientName: 'Sir', title: 'Republic Day', role: 'Collector, Madurai', sendAs: byMd });
    expect(m.subject.length).toBeGreaterThan(5);
    expect(m.text).toContain('Brihaspathi Technologies');
  });
});

describe('mailer From header', () => {
  it('uses the company and the chosen name, never "via Civillist"', () => {
    vi.stubEnv('SMTP_USER', 'main@gmail.com');
    vi.stubEnv('SMTP_PASS', 'x');
    vi.stubEnv('SENDER_2_EMAIL', 'tejaswi@brihaspathi.com');
    vi.stubEnv('SENDER_2_LABEL', 'Tejaswi');
    vi.stubEnv('SENDER_3_EMAIL', 'md@brihaspathi.com');
    vi.stubEnv('SENDER_3_LABEL', 'Rajasekhar Papolu');
    vi.stubEnv('SENDER_PRINCIPAL', 'md@brihaspathi.com');
    vi.stubEnv('ORG_NAME', 'Brihaspathi Technologies');
    expect(mailerFor('s2')!.from).toBe('"Tejaswi from Brihaspathi Technologies" <main@gmail.com>');
    expect(mailerFor('s2')!.replyTo).toBe('tejaswi@brihaspathi.com');
    expect(mailerFor('s2', '', { onBehalf: true })!.from).toBe('"Tejaswi on behalf of Rajasekhar Papolu" <main@gmail.com>');
    expect(mailerFor('s3', '', { onBehalf: true })!.sendAs.onBehalfOf).toBeNull();
    expect(mailerFor('s3')!.from).toBe('"Rajasekhar Papolu from Brihaspathi Technologies" <main@gmail.com>');
    expect(mailerFor('s3', '', { fromName: 'MD Office' })!.from).toBe('"MD Office" <main@gmail.com>');
  });
});
