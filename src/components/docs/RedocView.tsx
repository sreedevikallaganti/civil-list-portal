'use client';

/* RedocView — ReDoc for /openapi.json (the same spec as the Swagger page, public/openapi.json).
   ReDoc is read-only documentation (three-column layout, no "Try it out"); use /docs/api to call
   the API. Loaded from the unpkg CDN (pinned version) so it adds nothing to the app bundle. */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowLeft, BookMarked, Download, Loader2, Terminal } from 'lucide-react';

const REDOC_VERSION = '2.1.5';
const SRC = `https://unpkg.com/redoc@${REDOC_VERSION}/bundles/redoc.standalone.js`;
const SPEC_URL = '/openapi.json';

declare global {
  interface Window {
    Redoc?: { init: (specUrl: string, options: Record<string, unknown>, element: HTMLElement | null, callback?: (err?: unknown) => void) => void };
  }
}

export default function RedocView() {
  const target = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const init = () => {
    if (started.current || !window.Redoc || !target.current) return;
    started.current = true;
    window.Redoc.init(
      SPEC_URL,
      {
        hideDownloadButton: false,
        expandResponses: '200',
        requiredPropsFirst: true,
        sortPropsAlphabetically: false,
        pathInMiddlePanel: true,
        scrollYOffset: 0,
        theme: {
          colors: { primary: { main: '#7c3aed' } },
          typography: { fontSize: '14px', fontFamily: 'Inter, system-ui, sans-serif', headings: { fontFamily: 'Inter, system-ui, sans-serif' } },
          sidebar: { backgroundColor: '#faf9ff', activeTextColor: '#6d28d9' },
          rightPanel: { backgroundColor: '#1e1b4b' },
        },
      },
      target.current,
      (err) => (err ? setFailed(true) : setReady(true)),
    );
  };

  // the script may already be cached from an earlier visit
  useEffect(() => {
    if (window.Redoc) init();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-violet-50 to-purple-100 px-4 py-6 sm:px-6 lg:px-8">
      <Script src={SRC} strategy="afterInteractive" onLoad={init} onError={() => setFailed(true)} />

      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-violet-100">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md"><BookMarked className="h-5 w-5" /></span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Civillist <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">API Reference · ReDoc</span>
              </h1>
              <p className="text-xs text-slate-500">OpenAPI 3.1 · read-only — to call the API use the Swagger page</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={SPEC_URL} download="civillist-openapi.json"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              <Download className="h-3.5 w-3.5" /> openapi.json
            </a>
            <Link href="/docs/api"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              <Terminal className="h-3.5 w-3.5" /> Swagger (try it)
            </Link>
            <Link href="/docs" className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Docs & Status
            </Link>
          </div>
        </header>

        <main className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
          {failed ? (
            <div className="px-4 py-12 text-center text-sm text-slate-600">
              ReDoc couldn’t be loaded from the CDN (offline?). The spec itself is still available:{' '}
              <a href={SPEC_URL} className="font-semibold text-violet-700 underline">/openapi.json</a>.
            </div>
          ) : (
            !ready && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Loading API reference…
              </div>
            )
          )}
          <div ref={target} />
        </main>
      </div>
    </div>
  );
}
