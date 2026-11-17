// lib/geo.ts — where meetings happen, for the Meeting Map.
//
// A meeting's place comes from its City field, else its Location text (lib/memories/places);
// "Office" meetings with neither count as the home city. Coordinates come from the table
// below; any other place name is looked up once through /api/geocode (OpenStreetMap) and cached.

import { cityFromText, meetingCity, titleCase } from '@/lib/memories/places';
import { cityLabel, HOME_CITY } from '@/lib/cities';

export type LatLng = [number, number];

/** City → [latitude, longitude]. Names match lib/memories/places (e.g. "Delhi", not "New Delhi"). */
export const CITY_COORDS: Record<string, LatLng> = {
  // Telangana
  Hyderabad: [17.385, 78.4867], Warangal: [17.9689, 79.5941], Karimnagar: [18.4386, 79.1288], Nizamabad: [18.6725, 78.0941],
  Khammam: [17.2473, 80.1514], Nalgonda: [17.0575, 79.2684], Mahabubnagar: [16.7488, 78.0035], Adilabad: [19.6641, 78.532],
  Siddipet: [18.1018, 78.852], Medak: [18.0453, 78.2608], Sangareddy: [17.6248, 78.0863], Suryapet: [17.1405, 79.6209],
  Jagtial: [18.7895, 78.912], Peddapalli: [18.6136, 79.3743], Kamareddy: [18.3207, 78.342], Mancherial: [18.8714, 79.4443],
  Nirmal: [19.0964, 78.3441], Vikarabad: [17.3381, 77.9044], Wanaparthy: [16.3623, 78.0622], Jangaon: [17.7262, 79.1518],
  Bhupalpally: [18.4386, 79.8664], Kothagudem: [17.5511, 80.6197], Bhadrachalam: [17.6688, 80.8936], Miryalaguda: [16.8722, 79.5625],
  Ramagundam: [18.755, 79.474], Mulugu: [18.191, 79.943], Nagarkurnool: [16.4821, 78.3247], Gadwal: [16.235, 77.7956],
  Narayanpet: [16.7445, 77.496], Mahabubabad: [17.598, 80.002], Yadadri: [17.51, 78.889], Sircilla: [18.386, 78.81],
  Asifabad: [19.365, 79.284],
  // Andhra Pradesh
  Vijayawada: [16.5062, 80.648], Visakhapatnam: [17.6868, 83.2185], Guntur: [16.3067, 80.4365], Tirupati: [13.6288, 79.4192],
  Nellore: [14.4426, 79.9865], Kurnool: [15.8281, 78.0373], Kakinada: [16.9891, 82.2475], Rajahmundry: [17.0005, 81.804],
  Anantapur: [14.6819, 77.6006], Kadapa: [14.4673, 78.8242], Eluru: [16.7107, 81.0952], Ongole: [15.5057, 80.0499],
  Srikakulam: [18.2949, 83.8938], Vizianagaram: [18.1067, 83.3956], Amaravati: [16.5131, 80.5165], Chittoor: [13.2172, 79.1003],
  Machilipatnam: [16.1875, 81.1389],
  // Rest of India
  Delhi: [28.6139, 77.209], Gurugram: [28.4595, 77.0266], Noida: [28.5355, 77.391], Mumbai: [19.076, 72.8777],
  Bengaluru: [12.9716, 77.5946], Chennai: [13.0827, 80.2707], Kolkata: [22.5726, 88.3639], Pune: [18.5204, 73.8567],
  Ahmedabad: [23.0225, 72.5714], Gandhinagar: [23.2156, 72.6369], Jaipur: [26.9124, 75.7873], Lucknow: [26.8467, 80.9462],
  Bhopal: [23.2599, 77.4126], Chandigarh: [30.7333, 76.7794], Kochi: [9.9312, 76.2673], Thiruvananthapuram: [8.5241, 76.9366],
  Goa: [15.4909, 73.8278], Nagpur: [21.1458, 79.0882], Indore: [22.7196, 75.8577], Patna: [25.5941, 85.1376],
  Bhubaneswar: [20.2961, 85.8245], Raipur: [21.2514, 81.6296], Ranchi: [23.3441, 85.3096], Guwahati: [26.1445, 91.7362],
  Dehradun: [30.3165, 78.0322], Shimla: [31.1048, 77.1734], Srinagar: [34.0837, 74.7973], Mysuru: [12.2958, 76.6394],
  Coimbatore: [11.0168, 76.9558], Madurai: [9.9252, 78.1198], Surat: [21.1702, 72.8311], Varanasi: [25.3176, 82.9739],
  // Abroad
  Dubai: [25.2048, 55.2708], 'Abu Dhabi': [24.4539, 54.3773], Sharjah: [25.3463, 55.4209], Doha: [25.2854, 51.531],
  Riyadh: [24.7136, 46.6753], Jeddah: [21.4858, 39.1925], Muscat: [23.588, 58.3829], 'Kuwait City': [29.3759, 47.9774],
  Manama: [26.2285, 50.586], Singapore: [1.3521, 103.8198], 'Kuala Lumpur': [3.139, 101.6869], Bangkok: [13.7563, 100.5018],
  'Hong Kong': [22.3193, 114.1694], Tokyo: [35.6762, 139.6503], Seoul: [37.5665, 126.978], Beijing: [39.9042, 116.4074],
  Shanghai: [31.2304, 121.4737], London: [51.5072, -0.1276], Paris: [48.8566, 2.3522], Berlin: [52.52, 13.405],
  Frankfurt: [50.1109, 8.6821], Amsterdam: [52.3676, 4.9041], Zurich: [47.3769, 8.5417], Geneva: [46.2044, 6.1432],
  Rome: [41.9028, 12.4964], Madrid: [40.4168, -3.7038], 'New York': [40.7128, -74.006], Washington: [38.9072, -77.0369],
  'San Francisco': [37.7749, -122.4194], Chicago: [41.8781, -87.6298], 'Los Angeles': [34.0522, -118.2437],
  Seattle: [47.6062, -122.3321], Boston: [42.3601, -71.0589], Toronto: [43.6532, -79.3832], Vancouver: [49.2827, -123.1207],
  Sydney: [-33.8688, 151.2093], Melbourne: [-37.8136, 144.9631], Dhaka: [23.8103, 90.4125], Kathmandu: [27.7172, 85.324],
  Colombo: [6.9271, 79.8612], 'Malé': [4.1755, 73.5093],
};

