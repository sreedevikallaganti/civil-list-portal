'use client';

/* KeyPersonStar — "Key person" toggle on an officer's profile. Starred officers appear on the
   dashboard's "Key people" card when they haven't been met for a while. */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { useKeyPeople } from '@/lib/keyPeople';

/** The row shortcut in the Officers / Employees tables: a small star that marks or un-marks a key person. */
export function KeyPersonToggle({ refId, name, role }: { refId: string; name: string; role?: string }) {
  const { people, isKey, toggle } = useKeyPeople();
  const [busy, setBusy] = useState(false);
  const on = isKey(refId);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try { await toggle({ ref: refId, name, role }); } catch { /* the star goes back by itself */ } finally { setBusy(false); }
      }}
      disabled={busy || people === null}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from key persons` : `Mark ${name} as a key person`}
      title={on ? 'Key person — click to remove' : 'Mark as key person'}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
        on ? 'text-violet-600 hover:bg-violet-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'
      }`}
    >
      <Star className={`h-4 w-4 ${on ? 'fill-current' : ''}`} />
    </button>
  );
}

export default function KeyPersonStar({ refId, name, role, light = false }: { refId: string; name: string; role?: string; light?: boolean }) {
  const { people, isKey, toggle } = useKeyPeople();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = isKey(refId);

  const click = async () => {
    setBusy(true);
    setFailed(false);
    try { await toggle({ ref: refId, name, role }); } catch { setFailed(true); } finally { setBusy(false); }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy || people === null}
      aria-pressed={on}
      title={failed ? 'Couldn’t save — please try again' : on ? 'Remove from key people' : 'Mark as a key person — shown on the dashboard when not met for 90 days'}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-60 ${
        light
          ? on ? 'bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          : on ? 'bg-white text-slate-800 ring-white hover:bg-slate-100' : 'bg-white/10 text-white ring-white/20 hover:bg-white/20'
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${on ? 'fill-current' : ''}`} />
      {failed ? 'Try again' : on ? 'Key person' : 'Mark as key person'}
    </button>
  );
}
