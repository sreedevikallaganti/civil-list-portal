'use client'; // Error boundaries must be Client Components

// Last-resort screen when the root layout itself fails. Renders its own
// <html>/<body> and inline styles because global CSS isn't loaded here.

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f7f6fd', color: '#0f172a' }}>
        <title>Civillist — something went wrong</title>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 24, padding: 32, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <h1 style={{ fontSize: 18, margin: 0 }}>Civillist couldn’t load</h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>
              Please try again. If this keeps happening, check that the PocketBase server is reachable.
            </p>
            {error?.digest && <p style={{ fontSize: 12, color: '#94a3b8' }}>ref {error.digest}</p>}
            <button
              onClick={() => retry()}
              style={{ marginTop: 12, border: 0, borderRadius: 999, background: '#0f172a', color: '#fff', padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
