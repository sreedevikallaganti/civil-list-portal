'use client';

/* "with Ravi Kumar +2" under a meeting's agenda.
   The name opens that person's meeting history; "+2" opens the meeting (all participants). */

import { User } from 'lucide-react';
import { participantsSummary, unnamedEmails, type Participant } from '@/lib/participants';
import { useEmailNames } from '@/lib/emailNames';

export default function ParticipantsLine({ meeting, onPerson, onMore, className = '' }: {
  meeting: any;
  onPerson: (p: Participant) => void;
  onMore: () => void;
  className?: string;
}) {
  const names = useEmailNames(unnamedEmails(meeting));
  const { first, more, all } = participantsSummary(meeting, names);
  if (!first) return null;
  return (
    <div className={`mt-1 flex max-w-full items-center gap-1.5 text-xs text-slate-500 ${className}`}>
      <User className="h-3 w-3 shrink-0 text-slate-400" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPerson(first); }}
        title="See all meetings with this person"
        className="min-w-0 truncate rounded-md text-left transition-colors hover:text-violet-600 hover:underline"
      >
        with {first.name}
      </button>
      {more > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMore(); }}
          title={all.slice(1).map((p) => p.name).join(', ')}
          className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-inset ring-violet-500/20 transition-colors hover:bg-violet-100"
        >
          +{more}
        </button>
      )}
    </div>
  );
}
