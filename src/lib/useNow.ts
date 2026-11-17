'use client';

import { useEffect, useState } from 'react';

/** The current time (ms), refreshed every `everyMs` — use instead of Date.now() during render,
    so "upcoming" / "in 3 days" values stay correct while a page is left open. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
