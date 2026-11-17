// src/app/minutes/[id]/page.tsx — formal minutes of one meeting, ready to print or save as PDF.
import type { Metadata } from 'next';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MinutesDocument from '@/components/meetings/MinutesDocument';

export const metadata: Metadata = {
  title: 'Minutes of Meeting · Civillist',
};

export default async function MinutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedRoute>
      <MinutesDocument id={id} />
    </ProtectedRoute>
  );
}
