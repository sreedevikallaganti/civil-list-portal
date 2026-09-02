import { NextResponse } from 'next/server';
import pb from '@/lib/pocketbase';

export async function GET() {
  try {
    // Get raw meetings data
    const meetings = await pb.collection('meetings').getList(1, 5, {
      expand: 'attendees,participants,officers,ias_officers,ips_officers',
    });

    // Get officer collections
    const iasOfficers = await pb.collection('ias_officers').getList(1, 3);
    const ipsOfficers = await pb.collection('ips_officers').getList(1, 3);

    return NextResponse.json({
      meetingsCount: meetings.totalItems,
      meetingsSample: meetings.items.map((m: any) => ({
        id: m.id,
        allFields: Object.keys(m),
        data: m,
        expandData: m.expand,
      })),
      iasOfficersCount: iasOfficers.totalItems,
      iasOfficersSample: iasOfficers.items,
      ipsOfficersCount: ipsOfficers.totalItems,
      ipsOfficersSample: ipsOfficers.items,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}