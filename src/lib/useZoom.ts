'use client';

// useZoomEnabled — is Zoom set up on the server (lib/zoom)? Asked once per page load.
import { useEffect, useState } from 'react';
import { apiJSON } from '@/lib/apiClient';

let status: Promise<boolean> | null = null;

export function useZoomEnabled(enabled = true) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    status ??= apiJSON<{ configured: boolean }>('/api/zoom/status', {})
      .then((r) => !!r.configured)
      .catch(() => { status = null; return false; }); // ask again next time
    status.then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, [enabled]);
  return on;
}
