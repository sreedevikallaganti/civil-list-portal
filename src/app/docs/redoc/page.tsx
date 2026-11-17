// src/app/docs/redoc/page.tsx — /docs/redoc: ReDoc reference for public/openapi.json. Public page.
import type { Metadata } from 'next';
import RedocView from '@/components/docs/RedocView';

export const metadata: Metadata = {
  title: 'API Reference (ReDoc) · Civillist',
  description: 'ReDoc / OpenAPI reference for the Civillist server routes.',
};

export default function RedocPage() {
  return <RedocView />;
}
