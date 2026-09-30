// Shown while a page's code is loading (e.g. the first visit to a page).
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
      <p className="text-sm font-medium text-slate-500">Loading…</p>
    </div>
  );
}
