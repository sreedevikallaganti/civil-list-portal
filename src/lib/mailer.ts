// lib/mailer.ts — server-only: an SMTP transport for the sender a meeting is sent from.
//
// Uses that sender's own mailbox when it has an app password (lib/senders). Otherwise the
// email goes out from the main mailbox with Reply-To set to the chosen sender, so answers
// still reach them.
//
// The From name is "Tejaswi from Brihaspathi Technologies" (or "… on behalf of Rajasekhar
// Papolu"), or whatever name was chosen when sending — see lib/emailTemplates.
import nodemailer from 'nodemailer';
import { getSender, listSenders, orgName, principalSender, type Sender } from './senders';
import { cleanFromName, defaultFromName, type SendAs } from './emailTemplates';

export type Mailer = {
  transporter: ReturnType<typeof nodemailer.createTransport>;
  from: string;              // "Name <address>"
  address: string;           // the From address (also the .ics organiser)
  replyTo?: string;
  sender: Sender;
  sendAs: SendAs;            // who signs the email
  fromName: string;          // the display name used in From
};

/** How the person sending chose to appear (all optional). */
export type SendAsOptions = { onBehalf?: unknown; fromName?: unknown };

const transport = (smtp: NonNullable<Sender['smtp']>) =>
  nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465, // 465 = implicit TLS; without this the connection hangs until timeout
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

const signerOf = (s: Sender) => ({ name: s.label, title: s.title, email: s.email, phone: s.phone });

/** Who signs: the sender, and the principal (MD) when sending on their behalf. */
export function sendAsFor(sender: Sender, onBehalf?: unknown): SendAs {
  const principal = principalSender();
  const behalf = onBehalf === true && principal && principal.id !== sender.id ? principal : null;
  return { signer: signerOf(sender), onBehalfOf: behalf ? signerOf(behalf) : null, org: orgName() };
}

/** null when no mailbox at all is configured. */
export function mailerFor(senderId?: unknown, userEmail?: unknown, opts: SendAsOptions = {}): Mailer | null {
  const sender = getSender(senderId, userEmail);
  const sendAs = sendAsFor(sender, opts.onBehalf);
  const chosen = cleanFromName(opts.fromName);
  const fromName = chosen || (sender.id === 'main' && process.env.SMTP_FROM ? '' : defaultFromName(sendAs));
  if (sender.smtp) {
    const from = fromName ? `"${fromName}" <${sender.smtp.user}>` : String(process.env.SMTP_FROM);
    return { transporter: transport(sender.smtp), from, address: sender.smtp.user, sender, sendAs, fromName };
  }
  const main = listSenders()[0];
  if (!main.smtp) return null;
  const name = fromName || defaultFromName(sendAs);
  return {
    transporter: transport(main.smtp),
    from: `"${name}" <${main.smtp.user}>`,
    address: main.smtp.user,
    replyTo: sender.email || undefined,
    sender,
    sendAs,
    fromName: name,
  };
}
