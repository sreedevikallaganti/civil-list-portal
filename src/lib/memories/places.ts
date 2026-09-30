/**
 * Works out which city a meeting was in, from the free-text `location`
 * (or the optional `city` field when it's filled in).
 *
 *   "Collectorate, Warangal"          → Warangal
 *   "Dubai World Trade Centre"        → Dubai
 *   "Hitech City, Madhapur"           → Hyderabad
 *   "Conference Room A, New Delhi"    → Delhi
 *
 * Add your own places to EXTRA_PLACES below if something isn't recognised.
 */
import type { MemoryMeeting } from "@/lib/memories/meetingUtils";

/** Your own additions: "text that appears in the location" → "City name". */
export const EXTRA_PLACES: Record<string, string> = {
  // "brihaspathi office": "Hyderabad",
};

/* city → other ways it gets written (localities count as the city) */
const CITIES: Record<string, string[]> = {
  // Telangana
  Hyderabad: ["hyderabad", "secunderabad", "cyberabad", "hitech city", "hi-tech city", "hitec city", "gachibowli", "madhapur", "kondapur", "banjara hills", "jubilee hills", "begumpet", "somajiguda", "ameerpet", "lb nagar", "uppal", "kukatpally", "shamshabad", "nampally", "abids", "khairatabad", "rachakonda", "financial district", "nanakramguda", "raidurg", "kokapet", "tank bund"],
  Warangal: ["warangal", "hanamkonda", "hanumakonda", "kazipet"],
  Karimnagar: ["karimnagar"], Nizamabad: ["nizamabad"], Khammam: ["khammam"], Nalgonda: ["nalgonda"],
  Mahabubnagar: ["mahabubnagar", "mahbubnagar"], Adilabad: ["adilabad"], Siddipet: ["siddipet"], Medak: ["medak"],
  Sangareddy: ["sangareddy"], Suryapet: ["suryapet"], Jagtial: ["jagtial", "jagityal"], Peddapalli: ["peddapalli"],
  Kamareddy: ["kamareddy"], Mancherial: ["mancherial"], Nirmal: ["nirmal"], Vikarabad: ["vikarabad"],
  Wanaparthy: ["wanaparthy"], Jangaon: ["jangaon", "jangoan"], Bhupalpally: ["bhupalpally"], Kothagudem: ["kothagudem"],
  Bhadrachalam: ["bhadrachalam"], Miryalaguda: ["miryalaguda"], Ramagundam: ["ramagundam"], Mulugu: ["mulugu"],
  Nagarkurnool: ["nagarkurnool"], Gadwal: ["gadwal"], Narayanpet: ["narayanpet"], Mahabubabad: ["mahabubabad"],
  Yadadri: ["yadadri", "bhongir", "bhuvanagiri"], Sircilla: ["sircilla"], Asifabad: ["asifabad"],
  // Andhra Pradesh
  Vijayawada: ["vijayawada", "bezawada"], Visakhapatnam: ["visakhapatnam", "vizag", "vishakhapatnam"],
  Guntur: ["guntur"], Tirupati: ["tirupati", "tirumala"], Nellore: ["nellore"], Kurnool: ["kurnool"],
  Kakinada: ["kakinada"], Rajahmundry: ["rajahmundry", "rajamahendravaram"], Anantapur: ["anantapur", "anantapuramu"],
  Kadapa: ["kadapa", "cuddapah"], Eluru: ["eluru"], Ongole: ["ongole"], Srikakulam: ["srikakulam"],
  Vizianagaram: ["vizianagaram"], Amaravati: ["amaravati", "velagapudi"], Chittoor: ["chittoor"], Machilipatnam: ["machilipatnam"],
  // Rest of India
  Delhi: ["new delhi", "delhi", "north block", "south block", "rashtrapati bhavan"], Gurugram: ["gurugram", "gurgaon"], Noida: ["noida"],
  Mumbai: ["mumbai", "bombay", "navi mumbai"], Bengaluru: ["bengaluru", "bangalore"], Chennai: ["chennai", "madras"],
  Kolkata: ["kolkata", "calcutta"], Pune: ["pune"], Ahmedabad: ["ahmedabad"], Gandhinagar: ["gandhinagar"], Jaipur: ["jaipur"],
  Lucknow: ["lucknow"], Bhopal: ["bhopal"], Chandigarh: ["chandigarh"], Kochi: ["kochi", "cochin"],
  Thiruvananthapuram: ["thiruvananthapuram", "trivandrum"], Goa: ["goa", "panaji", "panjim"], Nagpur: ["nagpur"],
  Indore: ["indore"], Patna: ["patna"], Bhubaneswar: ["bhubaneswar"], Raipur: ["raipur"], Ranchi: ["ranchi"],
  Guwahati: ["guwahati"], Dehradun: ["dehradun"], Shimla: ["shimla"], Srinagar: ["srinagar"], Mysuru: ["mysuru", "mysore"],
  Coimbatore: ["coimbatore"], Madurai: ["madurai"], Surat: ["surat"], Varanasi: ["varanasi"],
  // Abroad
  Dubai: ["dubai"], "Abu Dhabi": ["abu dhabi"], Sharjah: ["sharjah"], Doha: ["doha"], Riyadh: ["riyadh"], Jeddah: ["jeddah"],
  Muscat: ["muscat"], "Kuwait City": ["kuwait"], Manama: ["manama", "bahrain"], Singapore: ["singapore"],
  "Kuala Lumpur": ["kuala lumpur"], Bangkok: ["bangkok"], "Hong Kong": ["hong kong"], Tokyo: ["tokyo"], Seoul: ["seoul"],
  Beijing: ["beijing"], Shanghai: ["shanghai"], London: ["london"], Paris: ["paris"], Berlin: ["berlin"],
  Frankfurt: ["frankfurt"], Amsterdam: ["amsterdam"], Zurich: ["zurich"], Geneva: ["geneva"], Rome: ["rome"],
  Madrid: ["madrid"], "New York": ["new york", "manhattan"], Washington: ["washington"], "San Francisco": ["san francisco"],
  Chicago: ["chicago"], "Los Angeles": ["los angeles"], Seattle: ["seattle"], Boston: ["boston"], Toronto: ["toronto"],
  Vancouver: ["vancouver"], Sydney: ["sydney"], Melbourne: ["melbourne"], Dhaka: ["dhaka"], Kathmandu: ["kathmandu"],
  Colombo: ["colombo"], "Malé": ["male, maldives", "maldives"],
};

