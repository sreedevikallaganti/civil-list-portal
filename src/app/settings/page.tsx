// src/app/settings/page.tsx — the signed-in person's own profile, password and preferences.
import type { Metadata } from 'next';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SettingsView from '@/components/settings/SettingsView';

export const metadata: Metadata = {
  title: 'Settings · Civillist',
  description: 'Your profile, password and preferences.',
};

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsView />
    </ProtectedRoute>
  );
}
