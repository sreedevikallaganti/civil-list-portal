/* lib/associatesApi.ts — PocketBase calls for the Associates list (see lib/associates.ts).
   `org` is filled in by lib/tenancy.ts, like every other organisation-owned collection.
   Parallel calls pass requestKey: null — otherwise the SDK cancels all but the last. */

import pb from '@/lib/pocketbase';
import type { Associate, AssociateData, AssociateField, FieldInput } from '@/lib/associates';

export const ASSOCIATES = 'associates';
export const ASSOCIATE_FIELDS = 'associate_fields';

const once = { requestKey: null };

/** A PocketBase error as one readable sentence. */
export function errorText(err: unknown): string {
  const e = err as { status?: number; message?: string; response?: { data?: Record<string, { message?: string }> } };
  if (e?.status === 404) return 'This part of Associates is not set up on the server yet (a PocketBase collection is missing — see scripts/setup-associates.mjs).';
  if (e?.status === 403) return 'The server does not allow your account to see or change the Associates list (check the API rules of the associates / associate_fields collections).';
  const field = e?.response?.data && Object.entries(e.response.data)[0];
  if (field) return `${field[0]}: ${field[1]?.message || 'invalid value'}`;
  return e?.message || 'Something went wrong';
}

export async function listFields(): Promise<AssociateField[]> {
  return pb.collection(ASSOCIATE_FIELDS).getFullList<AssociateField>({ sort: 'sort_order,created', ...once });
}

export async function createField(input: FieldInput): Promise<AssociateField> {
  return pb.collection(ASSOCIATE_FIELDS).create<AssociateField>(input, once);
}

export async function updateField(id: string, patch: Partial<FieldInput>): Promise<AssociateField> {
  return pb.collection(ASSOCIATE_FIELDS).update<AssociateField>(id, patch, once);
}

export async function deleteField(id: string): Promise<void> {
  await pb.collection(ASSOCIATE_FIELDS).delete(id, once);
}

export async function listAssociates(): Promise<Associate[]> {
  return pb.collection(ASSOCIATES).getFullList<Associate>({ sort: 'name', batch: 500, ...once });
}

export async function createAssociate(name: string, data: AssociateData): Promise<Associate> {
  return pb.collection(ASSOCIATES).create<Associate>({ name, data }, once);
}

export async function updateAssociate(id: string, name: string, data: AssociateData): Promise<Associate> {
  return pb.collection(ASSOCIATES).update<Associate>(id, { name, data }, once);
}

export async function deleteAssociate(id: string): Promise<void> {
  await pb.collection(ASSOCIATES).delete(id, once);
}

/**
 * Runs `work` over `items`, a few at a time, never throwing:
 * returns which items failed and why. `onProgress(done, total)` after each one.
 */
export async function runPool<T>(
  items: T[],
  work: (item: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<{ item: T; error: string }[]> {
  const failed: { item: T; error: string }[] = [];
  let next = 0;
  let done = 0;
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      try { await work(item); } catch (err) { failed.push({ item, error: errorText(err) }); }
      onProgress?.(++done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return failed;
}

/** Deleting a field also clears its values, so a new field with the same name starts empty. */
export async function deleteFieldAndValues(field: AssociateField, people: Associate[]) {
  const holders = people.filter((a) => a.data && field.key in a.data);
  const failed = await runPool(holders, (a) => {
    const rest = { ...(a.data || {}) };
    delete rest[field.key];
    return updateAssociate(a.id, a.name, rest);
  });
  if (failed.length) throw new Error(`Could not clear ${field.label} from ${failed.length} people — try again.`);
  await deleteField(field.id);
}
