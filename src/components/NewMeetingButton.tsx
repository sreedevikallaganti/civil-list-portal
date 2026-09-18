'use client';

import { Plus } from 'lucide-react';
// import { useNewMeeting } from './NewMeetingShortcutProvider';

export default function NewMeetingButton({
  className = '',
  label = 'New Meeting',
  showKbd = true,
}: {
  className?: string;
  label?: string;
  showKbd?: boolean;
}) {
//   const { openCreate } = useNewMeeting();

  return (
    <button
      onClick={openCreate}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.98] ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
      {label}
      {showKbd && (
        <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ring-white/30 sm:inline">
          N
        </kbd>
      )}
    </button>
  );
}