/** Home city as the places module names it ("Hyderabad"). */
export const HOME_PLACE = cityFromText(cityLabel(HOME_CITY)) || titleCase(cityLabel(HOME_CITY));

type M = { id: string; city?: string; location?: string; meeting_place?: string; [k: string]: any };

/** City a meeting took place in; office meetings without a city/location → home city; '' when unknown. */
export function placeOf(m: M): string {
  const c = meetingCity(m as any);
  if (c) return c;
  const office = /office|board ?room|conference room|chamber|head ?quarters|hq/i;
  if (office.test(String(m.meeting_place || '')) || office.test(String(m.location || ''))) return HOME_PLACE;
  return '';
}

export type PlaceStat = {
  city: string;
  coords: LatLng | null;
  meetings: number;   // meetings held / planned there
  visits: number;     // distinct days spent there (a 3-day trip with 5 meetings = 3 visits)
  people: string[];   // most-met people there, most frequent first
  first: string;      // ISO date
  last: string;       // ISO date (most recent, may be upcoming)
  ids: string[];
  isHome: boolean;
};

/** Group meetings by city — sorted by visit days, then meetings. Unplaced meetings are counted apart. */
export function placeStats(meetings: M[], coords: Record<string, LatLng>): { places: PlaceStat[]; unplaced: M[] } {
  const by = new Map<string, { list: M[]; days: Set<string>; people: Map<string, number> }>();
  const unplaced: M[] = [];
  for (const m of meetings) {
    const city = placeOf(m);
    if (!city) { unplaced.push(m); continue; }
    const day = String(m.meeting_date || '').slice(0, 10);
    const g = by.get(city) ?? { list: [], days: new Set<string>(), people: new Map<string, number>() };
    g.list.push(m);
    if (day) g.days.add(day);
    const who = String(m.officer_name || '').trim();
    if (who) g.people.set(who, (g.people.get(who) ?? 0) + 1);
    by.set(city, g);
  }
  const places = [...by.entries()].map(([city, g]): PlaceStat => {
    const days = [...g.days].sort();
    return {
      city,
      coords: coords[city] ?? CITY_COORDS[city] ?? null,
      meetings: g.list.length,
      visits: g.days.size,
      people: [...g.people.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      first: days[0] ?? '',
      last: days[days.length - 1] ?? '',
      ids: g.list.map((m) => m.id),
      isHome: city === HOME_PLACE,
    };
  });
  places.sort((a, b) => b.visits - a.visits || b.meetings - a.meetings || a.city.localeCompare(b.city));
  return { places, unplaced };
}
