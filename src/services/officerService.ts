import pb from '@/lib/pocketbase';

export async function getOfficerCount(collectionName: string): Promise<number> {
  try {
    const result = await pb.collection(collectionName).getList(1, 1);
    return result.totalItems;
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return 0;
  }
}

export async function getOfficersByType(type: string) {
  try {
    const collectionName = type === 'ias' ? 'ias_officers' : 'ips_officers';
    const records = await pb.collection(collectionName).getFullList({
      sort: '-created',
    });
    return records;
  } catch (error) {
    console.error(`Error fetching ${type} officers:`, error);
    return [];
  }
}