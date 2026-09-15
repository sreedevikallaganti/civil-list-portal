import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { to, name, agenda, date, time, location, meetLink } = await req.json();
    if (!to || !agenda) return NextResponse.json({ error: 'to and agenda required' }, { status: 400 });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Meeting Invite: ${agenda}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px">
          <h2 style="color:#4f46e5">📋 ${agenda}</h2>
          <p>Dear ${name || 'Sir/Madam'},</p>
          <p>You are invited to a meeting:</p>
          <ul>
            <li><b>📅 Date:</b> ${date}</li>
            <li><b>🕐 Time:</b> ${time}</li>
            ${location ? `<li><b>📍 Location:</b> ${location}</li>` : ''}
            ${meetLink ? `<li><b>💻 Meet link:</b> <a href="${meetLink}">${meetLink}</a></li>` : ''}
          </ul>
          <p>Kindly confirm your availability.</p>
        </div>`,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Invite email error:', err);
    return NextResponse.json({ error: err?.message || 'Email failed' }, { status: 500 });
  }
}