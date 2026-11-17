// app/api/alerts/route.ts — admin-only: check the creator follow-up emails (lib/alertsRunner) by hand.
//   POST {}                → what would go out right now (nothing is sent)
//   POST { send: true }    → send those now (each email still goes out only once)
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { runCreatorAlerts } from '@/lib/alertsRunner';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'admin');
  if (user instanceof NextResponse) return user;
  const { send = false } = await req.json().catch(() => ({}));
  try {
    const r = await runCreatorAlerts({ dryRun: !send });
    return NextResponse.json({
      configured: r.configured,
      due: r.due.map(({ key, to, subject }) => ({ key, to, subject })),
      sent: r.sent,
      failed: r.failed,
    });
  } catch (err: any) {
    console.error('[alerts] check failed:', err);
    return NextResponse.json({ error: 'Couldn’t check the follow-up reminders right now.' }, { status: 500 });
  }
}
