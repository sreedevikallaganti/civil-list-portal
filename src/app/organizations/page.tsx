// src/app/organizations/page.tsx — platform owner: add, edit, suspend and switch organisations.
import type { Metadata } from 'next';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import OrganizationsView from '@/components/organizations/OrganizationsView';

export const metadata: Metadata = {
  title: 'Organisations · Civillist',
  description: 'Add and manage the organisations using Civillist.',
};

export default function OrganizationsPage() {
  return (
    <ProtectedRoute>
      <OrganizationsView />
    </ProtectedRoute>
  );
}
