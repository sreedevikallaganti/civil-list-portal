'use client';

// lib/meetingStatusSync.ts — after a meeting's status is changed (Update panels on the Meetings,
// Calendar and Dashboard pages), bring everything else in line, in this order:
//
//   Rescheduled → move the Zoom meeting → move the Google Calendar event → email the participants
//                 the "rescheduled" notice (it carries the final link and the old slot)
//   Cancelled   → remove the Google event + Zoom meeting → email the cancellation
//   Completed   → email the thank-you
//
// Runs in the background after the save; reports problems with one toast, details in the console.
import { apiJSON, moveZoomMeeting, removeCalendarAndVideo } from './apiClient';
import { emailParticipants, shouldEmailParticipants, type ParticipantEmailKind } from './participantEmails';
import { videoPlatform } from './videoCall';

type Toast = (msg: string, type: 'success' | 'error') => void;
export type StatusChange =
  | { status: 'rescheduled'; date: string; time: string; duration: number }
  | { status: 'cancelled' }
  | { status: 'completed' };

const clock = (t: unknown) => String(t ?? '').match(/\d{1,2}:\d{2}/)?.[0] || '';

/** `meeting` is the record as it was before the change (old date / time / link). */
export async function syncStatusChange(meeting: any, change: StatusChange, toast: Toast) {
  const was = String(meeting?.status_flag || meeting?.status || '').toLowerCase();
  const problems: string[] = [];
  let mail: { kind: ParticipantEmailKind; meeting: any; previous?: { date: string; time: string } } | null = null;

  if (change.status === 'rescheduled') {
    const oldDate = String(meeting.meeting_date || '').slice(0, 10);
    const oldTime = clock(meeting.meeting_time);
    if (oldDate === change.date && oldTime === clock(change.time) && Number(meeting.duration) === change.duration) return;
    let link = String(meeting.meet_link || '');

    // 1) Zoom first — it may hand out a new link
    try {
      link = (await moveZoomMeeting(meeting, change)) ?? link;
    } catch (e) {
      console.warn('[reschedule] Zoom update failed:', e);
      problems.push('the Zoom meeting couldn’t be moved');
    }

    // 2) the Google Calendar event (Google's own email stays off — the app emails below)
    if (meeting.gcal_event_id) {
      const zoomLink = videoPlatform(link) === 'zoom' ? link : '';
      try {
        await apiJSON('/api/google', {
          meetingId: meeting.id, agenda: meeting.agenda, date: change.date, time: clock(change.time),
          duration: change.duration, location: meeting.location, officerName: meeting.officer_name,
          gcalEventId: meeting.gcal_event_id, existingMeetLink: zoomLink ? '' : link, videoLink: zoomLink,
          syncCalendar: true, includeMeet: false, sendInvite: false, sender: meeting.sender,
        }, { timeoutMs: 60_000 });
      } catch (e: any) {
        console.warn('[reschedule] Google Calendar update failed:', e);
        problems.push(e?.needsReconnect ? 'Google Calendar needs to be reconnected' : 'the Google Calendar event couldn’t be moved');
      }
    }

    mail = {
      kind: 'rescheduled',
      meeting: { ...meeting, meeting_date: change.date, meeting_time: clock(change.time), duration: change.duration, meet_link: link, status: 'Rescheduled' },
      previous: { date: oldDate, time: oldTime },
    };
  } else if (change.status === 'cancelled') {
    if (was.startsWith('cancel')) return;
    const emailing = shouldEmailParticipants('cancelled', meeting);
    // Google's plain cancellation notice only when the app doesn't send its own email
    await removeCalendarAndVideo(meeting, { notify: !emailing }).catch((e) => {
      console.warn('[cancel] removing the calendar event / Zoom meeting failed:', e);
      problems.push('the calendar event couldn’t be removed');
    });
    mail = { kind: 'cancelled', meeting };
  } else {
    if (was.startsWith('complet')) return;
    mail = { kind: 'thanks', meeting };
  }

  // 3) the participants' email
  let emailed = 0;
  if (mail && shouldEmailParticipants(mail.kind, mail.meeting)) {
    try {
      emailed = await emailParticipants(mail.kind, mail.meeting, mail.previous);
    } catch (e: any) {
      console.warn(`[status-sync] ${mail.kind} email failed:`, e);
      problems.push('the email to the participants couldn’t be sent');
    }
  }

  const what = change.status === 'rescheduled' ? 'Rescheduled' : change.status === 'cancelled' ? 'Cancelled' : 'Completed';
  if (problems.length) {
    toast(`${what} — but ${problems.join(', and ')}. Please try again or check Settings → Google accounts.`, 'error');
  } else if (change.status === 'rescheduled') {
    const parts = [meeting.gcal_event_id && 'calendar updated', videoPlatform(meeting.meet_link) === 'zoom' && 'Zoom moved', emailed && `${emailed} participant${emailed === 1 ? '' : 's'} emailed`].filter(Boolean);
    if (parts.length) toast(`Rescheduled — ${parts.join(', ')}`, 'success');
  } else if (emailed) {
    toast(`${change.status === 'cancelled' ? 'Cancellation' : 'Thank-you'} email sent to ${emailed} participant${emailed === 1 ? '' : 's'}`, 'success');
  }
}
