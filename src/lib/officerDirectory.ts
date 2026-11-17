/* lib/officerDirectory.ts — the officers directory: IAS, IPS, IFS and IRS officers.

   Each service has its own PocketBase collection (loaded from the civil lists by
   scripts/import-officer-directory.mjs):
     ias_directory · ips_directory · ifs_directory · irs_directory (IRS (IT) + IRS (C&IT), see `service`)

   Directory records store  batch / designation / department / cadre / contact_number.
   Most screens were written for the older shape (batch_year, current_position, state),
   so `toDirectoryOfficer` adds those as aliases — read records through it, and filter
   with the directory field names (`batch`, `designation`, …). */

export const OFFICER_SERVICES = ['IAS', 'IPS', 'IFS', 'IRS'] as const;
export type OfficerService = (typeof OFFICER_SERVICES)[number];

export const OFFICER_COLLECTION: Record<OfficerService, string> = {
  IAS: 'ias_directory',
  IPS: 'ips_directory',
  IFS: 'ifs_directory',
  IRS: 'irs_directory',
};

export const OFFICER_COLLECTIONS = OFFICER_SERVICES.map((s) => OFFICER_COLLECTION[s]);

export const SERVICE_FULL_NAME: Record<OfficerService, string> = {
  IAS: 'Indian Administrative Service',
  IPS: 'Indian Police Service',
  IFS: 'Indian Forest Service',
  IRS: 'Indian Revenue Service',
};

/** Fields worth searching in a directory collection. */
export const OFFICER_SEARCH_FIELDS = ['name', 'officer_id', 'designation', 'department', 'cadre', 'email'];

/** Statuses a directory record can have. */
export const OFFICER_STATUSES = ['Serving', 'On Deputation', 'Under Training', 'Awaiting Posting', 'Under Suspension', 'Retired'];

/* ── cadres ──
   IPS / IFS records store the cadre as a name ("Tamil Nadu"); IAS records (DoPT civil list) store a code ("TN").
   IRS officers have no cadre. */

/** Every cadre, by name (AGMUT = Arunachal Pradesh-Goa-Mizoram-Union Territories, incl. Delhi). */
export const CADRES = [
  'AGMUT', 'Andhra Pradesh', 'Assam-Meghalaya', 'Bihar', 'Chhattisgarh', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

/** IAS cadre codes → cadre name. */
const IAS_CADRE_CODE: Record<string, string> = {
  UT: 'AGMUT', AM: 'Assam-Meghalaya', AP: 'Andhra Pradesh', BH: 'Bihar', CG: 'Chhattisgarh', GJ: 'Gujarat',
  HP: 'Himachal Pradesh', HY: 'Haryana', JH: 'Jharkhand', KL: 'Kerala', KN: 'Karnataka', MH: 'Maharashtra',
  MN: 'Manipur', MP: 'Madhya Pradesh', NL: 'Nagaland', OD: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim',
  TG: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UD: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
};
/** older hand-entered values that belong to a cadre */
const CADRE_ALIASES: Record<string, string[]> = { AGMUT: ['Delhi'] };

/** "TN" / "Tamil Nadu" / "tamil nadu" → "Tamil Nadu" (unknown values come back trimmed). */
export function cadreName(raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (IAS_CADRE_CODE[v.toUpperCase()]) return IAS_CADRE_CODE[v.toUpperCase()];
  const named = CADRES.find((c) => c.toLowerCase() === v.toLowerCase());
  if (named) return named;
  const alias = Object.entries(CADRE_ALIASES).find(([, list]) => list.some((a) => a.toLowerCase() === v.toLowerCase()));
  return alias ? alias[0] : v;
}

/** PocketBase filter matching one cadre in any service: name, IAS code and old aliases. */
export function cadreFilter(name: string): string {
  const values = [name, ...Object.entries(IAS_CADRE_CODE).filter(([, n]) => n === name).map(([code]) => code), ...(CADRE_ALIASES[name] ?? [])];
  return `(${values.map((v) => `cadre = "${pbQuote(v)}"`).join(' || ')})`;
}

const isService = (v: string): v is OfficerService => (OFFICER_SERVICES as readonly string[]).includes(v);

/** "IAS", "ias", "IAS Officer", "IRS (IT)", "IRS (C&IT)" → the service; anything else (Other, Employee…) → null. */
export function serviceOf(type: unknown): OfficerService | null {
  const m = /\b(IAS|IPS|IFS|IRS)\b/.exec(String(type ?? '').toUpperCase());
  return m && isService(m[1]) ? m[1] : null;
}

/** The directory collection for a meeting's officer_type / a record type ('' for non-officers). */
export const collectionOf = (type: unknown) => {
  const s = serviceOf(type);
  return s ? OFFICER_COLLECTION[s] : '';
};

/** The service a directory collection holds (null for any other collection). */
export function serviceOfCollection(collection: string): OfficerService | null {
  return OFFICER_SERVICES.find((s) => OFFICER_COLLECTION[s] === collection) ?? null;
}

/** "Collector, District Madurai" from designation + department (no repeats, no blanks). */
export function positionOf(o: { designation?: unknown; department?: unknown; current_position?: unknown }): string {
  const d = String(o.designation ?? '').trim();
  const dep = String(o.department ?? '').trim();
  if (!d && !dep) return String(o.current_position ?? '').trim();
  if (!dep || d.toLowerCase().includes(dep.toLowerCase())) return d;
  if (!d) return dep;
  return `${d}, ${dep}`;
}

/** A directory record with the aliases older screens read: type, batch_year, current_position, state. */
export function toDirectoryOfficer<T extends Record<string, any>>(rec: T, service?: OfficerService) {
  const svc = service ?? serviceOf(rec.service) ?? serviceOfCollection(String(rec.collectionName ?? '')) ?? 'IAS';
  return {
    ...rec,
    type: svc,
    service: rec.service || svc,
    batch_year: rec.batch_year ?? rec.batch ?? null,
    current_position: positionOf(rec),
    // IAS codes ("TN") shown as names ("Tamil Nadu") like the other services
    cadre: cadreName(rec.cadre),
    state: rec.state ?? cadreName(rec.cadre),
  };
}

/** The other way round: form values in the older shape → a directory record. */
export function fromOfficerForm(values: Record<string, any>, service: OfficerService) {
  const out: Record<string, any> = { ...values };
  if (out.batch == null && out.batch_year != null && out.batch_year !== '') out.batch = Number(out.batch_year) || null;
  if (!out.designation && out.current_position) out.designation = out.current_position;
  if (!out.cadre && out.state) out.cadre = out.state;
  if (!out.service || !String(out.service).toUpperCase().startsWith(service)) out.service = service === 'IRS' ? 'IRS (IT)' : service;
  for (const k of ['batch_year', 'current_position', 'state', 'type']) delete out[k];
  return out;
}

/** Escape a value for a PocketBase filter string. */
export const pbQuote = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** `(name ~ "q" || officer_id ~ "q" || …)` over the searchable directory fields.
    A state / cadre name ("tamil", "West Bengal") also matches IAS officers, whose cadre is stored as a code. */
export function officerSearchFilter(q: string) {
  const parts = OFFICER_SEARCH_FIELDS.map((f) => `${f} ~ "${pbQuote(q)}"`);
  const needle = q.trim().toLowerCase();
  if (needle.length >= 3) {
    for (const c of CADRES) if (c.toLowerCase().includes(needle)) parts.push(cadreFilter(c));
  }
  return `(${parts.join(' || ')})`;
}
