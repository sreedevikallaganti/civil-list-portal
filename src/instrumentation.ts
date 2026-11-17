// instrumentation.ts — runs once when the Next.js server starts.
// Starts the follow-up emails for meeting creators (lib/alertsRunner) and the automatic emails to
// participants and officers (lib/participantMailRunner) on the Node.js server.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCreatorAlerts } = await import('./lib/alertsRunner');
    startCreatorAlerts();
    // reminders, confirmations, birthday / work-anniversary greetings (lib/participantMailRunner)
    const { startParticipantMails } = await import('./lib/participantMailRunner');
    startParticipantMails();
  }
}
