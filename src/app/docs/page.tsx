// src/app/docs/page.tsx — /docs: live status board + how the app works. Public (no sign-in needed).
import type { Metadata } from 'next';
import DocsView from '@/components/docs/DocsView';

export const metadata: Metadata = {
  title: 'Docs & Status · Civillist',
  description: 'Is Civillist working? Live status of every service, plus a guide to the app.',
};

export default function DocsPage() {
  return <DocsView />;
}
