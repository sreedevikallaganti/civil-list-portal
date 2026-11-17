// app/api/occasion-email/route.ts — sends one occasion greeting (birthday, work anniversary,
// retirement, new posting, national day, special event) as a designed email, from the chosen
// sender ("Tejaswi from Brihaspathi Technologies" / "… on behalf of Rajasekhar Papolu").
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mailerFor } from '@/lib/mailer';
import { occasionEmail, type OccasionEmailKind } from '@/lib/emailTemplates';

export const runtime = 'nodejs';

const KINDS: OccasionEmailKind[] = ['birthday', 'service', 'retirement', 'posting', 'national', 'event'];
const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
const short = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;

  try {
    const { kind, to, name, years, title, role, notes, sender, onBehalf, fromName } = await req.json();
    const email = String(to || '').trim().toLowerCase();
    if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown occasion.' }, { status: 400 });
    if (!isEmail(email)) return NextResponse.json({ error: 'This person has no valid email address.' }, { status: 400 });

    const mailer = mailerFor(sender, user.email, { onBehalf, fromName });
    if (!mailer) {
      console.error('[occasion-email] no mail account — SMTP_USER / SMTP_PASS missing in .env.local');
      return NextResponse.json({ error: 'Emails aren’t set up yet — please ask your administrator.' }, { status: 500 });
    }

    const recipientName = short(name, 120);
    const mail = occasionEmail({
      kind, recipientName, years: Number(years) || undefined,
      title: short(title, 120), role: short(role, 160), notes: short(notes, 300), sendAs: mailer.sendAs,
    });
    await mailer.transporter.sendMail({
      from: mailer.from,
      ...(mailer.replyTo && { replyTo: mailer.replyTo }),
      to: recipientName ? { name: recipientName.replace(/"/g, ''), address: email } : email,
      subject: short(mail.subject, 200),
      html: mail.html,
      text: mail.text,
    });
    return NextResponse.json({ ok: true, from: mailer.fromName });
  } catch (err) {
    console.error('[occasion-email] failed:', err);
    return NextResponse.json({ error: 'The email couldn’t be sent — please try again later.' }, { status: 500 });
  }
}
