/* lib/batchmatesData.ts — the PocketBase reads behind the Batchmates card (browser side).
   Filtering happens in PocketBase: each directory collection has thousands of rows, so we never
   download the whole collection — only one batch year. Rules: lib/batchmates.ts */

import pb from '@/lib/pocketbase';
import { normBatch, toBatchOfficer, type BatchOfficer, type Service } from '@/lib/batchmates';
import { OFFICER_COLLECTION, OFFICER_SERVICES } from '@/lib/officerDirectory';

const COLLECTION: Record<Service, string> = OFFICER_COLLECTION;
const OFFICER_FIELDS = 'id,name,service,batch,cadre,designation,department';
/* enough for "met before" — no contact details, minutes or documents */
export const MEETING_FIELDS = 'id,officer_id,officer_name,officer_type,email,designation,current_position,participants,attendees,meeting_date,meeting_time,status,deleted,city,location,address,agenda';

/** Every IAS / IPS / IFS / IRS officer of one batch year. A missing collection just gives no rows. */
export async function loadBatchOfficers(batch: string, services: Service[] = [...OFFICER_SERVICES]): Promise<BatchOfficer[]> {
  const year = Number(normBatch(batch));
  if (!year) return [];
  const lists = await Promise.all(services.map((service) =>
    pb.collection(COLLECTION[service])
      .getFullList({ filter: `batch = ${year}`, sort: 'name', fields: OFFICER_FIELDS, batch: 500, requestKey: null })
      .then((rows) => rows.map((r: any) => toBatchOfficer(r, service)))
      .catch(() => [] as BatchOfficer[])));
  return lists.flat();
}

/** All meetings, trimmed to the fields "met before" needs. */
export function loadMeetingsForHistory(): Promise<any[]> {
  return pb.collection('meetings').getFullList({ fields: MEETING_FIELDS, batch: 500, requestKey: null });
}

/** "IAS:abc123" — the key the Meetings page deep links use for a directory person. */
export const personRef = (o: Pick<BatchOfficer, 'service' | 'id'>) => `${o.service}:${o.id}`;

/** Link that opens a New Meeting with one batchmate (existing ?person= deep link). */
export function scheduleOneHref(o: BatchOfficer, where: { city?: string; date?: string } = {}) {
  const q = new URLSearchParams({ person: personRef(o) });
  if (where.city) q.set('city', where.city);
  if (where.date) q.set('date', where.date);
  return `/meetings?${q}`;
}

/** Link that opens ONE New Meeting with several batchmates (?batch= deep link, see the Meetings page). */
export function batchMeetHref(people: BatchOfficer[], opts: { batch: string; mode: 'online' | 'offline'; city?: string }) {
  const q = new URLSearchParams({
    batch: people.map(personRef).join(','),
    year: normBatch(opts.batch),
    mode: opts.mode,
  });
  if (opts.city) q.set('city', opts.city);
  return `/meetings?${q}`;
}
