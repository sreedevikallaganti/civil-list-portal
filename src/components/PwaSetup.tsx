'use client';

/* PwaSetup — registers the service worker and starts listening for the browser's
   "this app can be installed" signal. Mounted once in app/layout.tsx. */

import { useEffect } from 'react';
import { initPwa } from '@/lib/pwa';

let started = false;

export default function PwaSetup() {
  useEffect(() => {
    if (started) return;
    started = true;
    initPwa();
  }, []);
  return null;
}
