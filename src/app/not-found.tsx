import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">That link doesn’t lead anywhere in Civillist.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
