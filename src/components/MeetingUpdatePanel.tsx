'use client';

import { useState, useEffect } from 'react';
import {
  X, Calendar, Flag, StickyNote, Mail, Video,
  CalendarPlus, Loader2, ExternalLink, Copy, Check, Zap,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { showToast } from '@/components/Toaster';

interface MeetingUpdatePanelProps {
  isOpen: boolean;
  meeting: any | null;
  onClose: () => void;
  onUpdated?: (updated: any) => void;
}

type BusyAction = null | 'invite' | 'meet' | 'gcal';

const STATUS_OPTIONS = [
  { value: 'Scheduled',   active: 'bg-blue-500 text-white ring-blue-500' },
  { value: 'Completed',   active: 'bg-emerald-500 text-white ring-emerald-500' },
  { value: 'Cancelled',   active: 'bg-rose-500 text-white ring-rose-500' },
  { value: 'Rescheduled', active: 'bg-amber-500 text-white ring-amber-500' },
];

const QUICK_FOLLOW_UP = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const to12Hour = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function MeetingUpdatePanel({ isOpen, meeting, onClose, onUpdated }: MeetingUpdatePanelProps) {
  const [current, setCurrent] = useState<any>(null);
  const [status, setStatus] = useState('Scheduled');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpDetails, setFollowUpDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500';

  useEffect(() => {
    if (isOpen && meeting) {
      setCurrent(meeting);
      setStatus(meeting.status_flag || 'Scheduled');
      setNotes(meeting.notes || '');
      setFollowUpDate(
        meeting.follow_up_date
          ? String(meeting.follow_up_date).split(' ')[0]?.split('T')[0] || ''
          : ''
      );
      setFollowUpDetails(meeting.follow_up_details || '');
    }
  }, [isOpen, meeting]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || !meeting || !current) return null;

  const rawDate = String(current.meeting_date || '');
  const dateOnly = rawDate.split(' ')[0]?.split('T')[0] || '';
  const timeOnly = (rawDate.split(' ')[1] || rawDate.split('T')[1] || '').substring(0, 5);
  const hasEmail = !!current.email;

  /* ---------- persistence ---------- */

  const persistRecord = async (patch: Record<string, any>) => {
    const updated = await pb.collection('meetings').update(current.id, patch);
    setCurrent((prev: any) => ({ ...prev, ...patch }));
    onUpdated?.(updated);
    return updated;
  };

  /* ---------- Google automation ---------- */

  const runGoogle = async (
    action: Exclude<BusyAction, null>,
    opts: { includeMeet?: boolean; sendInvite?: boolean }
  ) => {
    setBusy(action);
    try {
      const res = await fetch('/api/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: current.id,
          gcalEventId: current.gcal_event_id || '',
          existingMeetLink: current.meet_link || '',
          agenda: current.agenda,
          date: dateOnly,
          time: timeOnly,
          duration: Number(current.duration) || 30,
          location: current.location || '',
          notes: notes || '',
          officerName: current.officer_name || '',
          officerEmail: current.email || '',
          includeMeet: !!opts.includeMeet,
          sendInvite: !!opts.sendInvite,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google action failed');

      const patch: Record<string, any> = {};
      if (data.meetLink) patch.meet_link = data.meetLink;
      if (data.eventId) patch.gcal_event_id = data.eventId;
      if (data.htmlLink) patch.gcal_link = data.htmlLink;
      await persistRecord(patch);

      showToast(
        opts.sendInvite ? 'Invite sent!' : opts.includeMeet ? 'Google Meet link created!' : 'Synced to Google Calendar!',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistRecord({
        status, 
        status_flag: status,
        notes,
        follow_up_date: followUpDate,
        follow_up_details: followUpDetails,
      });
      showToast('Meeting updated', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to update meeting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    showToast('Link copied', 'success');
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[65] bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-[70] w-full sm:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-slate-900 truncate">{current.agenda || 'Meeting'}</h4>
            <p className="text-[11px] text-slate-400 truncate">
              {prettyDate(dateOnly)}{timeOnly ? ` · ${to12Hour(timeOnly)}` : ''}
              {current.officer_name ? ` · ${current.officer_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 nice-scroll">
          {/* status */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Meeting status</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`py-2.5 rounded-xl text-xs font-bold ring-1 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5
                    ${status === s.value ? s.active : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}
                >
                  {status === s.value && <Check className="w-3.5 h-3.5" />}
                  {s.value}
                </button>
              ))}
            </div>
          </section>

          {/* notes */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <StickyNote className="w-3.5 h-3.5 text-indigo-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Meeting notes</p>
            </div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed, decisions made, action items…"
              className={inputCls}
            />
          </section>

          {/* follow-up */}
          <section className="rounded-2xl ring-1 ring-amber-100 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Flag className="w-3.5 h-3.5 text-amber-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Follow-up</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_FOLLOW_UP.map((q) => {
                const iso = toLocalISODate(new Date(Date.now() + q.days * 86400000));
                const active = followUpDate === iso;
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setFollowUpDate(iso)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                      active
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
              {followUpDate && (
                <button
                  type="button"
                  onClick={() => setFollowUpDate('')}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 transition-all active:scale-95"
                >
                  Clear
                </button>
              )}
            </div>

            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />

            <textarea
              rows={3}
              value={followUpDetails}
              onChange={(e) => setFollowUpDetails(e.target.value)}
              placeholder="Follow-up details — what to cover, documents to prepare…"
              className={inputCls}
            />
          </section>

          {/* automations */}
          <section className="rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-violet-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Automations</p>
            </div>

            {/* invite */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${hasEmail ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Send invite to email</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {hasEmail ? current.email : 'No email saved for this meeting'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!hasEmail || busy !== null}
                onClick={() => runGoogle('invite', { sendInvite: true })}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
              >
                {busy === 'invite' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Send
              </button>
            </div>

            {/* meet */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Video className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Google Meet link</p>
                  {current.meet_link ? (
                    <a href={current.meet_link} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline truncate block">
                      {current.meet_link}
                    </a>
                  ) : (
                    <p className="text-[11px] text-slate-400">Not created yet</p>
                  )}
                </div>
              </div>
              {current.meet_link ? (
                <button
                  type="button"
                  onClick={() => copyLink(current.meet_link)}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runGoogle('meet', { includeMeet: true })}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
                >
                  {busy === 'meet' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                  Create
                </button>
              )}
            </div>

            {/* gcal */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                  <CalendarPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Sync to Google Calendar</p>
                  {current.gcal_link ? (
                    <a href={current.gcal_link} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline truncate flex items-center gap-1">
                      View in Calendar <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <p className="text-[11px] text-slate-400">Not synced yet</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => runGoogle('gcal', { includeMeet: !!current.meet_link })}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
              >
                {busy === 'gcal' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {current.gcal_event_id ? 'Update' : 'Sync'}
              </button>
            </div>
          </section>
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30 disabled:opacity-40 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </>
  );
}