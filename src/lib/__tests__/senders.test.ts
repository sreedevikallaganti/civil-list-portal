import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarAllAccounts, defaultSender, getSender, listSenders, publicSender, senderForUser } from '../senders';
import { mailerFor } from '../mailer';

afterEach(() => vi.unstubAllEnvs());

const base = () => {
  vi.stubEnv('SMTP_USER', 'main@gmail.com');
  vi.stubEnv('SMTP_PASS', 'main-app-pass');
  vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'main-token');
};

describe('senders', () => {
  it('the main sender is the existing setup', () => {
    base();
    const [main] = listSenders();
    expect(main).toMatchObject({ id: 'main', email: 'main@gmail.com', envRefreshToken: 'main-token' });
    expect(main.smtp?.user).toBe('main@gmail.com');
    expect(listSenders()).toHaveLength(1);
  });

  it('adds numbered senders from the environment', () => {
    base();
    vi.stubEnv('SENDER_2_EMAIL', 'Tejaswi@Brihaspathi.com');
    vi.stubEnv('SENDER_2_LABEL', 'Tejaswi');
    vi.stubEnv('SENDER_2_SMTP_PASS', 'second-pass');
    const s2 = getSender('s2');
    expect(s2).toMatchObject({ id: 's2', email: 'tejaswi@brihaspathi.com', label: 'Tejaswi' });
    expect(s2.smtp).toMatchObject({ user: 'tejaswi@brihaspathi.com', host: 'smtp.gmail.com', port: 465 });
    expect(getSender('nope').id).toBe('main');
    expect(publicSender(s2)).toEqual({ id: 's2', email: 'tejaswi@brihaspathi.com', label: 'Tejaswi', title: '', canEmail: true });
  });

  it('SENDER_DEFAULT picks the account invites come from (by email or id)', () => {
    base();
    vi.stubEnv('SENDER_2_EMAIL', 'tejaswi@brihaspathi.com');
    expect(defaultSender().id).toBe('main');
    vi.stubEnv('SENDER_DEFAULT', 'Tejaswi@Brihaspathi.com');
    expect(defaultSender().id).toBe('s2');
    expect(getSender(undefined).id).toBe('s2'); // no choice → the default sender
    expect(getSender('main').id).toBe('main');
    vi.stubEnv('SENDER_DEFAULT', 's2');
    expect(defaultSender().email).toBe('tejaswi@brihaspathi.com');
    vi.stubEnv('SENDER_DEFAULT', 'nobody@x.com');
    expect(defaultSender().id).toBe('main');
  });

  it('a signed-in user who is a sender sends from their own account; others use the default', () => {
    base();
    vi.stubEnv('SENDER_2_EMAIL', 'tejaswi@brihaspathi.com');
    vi.stubEnv('SENDER_DEFAULT', 'main@gmail.com');
    expect(senderForUser('Tejaswi@Brihaspathi.com').id).toBe('s2');
    expect(senderForUser('someone@else.com').id).toBe('main');
    expect(senderForUser(undefined).id).toBe('main');
    expect(getSender(undefined, 'tejaswi@brihaspathi.com').id).toBe('s2');
    expect(getSender('main', 'tejaswi@brihaspathi.com').id).toBe('main'); // an explicit choice wins
    expect(mailerFor(undefined, 'tejaswi@brihaspathi.com')?.sender.id).toBe('s2');
  });

  it('CALENDAR_ALL_ACCOUNTS is on unless switched off', () => {
    expect(calendarAllAccounts()).toBe(true);
    vi.stubEnv('CALENDAR_ALL_ACCOUNTS', 'false');
    expect(calendarAllAccounts()).toBe(false);
    vi.stubEnv('CALENDAR_ALL_ACCOUNTS', 'true');
    expect(calendarAllAccounts()).toBe(true);
  });

  it('mails from the sender’s own mailbox, or from the main one with Reply-To', () => {
    base();
    vi.stubEnv('SENDER_2_EMAIL', 'tejaswi@brihaspathi.com');
    expect(mailerFor('s2')).toMatchObject({ address: 'main@gmail.com', replyTo: 'tejaswi@brihaspathi.com' });
    vi.stubEnv('SENDER_2_SMTP_PASS', 'second-pass');
    const own = mailerFor('s2')!;
    expect(own.address).toBe('tejaswi@brihaspathi.com');
    expect(own.replyTo).toBeUndefined();
    expect(own.from).toContain('<tejaswi@brihaspathi.com>');
  });
});
