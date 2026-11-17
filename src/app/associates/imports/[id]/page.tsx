'use client';

/* /associates/imports/[id] — review one uploaded file: the dry run, corrections, Save as draft, Submit. */

import { useParams } from 'next/navigation';
import ImportReview from '@/components/associates/ImportReview';

export default function ImportReviewPage() {
  const { id } = useParams<{ id: string }>();
  return <ImportReview key={id} id={id} />;
}
