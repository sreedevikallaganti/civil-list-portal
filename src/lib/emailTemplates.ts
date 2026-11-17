// lib/emailTemplates.ts — every email the app sends, in one place: the sender's display name,
// the signature, the meeting emails and the occasion greetings.
//
//   Meeting emails (meetingEmail):  invite · confirmed · reminder · rescheduled · cancelled · thanks
//   Occasions (occasionEmail):      birthday · service (work anniversary) · retirement · posting ·
//                                   national · event
//
// Pure functions — safe in the browser (previews, WhatsApp text) and on the server (emails).
// Each returns { subject, html, text }: `html` for the email, `text` for WhatsApp / copy-paste /
// the plain-text part of the email. Meet / Zoom links go into every meeting email that has one.

/** Who signs an email. */
export type Signer = { name: string; title?: string; email?: string; phone?: string };

/** How an email goes out: the person sending it, optionally on behalf of someone (the MD). */
export type SendAs = {
  signer: Signer;
  onBehalfOf?: Signer | null;
  org: string;          // "Brihaspathi Technologies"
};

/* ── small helpers ── */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
const safeHref = (v: unknown) => (/^https?:\/\//i.test(String(v ?? '').trim()) ? String(v).trim() : '');
const nameAndTitle = (s: Signer) => (s.title ? `${s.name}, ${s.title}` : s.name);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ── the From name ── */

/** "Tejaswi from Brihaspathi Technologies" / "Tejaswi on behalf of Rajasekhar Papolu". */
export function defaultFromName(sendAs: SendAs): string {
  return sendAs.onBehalfOf
    ? `${sendAs.signer.name} on behalf of ${sendAs.onBehalfOf.name}`
    : `${sendAs.signer.name} from ${sendAs.org}`;
}

/** A display name that is safe in a From header (no quotes, angle brackets or line breaks). */
export function cleanFromName(v: unknown): string {
  return oneLine(v).replace(/["<>\\]/g, '').replace(/\s+/g, ' ').slice(0, 80).trim();
}

/* ── signatures ──
   The invitation is signed by the person (organiser, organisation, contact);
   everything else is signed by the organisation, e.g. "Warm regards, / Brihaspathi Technologies". */

type Signature = { text: string; html: string };

/* design tokens — one neutral palette, one accent per email type */
const INK = '#111827';       // headings, values
const BODY = '#374151';      // paragraphs
const MUTED = '#6b7280';     // labels, secondary text
const FAINT = '#9ca3af';     // footer
const LINE = '#e5e7eb';      // borders
const ROW_LINE = '#f0f1f4';  // dividers inside tables
const BRAND = '#1e1b4b';     // the company monogram
const LINK = '#4338ca';
const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const initials = (s: string) => s.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '•';

function personSignature(sendAs: SendAs, closing = 'Warm regards,'): Signature {
  const { signer, onBehalfOf, org } = sendAs;
  const contact = [signer.phone, signer.email].filter(Boolean);
  const text = [closing, nameAndTitle(signer), onBehalfOf && `On behalf of ${nameAndTitle(onBehalfOf)}`, org, contact.join(' · ')]
    .filter(Boolean).join('\n');
  const contactHtml = [signer.phone && esc(signer.phone), signer.email && `<a href="mailto:${esc(signer.email)}" style="color:${LINK};text-decoration:none">${esc(signer.email)}</a>`]
    .filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  const html = `
    <p style="margin:28px 0 0;color:${BODY}">${esc(closing)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid ${LINE}">
      <tr><td style="padding-top:16px">
        <p style="margin:0;font-size:15px;font-weight:600;color:${INK}">${esc(signer.name)}</p>
        ${signer.title ? `<p style="margin:2px 0 0;font-size:13px;color:${MUTED}">${esc(signer.title)}</p>` : ''}
        ${onBehalfOf ? `<p style="margin:6px 0 0;font-size:13px;color:${MUTED}">On behalf of <span style="color:${INK};font-weight:600">${esc(onBehalfOf.name)}</span>${onBehalfOf.title ? `, ${esc(onBehalfOf.title)}` : ''}</p>` : ''}
        <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:${INK}">${esc(org)}</p>
        ${contactHtml ? `<p style="margin:4px 0 0;font-size:13px;color:${MUTED}">${contactHtml}</p>` : ''}
      </td></tr>
    </table>`;
  return { text, html };
}

function orgSignature(org: string, closing = 'Warm regards,'): Signature {
  return {
    text: `${closing}\n${org}`,
    html: `<p style="margin:28px 0 2px;color:${BODY}">${esc(closing)}</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:${INK}">${esc(org)}</p>`,
  };
}

/** Kept for screens that show "who signs" (the invitation signature). */
export const signatureText = (sendAs: SendAs) => personSignature(sendAs).text;
export const signatureHtml = (sendAs: SendAs) => personSignature(sendAs).html;

/* ── the shared layout ──
   A white card with a thin accent line on top, the company mark, a small label for the email
   type, the title, the body and the signature. Table-based with inline styles, so it looks the
   same in Gmail, Outlook and phone mail apps. */

type Accent = { solid: string; to?: string };

function layout({ preheader, accent, badge, heading, subline, tile, body, signature, org, footer, serif }: {
  preheader: string; accent: Accent; badge: string; heading: string; subline?: string; tile?: string;
  body: string; signature: string; org: string; footer: string; serif?: boolean;
}): string {
  const title = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${accent.solid}">${esc(badge)}</p>
    <h1 style="margin:0;font-family:${serif ? SERIF : FONT};font-size:${serif ? 28 : 22}px;line-height:1.3;font-weight:${serif ? 400 : 600};color:${INK}">${esc(heading)}</h1>
    ${subline ? `<p style="margin:6px 0 0;font-size:14px;color:${MUTED}">${subline}</p>` : ''}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f5f7" style="background:#f4f5f7;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT}">
      <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-top:4px solid ${accent.solid};border-radius:10px;font-size:15px;line-height:1.7;color:${BODY}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <!-- company -->
          <tr><td style="padding:24px 36px 20px;border-bottom:1px solid ${ROW_LINE}">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="30" height="30" bgcolor="${BRAND}" style="width:30px;height:30px;background:${BRAND};border-radius:6px;color:#ffffff;font-size:12px;font-weight:700;text-align:center;vertical-align:middle;letter-spacing:.5px">${esc(initials(org))}</td>
              <td style="padding-left:10px;font-size:14px;font-weight:600;color:${INK};vertical-align:middle">${esc(org)}</td>
            </tr></table>
          </td></tr>
          <!-- title -->
          <tr><td style="padding:30px 36px 6px">
            ${tile ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="top" width="72" style="padding-right:18px">${tile}</td>
              <td valign="middle">${title}</td>
            </tr></table>` : title}
          </td></tr>
          <!-- message -->
          <tr><td style="padding:22px 36px 36px">
            ${body}
            ${signature}
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 24px 0;font-size:12px;line-height:1.6;color:${FAINT}">
        ${esc(footer)}<br>This is an official communication from ${esc(org)}.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** A paragraph; **bold** parts are kept bold. */
const para = (text: string) =>
  `<p style="margin:0 0 16px">${esc(text).replace(/\*\*(.+?)\*\*/g, `<b style="color:${INK};font-weight:600">$1</b>`)}</p>`;
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1');

/** A calendar-page date block (month in the accent colour, big day, weekday); '' when unreadable. */
function dateTile(date: string, color: string, struck = false) {
  const m = /^(\w{3}),?\s+(\d{1,2})\s+(\w{3})/.exec(date.trim());
  if (!m) return '';
  const [, weekday, day, month] = m;
  return `<table role="presentation" width="64" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;text-align:center">
    <tr><td style="padding:7px 0 0;font-size:11px;font-weight:700;letter-spacing:1.2px;color:${color}">${esc(month.toUpperCase())}</td></tr>
    <tr><td style="font-size:26px;line-height:1.15;font-weight:600;color:${struck ? FAINT : INK};${struck ? 'text-decoration:line-through;' : ''}">${esc(day)}</td></tr>
    <tr><td style="padding:0 0 7px;font-size:11px;color:${MUTED}">${esc(weekday)}</td></tr>
  </table>`;
}

/** The details table: a small heading, then label / value rows with thin dividers. */
function detailsTable(heading: string, rows: [string, string][], link: string, opts: { strikeAll?: boolean } = {}) {
  const row = ([k, v]: [string, string], i: number) => {
    const struck = opts.strikeAll || k.startsWith('Previous');
    const value = k.endsWith('Link') && link
      ? `<a href="${esc(link)}" style="color:${LINK};text-decoration:none;word-break:break-all">${esc(v)}</a>`
      : esc(v);
    const top = i ? `border-top:1px solid ${ROW_LINE};` : '';
    return `<tr>
      <td valign="top" width="150" style="${top}padding:11px 16px;font-size:13px;color:${MUTED}">${esc(k)}</td>
      <td valign="top" style="${top}padding:11px 16px;font-size:14px;font-weight:500;color:${struck ? FAINT : INK};${struck ? 'text-decoration:line-through;' : ''}">${value}</td>
    </tr>`;
  };
  return `
    <p style="margin:8px 0 10px;font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED}">${esc(heading)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${LINE};border-radius:8px;border-collapse:separate">
      ${rows.map(row).join('')}
    </table>`;
}

/** One solid button (a table cell, so Outlook draws it too) and the plain link under it. */
const joinButton = (link: string, label: string) => link
  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>
      <td bgcolor="${LINK}" style="background:${LINK};border-radius:6px">
        <a href="${esc(link)}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:.2px">Join on ${esc(label)}</a>
      </td></tr></table>
    <p style="margin:0 0 26px;font-size:12px;color:${MUTED}">Or open this link: <a href="${esc(link)}" style="color:${LINK};text-decoration:none;word-break:break-all">${esc(link)}</a></p>`
  : '';

/* ── meeting emails ── */

export type MeetingEmailKind = 'invite' | 'confirmed' | 'reminder' | 'rescheduled' | 'cancelled' | 'thanks';

export type MeetingEmailInput = {
  recipientName?: string;
  agenda: string;          // the meeting title
  date: string;            // already formatted, e.g. "Thu, 12 Nov 2026"
  time: string;            // e.g. "11:00 – 11:45 hrs"
  location?: string;       // venue ('' for an online-only meeting)
  link?: string;           // Google Meet / Zoom link
  linkLabel?: string;      // "Google Meet", "Zoom"
  description?: string;    // purpose / notes (invitation)
  previous?: string;       // rescheduled: the old date & time
  reason?: string;         // rescheduled: why (optional)
  sendAs: SendAs;
};

const MEETING_STYLE: Record<MeetingEmailKind, { badge: string; accent: Accent }> = {
  invite: { badge: 'Meeting invitation', accent: { solid: '#4338ca' } },
  confirmed: { badge: 'Meeting confirmed', accent: { solid: '#047857' } },
  reminder: { badge: 'Meeting reminder', accent: { solid: '#0369a1' } },
  rescheduled: { badge: 'Meeting rescheduled', accent: { solid: '#b45309' } },
  cancelled: { badge: 'Meeting cancelled', accent: { solid: '#b91c1c' } },
  thanks: { badge: 'Thank you', accent: { solid: '#4338ca' } },
};

/** Online / In-Person — from the venue and the call link. */
export function meetingMode(location: unknown, link: unknown): string {
  const venue = String(location ?? '').trim();
  const online = !!safeHref(link);
  const onlineOnly = !venue || /^(online|virtual|google meet|zoom|video call)$/i.test(venue);
  if (online && !onlineOnly) return 'In-Person & Online';
  return online ? 'Online' : 'In-Person';
}

export function meetingEmail(kind: MeetingEmailKind, m: MeetingEmailInput) {
  const { sendAs } = m;
  const org = sendAs.org;
  const title = oneLine(m.agenda) || 'Meeting';
  const link = safeHref(m.link);
  const label = m.linkLabel || 'video call';
  const venue = oneLine(m.location) || (link ? `Online (${label})` : '—');
  const mode = meetingMode(m.location, link);
  const organiser = sendAs.onBehalfOf ?? sendAs.signer;
  const linkRow: [string, string][] = link ? [['Meeting Link', link]] : [];
  const dear = `Dear ${oneLine(m.recipientName) || 'Sir/Madam'},`;

  let subject = '';
  let lines: string[] = [];
  let details: { heading: string; rows: [string, string][] } | null = null;
  let after: string[] = [];
  let signature = orgSignature(org);

  switch (kind) {
    case 'invite':
      subject = `Meeting Invitation: ${title} — ${m.date}`;
      lines = [dear, 'Greetings!', `We are pleased to invite you to attend **${title}**, scheduled as per the details below.`];
      details = {
        heading: 'Meeting Details',
        rows: [['Date', m.date], ['Time', m.time], ['Venue', venue], ['Mode', mode], ...linkRow,
          ['Organized By', `${nameAndTitle(organiser)}, ${org}`]],
      };
      after = [
        ...(m.description ? [oneLine(m.description)] : []),
        'We would be delighted to have your presence and participation in this meeting.',
        'Kindly confirm your availability at your convenience.',
        'We look forward to your participation.',
      ];
      signature = personSignature(sendAs);
      break;
    case 'confirmed':
      subject = `Meeting Confirmed: ${title} — ${m.date}`;
      lines = [dear, 'Greetings!', 'Thank you for confirming your availability.', `We are pleased to confirm your participation in **${title}**.`];
      details = { heading: 'Meeting Details', rows: [['Date', m.date], ['Time', m.time], ['Venue', venue], ...linkRow] };
      after = ['We look forward to a productive and meaningful interaction.', 'Thank you for your time and participation.'];
      break;
    case 'reminder':
      subject = `Reminder: ${title} — ${m.date}, ${m.time}`;
      lines = [dear, 'This is a gentle reminder regarding your upcoming meeting.'];
      details = { heading: 'Meeting Details', rows: [['Meeting', title], ['Date', m.date], ['Time', m.time], ['Venue', venue], ['Mode', mode], ...linkRow] };
      after = ['We kindly request you to make the necessary arrangements to attend the meeting on time.', 'We look forward to your presence.'];
      signature = orgSignature(org, 'Best regards,');
      break;
    case 'rescheduled': {
      const reason = oneLine(m.reason);
      subject = `Meeting Rescheduled: ${title} — now ${m.date}, ${m.time}`;
      lines = [dear, 'Greetings!',
        `Please be informed that the meeting **${title}** has been rescheduled${reason ? ` due to ${reason.replace(/[.\s]+$/, '')}` : ''}.`,
        'Please find the updated meeting details below:'];
      details = {
        heading: 'Revised Meeting Details',
        rows: [...(m.previous ? [['Previous Date & Time', m.previous] as [string, string]] : []),
          ['New Date', m.date], ['New Time', m.time], ['Venue', venue], ...(link ? [['Updated Meeting Link', link] as [string, string]] : [])],
      };
      after = ['We regret any inconvenience caused and appreciate your understanding.', 'We look forward to your participation.'];
      break;
    }
    case 'cancelled':
      subject = `Meeting Cancelled: ${title} — ${m.date}`;
      lines = [dear, 'Greetings!',
        `We regret to inform you that the meeting **${title}**, scheduled for ${m.date} at ${m.time}, has been cancelled.`,
        'We sincerely apologize for any inconvenience this may cause.',
        'Should the meeting be rescheduled, the updated details will be communicated to you accordingly.',
        'Thank you for your understanding.'];
      break;
    case 'thanks':
      subject = `Thank you for attending ${title}`;
      lines = [dear, 'Greetings!',
        `Thank you for taking the time to attend **${title}**.`,
        'We sincerely appreciate your valuable time, insights and contributions to the discussion.',
        'Your participation made the interaction meaningful and productive.',
        'We look forward to staying connected and engaging with you in future interactions.'];
      break;
  }

  const showLink = link && kind !== 'cancelled' && kind !== 'thanks';
  const style = MEETING_STYLE[kind];
  const html = layout({
    preheader: plain(lines[2] || lines[1] || title),
    accent: style.accent,
    badge: style.badge,
    heading: title,
    subline: kind === 'thanks' ? '' : `${esc(m.date)}&nbsp;&nbsp;·&nbsp;&nbsp;${esc(m.time)}`,
    tile: kind === 'thanks' ? '' : dateTile(m.date, style.accent.solid, kind === 'cancelled'),
    signature: signature.html,
    org,
    footer: `Sent by ${org}${sendAs.onBehalfOf ? ` on behalf of ${sendAs.onBehalfOf.name}` : ''}.`,
    body: [
      lines.map(para).join(''),
      details ? detailsTable(details.heading, details.rows, link)
        // a cancelled meeting: the slot, struck through, so it's clear which meeting is off
        : kind === 'cancelled' ? detailsTable('Cancelled meeting', [['Meeting', title], ['Date', m.date], ['Time', m.time]], '', { strikeAll: true }) : '',
      showLink ? joinButton(link, label) : '',
      after.map(para).join(''),
    ].join(''),
  });

  const text = [
    ...lines.map(plain).flatMap((l) => [l, '']),
    ...(details ? [details.heading, ...details.rows.map(([k, v]) => `- ${k}: ${v}`), ''] : []),
    ...after.flatMap((l) => [l, '']),
    signature.text,
  ].join('\n');

  return { subject: oneLine(subject), html, text };
}

/* ── occasion greetings ── */

export type OccasionEmailKind = 'birthday' | 'service' | 'retirement' | 'posting' | 'national' | 'event';

export type OccasionEmailInput = {
  kind: OccasionEmailKind;
  recipientName?: string;
  years?: number;        // years of service (work anniversary)
  title?: string;        // national day / special event name
  role?: string;         // new posting ("Collector, Madurai")
  notes?: string;        // special event notes
  sendAs: SendAs;
};

const OCCASION_STYLE: Record<OccasionEmailKind, { badge: string; accent: Accent }> = {
  birthday: { badge: 'Birthday greetings', accent: { solid: '#be185d' } },
  service: { badge: 'Work anniversary', accent: { solid: '#b45309' } },
  retirement: { badge: 'With gratitude', accent: { solid: '#475569' } },
  posting: { badge: 'Congratulations', accent: { solid: '#047857' } },
  national: { badge: 'Greetings', accent: { solid: '#c2410c' } },
  event: { badge: 'Greetings', accent: { solid: '#4338ca' } },
};

/** The message (after "Dear …,") and how it is signed. */
function occasionMessage(o: OccasionEmailInput): { subject: string; heading: string; lines: string[]; closing: string } {
  switch (o.kind) {
    case 'birthday':
      return {
        subject: 'Warm Birthday Wishes',
        heading: 'Happy Birthday!',
        closing: 'With warm regards,',
        lines: [
          'Warm greetings on your birthday!',
          'Wishing you a wonderful birthday filled with happiness, good health and continued success.',
          'May the year ahead bring you new opportunities, personal fulfilment and many more accomplishments.',
          'We sincerely appreciate your contributions and wish you a fantastic year ahead.',
        ],
      };
    case 'service':
      return {
        subject: o.years ? `Congratulations on ${plural(o.years, 'Year')} of Service` : 'Congratulations on Your Work Anniversary',
        heading: o.years ? `${plural(o.years, 'Year')} of Service` : 'Happy Work Anniversary',
        closing: 'With best wishes,',
        lines: [
          'Warm greetings!',
          o.years ? `Congratulations on your work anniversary — ${plural(o.years, 'year')} of service!` : 'Congratulations on your work anniversary!',
          'This occasion marks another milestone in your professional journey and reflects your dedication, commitment and valuable contributions to public service.',
          'We extend our sincere appreciation for your service and wish you continued success and many more milestones in the years ahead.',
        ],
      };
    case 'retirement':
      return {
        subject: 'Best Wishes on Your Retirement',
        heading: 'Best Wishes on Your Retirement',
        closing: 'With warm regards,',
        lines: [
          'Warm greetings!',
          'As you retire on superannuation, we extend our sincere gratitude for your outstanding service to the nation.',
          'Your dedication and leadership have left a lasting mark, and it has been a privilege to work with you.',
          'We wish you good health, happiness and a fulfilling life ahead, and hope to stay connected.',
        ],
      };
    case 'posting':
      return {
        subject: o.role ? `Congratulations on Your New Assignment as ${oneLine(o.role)}` : 'Congratulations on Your New Assignment',
        heading: 'Congratulations on Your New Assignment',
        closing: 'With best wishes,',
        lines: [
          'Warm greetings!',
          `Congratulations on your new assignment${o.role ? ` as **${oneLine(o.role)}**` : ''}.`,
          'We wish you every success in this role and look forward to continuing our association.',
        ],
      };
    case 'national':
    case 'event': {
      const t = oneLine(o.title) || 'this special day';
      return {
        subject: `Warm Greetings on ${t}`,
        heading: t,
        closing: 'Warm regards,',
        lines: [`Warm greetings on the occasion of **${t}**!`, ...(o.notes ? [oneLine(o.notes)] : []),
          'Wishing you and your family joy, peace and prosperity.'],
      };
    }
  }
}

export function occasionEmail(o: OccasionEmailInput) {
  const { subject, heading, lines, closing } = occasionMessage(o);
  const dear = `Dear ${oneLine(o.recipientName) || 'Sir/Madam'},`;
  const style = OCCASION_STYLE[o.kind];
  const signature = orgSignature(o.sendAs.org, closing);
  const [first, ...rest] = lines;
  const html = layout({
    preheader: plain(lines[1] || lines[0]), accent: style.accent, badge: style.badge, heading, serif: true,
    signature: signature.html,
    org: o.sendAs.org,
    footer: `Sent by ${o.sendAs.org}${o.sendAs.onBehalfOf ? ` on behalf of ${o.sendAs.onBehalfOf.name}` : ''}.`,
    body: [
      para(dear),
      // the opening line, a little larger
      `<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#111827">${esc(plain(first))}</p>`,
      rest.map(para).join(''),
    ].join(''),
  });
  const text = [dear, '', ...lines.map(plain).flatMap((l) => [l, '']), signature.text].join('\n');
  return { subject, html, text };
}
