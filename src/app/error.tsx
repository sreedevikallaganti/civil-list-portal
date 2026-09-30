'use client'; // Error boundaries must be Client Components

// Shown instead of a blank page when something on a page crashes.
// The sidebar (root layout) stays usable; "Try again" re-renders just this page.

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[page error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">This page ran into a problem</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your data is safe. Try again, or go back to the dashboard.
        </p>
        {error?.message && (
          <p className="mt-3 break-words rounded-xl bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-500">
            {error.message}{error.digest ? ` (ref ${error.digest})` : ''}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => retry()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700"
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
