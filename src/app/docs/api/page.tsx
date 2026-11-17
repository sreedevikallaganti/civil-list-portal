// src/app/docs/api/page.tsx — /docs/api: interactive Swagger UI for public/openapi.json. Public page.
import type { Metadata } from 'next';
import SwaggerView from '@/components/docs/SwaggerView';

export const metadata: Metadata = {
  title: 'API Reference · Civillist',
  description: 'Swagger / OpenAPI reference for the Civillist server routes.',
};

export default function ApiDocsPage() {
  return <SwaggerView />;
}
