'use client';

/* A read-only look at an uploaded Excel / CSV file, straight from the stored original — works even when the
   import's checked rows are missing. Shows the first rows of each sheet, with a Download button. */

import { useEffect, useState } from 'react';
import { Download, Eye, Loader2, X } from 'lucide-react';
import { showToast } from '@/components/Toaster';
import type { Cell } from '@/lib/associates';
import { parseWorkbook, type SheetData } from '@/lib/associateExcel';
import { downloadOriginal, originalFileUrl } from '@/lib/associateImportsApi';
import { errorText } from '@/lib/associatesApi';
import { splitImportPath } from '@/lib/associateImport';
import { btn, useEscape } from './ui';

const SHOW_ROWS = 200;

const text = (v: Cell) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toLocaleDateString('en-IN');
  return String(v);
};

export default function FilePreview({ batch, onClose }: {
  batch: { id: string; file?: string; file_name: string };
  onClose: () => void;
}) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  useEscape(onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(await originalFileUrl(batch));
        if (!res.ok) throw new Error(`The file could not be fetched (${res.status}).`);
        const parsed = parseWorkbook(await import('xlsx'), await res.arrayBuffer());
        if (alive) setSheets(parsed);
      } catch (err) {
        if (alive) setError(errorText(err));
      }
    })();
    return () => { alive = false; };
  }, [batch]);

  const sheet = sheets?.[active];
  const name = splitImportPath(batch.file_name).name;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Eye className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="preview-title" className="truncate text-lg font-bold text-slate-900" title={batch.file_name}>{name}</h2>
            <p className="text-sm text-slate-500">
              Preview of the original file{sheet ? ` · ${sheet.body.length} ${sheet.body.length === 1 ? 'row' : 'rows'}${sheet.body.length > SHOW_ROWS ? ` (first ${SHOW_ROWS} shown)` : ''}` : ''}
            </p>
          </div>
          <button type="button" className={btn.secondary}
            onClick={async () => { try { await downloadOriginal(batch); } catch (err) { showToast(errorText(err), 'error'); } }}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
          </button>
          <button type="button" onClick={onClose} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        {sheets && sheets.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-5 py-2.5 sm:px-7" role="tablist" aria-label="Sheets">
            {sheets.map((s, i) => (
              <button key={s.name} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${i === active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[12rem] flex-1 overflow-auto">
          {error ? (
            <div className="p-8 text-center text-sm text-rose-700" role="alert">
              <p className="font-semibold">The file can&apos;t be previewed</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2 text-slate-500">Use Download to open it in Excel.</p>
            </div>
          ) : !sheets ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Reading the file…</div>
          ) : !sheet ? (
            <p className="p-8 text-center text-sm text-slate-500">The file has no data.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-slate-400">Row</th>
                  {sheet.headers.map((h, i) => <th key={i} className="whitespace-nowrap border-b border-slate-200 px-3 py-2.5">{h || `Column ${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheet.body.slice(0, SHOW_ROWS).map((r, ri) => (
                  <tr key={ri} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 tabular-nums text-slate-400">{sheet.firstRow + ri}</td>
                    {sheet.headers.map((_, ci) => (
                      <td key={ci} className="max-w-[16rem] truncate px-3 py-2 text-slate-700" title={text(r[ci])}>{text(r[ci])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