/** Every city the matcher knows, for autocomplete. */
export const KNOWN_CITIES: string[] = Object.keys(CITIES).sort();

/* longest aliases first, so "new delhi" wins over "delhi" and "abu dhabi" over nothing */
const ALIASES: { re: RegExp; city: string }[] = Object.entries({
  ...Object.fromEntries(Object.entries(CITIES).flatMap(([city, list]) => list.map((a) => [a, city]))),
  ...Object.fromEntries(Object.entries(EXTRA_PLACES).map(([a, c]) => [a.toLowerCase(), c])),
})
  .sort((a, b) => b[0].length - a[0].length)
  .map(([alias, city]) => ({
    re: new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`),
    city,
  }));

export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** City of a free-text place, or "" if it can't tell. */
export function cityFromText(text?: string): string {
  const t = (text || "").toLowerCase().trim();
  if (!t) return "";
  // the place mentioned last wins ("Delhi Public School, Warangal" → Warangal)
  let best: { city: string; at: number } | null = null;
  for (const { re, city } of ALIASES) {
    const m = re.exec(t);
    if (m && (!best || m.index > best.at)) best = { city, at: m.index };
  }
  if (best) return best.city;

  // unknown place: "Something, Somewhere" → last part, if it looks like a place name
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].replace(/\b\d{6}\b/g, "").replace(/\b(india|uae|u\.a\.e)\b/g, "").trim();
    if (/^[a-z .'-]{3,30}$/.test(last)) return titleCase(last);
  }
  return "";
}

/** City of a meeting: the `city` field when set, otherwise read from the location. */
export function meetingCity(m: MemoryMeeting): string {
  if (m.city?.trim()) return cityFromText(m.city) || titleCase(m.city.trim());
  return cityFromText(m.location || m.meeting_place);
}
