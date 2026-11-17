'use client';

/* MinutesDocument — /minutes/<id>: the formal minutes of one meeting on an A4 sheet.
   "Print / Save as PDF" uses the browser's print dialog (choose "Save as PDF").
   Print styles hide the app's sidebar and top bar, so only the sheet is printed. */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { useAuth } from '@/contexts/AuthContext';

const fmtDate = (v?: string) => {
  const d = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
};
const fmtTime = (v?: string) => String(v || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
const fmtDuration = (v?: string | number) => {
  const n = Number(v) || 0;
  if (!n) return '';
  const h = Math.floor(n / 60), m = n % 60;
  return h ? `${h} hr${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}` : `${m} min`;
};
const list = (v: unknown) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]+/)).map((s) => String(s).trim()).filter(Boolean);

export default function MinutesDocument({ id }: { id: string }) {
  const { user } = useAuth();
  const [m, setM] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    pb.collection('meetings').getOne(id, { requestKey: null })
      .then((rec) => setM(rec))
      .catch((e) => setError(e?.status === 404 ? 'This meeting no longer exists.' : 'Couldn’t load the meeting. Check your connection and try again.'));
  }, [id]);

  const preparedBy = String(user?.name || user?.email || '');
  const issued = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  if (error) {
    return <Centered><p className="text-sm text-rose-600">{error}</p><Back /></Centered>;
  }
  if (!m) {
    return <Centered><Loader2 className="h-5 w-5 animate-spin text-violet-500" /><p className="text-sm text-slate-500">Preparing the minutes…</p></Centered>;
  }

  const minutes = String(m.minutes || '').trim();
  const venue = [m.location, m.city].filter(Boolean).join(', ') || m.meeting_place || '—';
  const withWhom = [m.officer_name, [m.designation || m.current_position, m.department].filter(Boolean).join(', ')].filter(Boolean);
  const attendees = list(m.attendees).filter((a) => a.toLowerCase() !== String(m.email || '').toLowerCase());
  const when = [fmtTime(m.meeting_time) && `${fmtTime(m.meeting_time)} hrs`, fmtDuration(m.duration) && `(${fmtDuration(m.duration)})`].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      {/* print: only the sheet — hide the app's sidebar, top bar and these controls */}
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          aside, header, .no-print { display: none !important; }
          main { margin: 0 !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Back />
        <div className="flex items-center gap-2">
          {!minutes && <span className="text-xs font-medium text-amber-700">No minutes recorded yet — the sheet has space to write them by hand.</span>}
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="sheet mx-auto max-w-[210mm] bg-white px-[16mm] py-[16mm] text-[13px] leading-relaxed text-slate-900 shadow-lg"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        {/* heading */}
        <header className="border-b-2 border-slate-900 pb-3 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Civillist · Meeting Management</p>
          <h1 className="mt-1 text-[20px] font-bold uppercase tracking-[0.12em]">Minutes of Meeting</h1>
        </header>

        <h2 className="mt-5 text-[16px] font-bold leading-snug">{m.agenda || 'Meeting'}</h2>

        {/* particulars */}
        <table className="mt-4 w-full border-collapse text-[12.5px]">
          <tbody>
            {[
              ['Date', fmtDate(m.meeting_date)],
              ['Time', when || '—'],
              ['Venue', venue],
              ['Meeting with', withWhom.join(' — ') || '—'],
              ['Type', [m.meeting_type, m.priority && `${m.priority} priority`].filter(Boolean).join(' · ') || '—'],
              ['Status', m.status || 'Scheduled'],
            ].map(([k, v]) => (
              <tr key={k} className="align-top">
                <th className="w-[32%] border border-slate-300 bg-slate-50 px-3 py-1.5 text-left font-semibold">{k}</th>
                <td className="border border-slate-300 px-3 py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {attendees.length > 0 && (
          <section className="mt-5">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Also present / invited</h3>
            <ol className="mt-1.5 list-decimal pl-6">{attendees.map((a) => <li key={a}>{a}</li>)}</ol>
          </section>
        )}

        <section className="mt-5">
          <h3 className="text-[13px] font-bold uppercase tracking-wider">Proceedings</h3>
          {minutes ? (
            <div className="mt-1.5 whitespace-pre-wrap">{minutes}</div>
          ) : (
            <div className="mt-2 space-y-5" aria-label="Space for handwritten minutes">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="border-b border-dotted border-slate-400" />)}
            </div>
          )}
        </section>

        {(m.follow_up_date || m.follow_up_notes) && (
          <section className="mt-5">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Follow-up</h3>
            <p className="mt-1.5">
              {m.follow_up_date && <><b>By {fmtDate(m.follow_up_date)}</b>{m.follow_up_notes ? ': ' : ''}</>}
              {m.follow_up_notes}
            </p>
          </section>
        )}

        {/* signatures */}
        <section className="mt-14 grid grid-cols-2 gap-10 text-[12.5px]">
          <div>
            <div className="h-10 border-b border-slate-500" />
            <p className="mt-1.5 font-semibold">Prepared by</p>
            <p className="text-slate-600">{preparedBy || ' '}</p>
          </div>
          <div>
            <div className="h-10 border-b border-slate-500" />
            <p className="mt-1.5 font-semibold">Approved by</p>
            <p className="text-slate-600">&nbsp;</p>
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-300 pt-2 text-center text-[10.5px] text-slate-500">
          Issued {issued} · Reference {m.id}
        </footer>
      </article>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">{children}</div>;
}

function Back() {
  return (
    <Link href="/meetings" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:text-violet-700">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to meetings
    </Link>
  );
}
