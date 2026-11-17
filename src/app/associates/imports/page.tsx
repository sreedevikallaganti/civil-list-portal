'use client';

/* /associates/imports — the uploaded Excel files, organised in folders ("Associates › Detail associates › …").
   Editors upload, review and save drafts; an admin syncs them into the Associates list. */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileClock, FileSpreadsheet, FileWarning, Loader2, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit, roleOf } from '@/lib/roles';
import { errorText, listFields } from '@/lib/associatesApi';
import { listImports, type BatchSummary } from '@/lib/associateImportsApi';
import type { AssociateField } from '@/lib/associates';
import AssociatesFrame, { StatCard } from '@/components/associates/AssociatesFrame';
import ImportHistory from '@/components/associates/ImportHistory';
import { btn } from '@/components/associates/ui';

export default function AssociateImportsPage() {
  const { user } = useAuth();
  const editable = canEdit(user);
  const canSubmit = roleOf(user) === 'admin';
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [fields, setFields] = useState<AssociateField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, f] = await Promise.all([listImports(), listFields()]);
      setBatches(b);
      setFields(f);
      setError('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const count = (...s: BatchSummary['status'][]) => batches.filter((b) => s.includes(b.status)).length;
  const open = count('uploaded', 'draft', 'ready', 'failed');
  const pct = (n: number) => (batches.length ? (n / batches.length) * 100 : 0);
  const review = count('uploaded', 'draft');
  const ready = count('ready');
  const synced = count('submitted');
  const failed = count('failed');

  return (
    <AssociatesFrame
      count={loading ? undefined : batches.length}
      countLabel={loading ? 'Loading…' : `${batches.length} ${batches.length === 1 ? 'file' : 'files'} imported`}
      draftCount={open}
    >
      {/* at a glance — one colour per status */}
      {!error && !loading && batches.length > 0 && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:gap-5">
          <StatCard label="Files" value={batches.length} caption="All imported files" icon={FileSpreadsheet} tone="violet" pct={100} delay={60} />
          <StatCard label="To review" value={review} caption="Dry run or draft" icon={FileClock} tone="amber" pct={pct(review)} delay={120} />
          <StatCard label="Ready to sync" value={ready} caption={canSubmit ? 'Waiting for your approval' : 'Waiting for an admin'} icon={Send} tone="sky" pct={pct(ready)} delay={180} />
          <StatCard label="Synced" value={synced} caption="Added to Associates" icon={CheckCircle2} tone="emerald" pct={pct(synced)} delay={240} />
          <StatCard label="Failed" value={failed} caption="Couldn’t be read or synced" icon={FileWarning} tone="rose" pct={pct(failed)} delay={300} />
        </section>
      )}

      {error ? (
        <div className="rounded-3xl bg-rose-50 p-6 text-center ring-1 ring-rose-100" role="alert">
          <p className="font-semibold text-rose-900">The imports couldn&apos;t be loaded</p>
          <p className="mt-1 text-sm text-rose-700">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className={`${btn.secondary} mt-4`}>Try again</button>
        </div>
      ) : (
        // the explorer keeps the open folder in the address (?folder=…), which needs a Suspense boundary
        <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>}>
          <ImportHistory batches={batches} loading={loading} editable={editable} canSubmit={canSubmit} fields={fields} onChanged={load} />
        </Suspense>
      )}
    </AssociatesFrame>
  );
}
