// src/app/occasions/page.tsx — birthdays, service anniversaries, retirements, national days and special events.
import type { Metadata } from 'next';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import OccasionsView from '@/components/occasions/OccasionsView';

export const metadata: Metadata = {
  title: 'Occasions · Civillist',
  description: 'Birthdays, service anniversaries, retirements, national days and special events.',
};

export default function OccasionsPage() {
  return (
    <ProtectedRoute>
      <OccasionsView />
    </ProtectedRoute>
  );
}
