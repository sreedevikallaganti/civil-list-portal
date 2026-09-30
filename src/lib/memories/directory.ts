/**
 * "Also in your directory" — people you haven't met there yet, but who are based in that city:
 *   • other_contacts whose address / organisation mentions the city
 *   • IAS / IPS officers whose current position mentions the city
 * Read-only queries on your existing collections.
 */
import pb from "@/lib/pocketbase";

export type DirectoryPerson = {
  id: string;
  name: string;
  role: string; // designation / current position
  org: string;
  kind: "IAS" | "IPS" | "Contact";
  phone: string;
  email: string;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/* same escaping the Officers page uses for its search filter */
const esc = (q: string) => q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

async function safeList(collection: string, filter: string): Promise<Row[]> {
  try {
    const res = await pb.collection(collection).getList(1, 20, { filter, sort: "name" });
    return res.items as unknown as Row[];
  } catch {
    return []; // collection or field missing — just skip it
  }
}

export async function findInDirectory(city: string): Promise<DirectoryPerson[]> {
  const q = esc(city.trim());
  if (!q) return [];

  const [contacts, ias, ips] = await Promise.all([
    safeList("other_contacts", `address ~ "${q}" || organization ~ "${q}"`),
    safeList("ias_officers", `current_position ~ "${q}"`),
    safeList("ips_officers", `current_position ~ "${q}"`),
  ]);

  return [
    ...ias.map((o) => ({ o, kind: "IAS" as const })),
    ...ips.map((o) => ({ o, kind: "IPS" as const })),
    ...contacts.map((o) => ({ o, kind: "Contact" as const })),
  ].map(({ o, kind }) => ({
    id: str(o.id),
    name: str(o.name) || "Unknown",
    role: str(o.current_position) || str(o.designation),
    org: kind === "Contact" ? str(o.organization) || str(o.company_name) : str(o.cadre),
    kind,
    phone: str(o.contact_number) || str(o.phone) || str(o.mobile),
    email: str(o.email),
  }));
}
