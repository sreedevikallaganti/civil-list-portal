'use client';

/* SwaggerView — Swagger UI for /openapi.json (the spec lives in public/openapi.json).
   Swagger UI is loaded from the unpkg CDN (pinned version) so it adds nothing to the app bundle.
   When you are signed in to the app in this browser, your PocketBase token is attached to
   "Try it out" requests automatically; otherwise use the Authorize button. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowLeft, Download, FileJson, Loader2 } from 'lucide-react';
import pb from '@/lib/pocketbase';

const SWAGGER_VERSION = '5.17.14';
const CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}`;
const SPEC_URL = '/openapi.json';

declare global {
  interface Window {
    SwaggerUIBundle?: ((config: Record<string, unknown>) => SwaggerUI) & { presets: { apis: unknown } };
  }
}

type SwaggerUI = {
  preauthorizeApiKey: (scheme: string, value: string) => void;
  authActions: { logout: (schemes: string[]) => void };
};

const AUTH_SCHEME = 'PocketBaseToken';

export default function SwaggerView() {
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // signed-in state without a server/client mismatch (the server never has a session)
  const signedIn = useSyncExternalStore((cb) => pb.authStore.onChange(cb), () => pb.authStore.isValid, () => false);

  const init = () => {
    if (mounted.current || !window.SwaggerUIBundle) return;
    mounted.current = true;
    let ui: SwaggerUI | null = null;
    ui = window.SwaggerUIBundle({
      url: SPEC_URL,
      dom_id: '#swagger-ui',
      presets: [window.SwaggerUIBundle.presets.apis],
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: false,
      docExpansion: 'list',
      defaultModelsExpandDepth: 0,
      // signed in to the app here? send that session's token unless one was entered via Authorize
      requestInterceptor: (req: { headers: Record<string, string> }) => {
        if (!req.headers.Authorization && pb.authStore.isValid) req.headers.Authorization = pb.authStore.token;
        return req;
      },
      // Log in → its token is put into Authorize; Log out → Authorize is cleared
      responseInterceptor: (res: { url: string; ok: boolean; body?: { token?: string } }) => {
        if (res.ok && res.url.endsWith('/api/auth/login') && res.body?.token) ui?.preauthorizeApiKey(AUTH_SCHEME, res.body.token);
        if (res.ok && res.url.endsWith('/api/auth/logout')) ui?.authActions.logout([AUTH_SCHEME]);
        return res;
      },
    });
    setReady(true);
  };

  // the script may already be cached from an earlier visit
  useEffect(() => {
    if (window.SwaggerUIBundle) init();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-violet-50 to-purple-100 px-4 py-6 sm:px-6 lg:px-8">
      <link rel="stylesheet" href={`${CDN}/swagger-ui.css`} />
      <Script src={`${CDN}/swagger-ui-bundle.js`} strategy="afterInteractive" onLoad={init} onError={() => setFailed(true)} />

      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-violet-100">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md"><FileJson className="h-5 w-5" /></span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Civillist <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">API Reference</span>
              </h1>
              <p className="text-xs text-slate-500">
                OpenAPI 3.1 · {signedIn ? 'signed in — your session is used for “Try it out”' : 'not signed in — use Authorize for protected routes'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={SPEC_URL} download="civillist-openapi.json"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              <Download className="h-3.5 w-3.5" /> openapi.json
            </a>
            <Link href="/docs/redoc"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              ReDoc
            </Link>
            <Link href="/docs" className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Docs & Status
            </Link>
          </div>
        </header>

        <main className="mt-6 overflow-hidden rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-100 sm:p-4">
          {failed ? (
            <div className="px-4 py-12 text-center text-sm text-slate-600">
              Swagger UI couldn’t be loaded from the CDN (offline?). The spec itself is still available:{' '}
              <a href={SPEC_URL} className="font-semibold text-violet-700 underline">/openapi.json</a> — open it in Postman,
              Insomnia or editor.swagger.io.
            </div>
          ) : (
            !ready && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Loading API reference…
              </div>
            )
          )}
          <div id="swagger-ui" />
        </main>
      </div>
    </div>
  );
}
