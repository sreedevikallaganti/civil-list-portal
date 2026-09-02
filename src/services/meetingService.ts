import pb from '@/lib/pocketbase';

export async function getMeetingsCount(): Promise<number> {
  try {
    const result = await pb.collection('meetings').getList(1, 1);
    return result.totalItems;
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return 0;
  }
}

export async function getTodayMeetings(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pb.collection('meetings').getList(1, 1, {
      filter: `date = "${today}"`,
    });
    return result.totalItems;
  } catch (error) {
    console.error('Error fetching today meetings:', error);
    return 0;
  }
}

export async function getRecentMeetings(limit = 5) {
  try {
    const records = await pb.collection('meetings').getList(1, limit, {
      sort: '-created',
      expand: 'attendees',
    });
    return records.items;
  } catch (error) {
    console.error('Error fetching recent meetings:', error);
    return [];
  }
}