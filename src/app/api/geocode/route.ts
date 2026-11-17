// app/api/geocode/route.ts — coordinates for place names the Meeting Map doesn't know yet.
// Looks each name up ONCE on OpenStreetMap (Nominatim) and keeps the answer in
// .geocode-cache.json, so the same place is never looked up twice. Nominatim's usage policy
// allows at most one request per second with an identifying User-Agent — both are respected.
// Only place names are sent (e.g. "Warangal"), never meeting details.
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

type Coords = [number, number] | null;
const CACHE_FILE = path.join(process.cwd(), '.geocode-cache.json');
const MAX_PER_REQUEST = 10;

function readCache(): Record<string, Coords> {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}

let lastCall = 0;
async function lookup(name: string): Promise<Coords> {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Civillist-Meetings/0.1 (meeting map)', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Place search answered ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? [Number(hit.lat), Number(hit.lon)] : null;
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;

  const { names } = await req.json().catch(() => ({ names: [] }));
  const wanted = [...new Set((Array.isArray(names) ? names : []).map((n) => String(n).trim()).filter(Boolean))].slice(0, MAX_PER_REQUEST);

  const cache = readCache();
  const out: Record<string, Coords> = {};
  let changed = false;
  for (const name of wanted) {
    const key = name.toLowerCase();
    if (key in cache) { out[name] = cache[key]; continue; }
    try {
      out[name] = cache[key] = await lookup(name);
      changed = true;
    } catch {
      out[name] = null; // not cached — tried again next time
    }
  }
  if (changed) {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch { /* read-only disk: still answer */ }
  }
  return NextResponse.json({ coords: out });
}
