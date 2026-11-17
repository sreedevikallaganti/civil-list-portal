// src/app/map/page.tsx — Meeting Map: where meetings are held and the places visited most.
import type { Metadata } from 'next';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MeetingMapView from '@/components/map/MeetingMapView';

export const metadata: Metadata = {
  title: 'Meeting Map · Civillist',
  description: 'Where meetings are held, and which places are visited most.',
};

export default function MapPage() {
  return (
    <ProtectedRoute>
      <MeetingMapView />
    </ProtectedRoute>
  );
}
