'use client';

/* InstallAppButton — "Install" in the phone top bar. Shown only when it can do something:
   Android / Chrome / Edge → opens the browser's install dialog;
   iPhone / iPad (no install dialog exists) → opens Settings → Mobile app with the steps.
   Hidden once the app is installed or when running from the home-screen icon. */

import Link from 'next/link';
import { Download } from 'lucide-react';
import { promptInstall, useInstallState } from '@/lib/pwa';
import { showToast } from '@/components/Toaster';

const cls =
  'inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm active:scale-95';

export default function InstallAppButton() {
  const { canPrompt, installed, ios } = useInstallState();
  if (installed) return null;

  if (canPrompt) {
    return (
      <button
        type="button"
        className={cls}
        data-tooltip="Install Civillist as an app on this device"
        onClick={async () => {
          const outcome = await promptInstall();
          if (outcome === 'accepted') showToast('Civillist is being added to your home screen', 'success');
        }}
      >
        <Download className="h-3.5 w-3.5" /> Install
      </button>
    );
  }
  if (ios) {
    return (
      <Link href="/settings#app" className={cls} data-tooltip="How to add Civillist to your home screen">
        <Download className="h-3.5 w-3.5" /> Install
      </Link>
    );
  }
  return null;
}
