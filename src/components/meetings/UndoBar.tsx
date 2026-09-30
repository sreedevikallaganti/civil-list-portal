'use client';

/* UndoBar — "Meeting deleted · Undo" snackbar with a shrinking timer. */

import { RotateCcw, Trash2 } from 'lucide-react';

export const UNDO_MS = 6000;

export default function UndoBar({ message, onUndo, startedAt }: {
  message: string;
  onUndo: () => void;
  startedAt: number;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
      <div key={startedAt} className="anim-scale-in pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-full bg-slate-900 py-2 pl-4 pr-2 text-white shadow-2xl shadow-slate-900/30">
        <Trash2 className="h-4 w-4 text-rose-300" />
        <span className="text-sm font-semibold">{message}</span>
        <button
          onClick={onUndo}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-violet-50 active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Undo
        </button>
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-violet-400"
          style={{ width: '100%', animation: `undoShrink ${UNDO_MS}ms linear forwards` }}
        />
        <style>{'@keyframes undoShrink{from{width:100%}to{width:0%}}'}</style>
      </div>
    </div>
  );
}