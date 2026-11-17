'use client';

/* LeafletMap — circles on a light map, one per city, sized by visit days.
   Leaflet touches `window`, so it is imported inside an effect (browser only).
   The wrapper is its own stacking context (isolate) so Leaflet's high z-indexes never
   cover the sidebar, drawers or tooltips. */

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LMap, LayerGroup } from 'leaflet';
import type { PlaceStat } from '@/lib/geo';

type Props = {
  places: PlaceStat[];
  selected: string | null;
  onSelect: (city: string) => void;
};

const VIOLET = '#7c3aed';
const INK = '#0f172a';

export default function LeafletMap({ places, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const onSelectRef = useRef(onSelect);

  /* (re)draw the circles; `fit` zooms the map to show them all */
  const draw = (fit = false) => {
    const leaflet = L.current;
    if (!leaflet || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const placed = places.filter((p) => p.coords);
    const max = Math.max(1, ...placed.map((p) => p.visits || p.meetings));
    for (const p of placed) {
      const weight = p.visits || p.meetings;
      const isSel = p.city === selected;
      const color = p.isHome ? INK : VIOLET;
      const circle = leaflet.circleMarker(p.coords!, {
        radius: 7 + 19 * Math.sqrt(weight / max),
        color: isSel ? '#f59e0b' : '#ffffff',
        weight: isSel ? 3 : 2,
        fillColor: color,
        fillOpacity: isSel ? 0.9 : 0.72,
      });
      circle.bindTooltip(
        `<b>${p.city}</b>${p.isHome ? ' · home' : ''}<br>${p.visits} visit day${p.visits === 1 ? '' : 's'} · ${p.meetings} meeting${p.meetings === 1 ? '' : 's'}`,
        { direction: 'top', offset: [0, -6], className: 'cl-map-tip' },
      );
      circle.on('click', () => onSelectRef.current(p.city));
      circle.addTo(layer.current);
    }
    if (fit && placed.length) {
      const bounds = leaflet.latLngBounds(placed.map((p) => p.coords!));
      map.current.fitBounds(bounds.pad(0.35), { maxZoom: 6 });
    }
  };

  // latest draw / onSelect for code that runs later (the async map setup, Leaflet click handlers)
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    onSelectRef.current = onSelect;
  });

  /* create the map once */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import('leaflet');
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: true, minZoom: 2 })
        .setView([22.5, 79], 5);
      // OpenStreetMap's own tiles: free, no API key, attribution required (CARTO now needs a key)
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: 'cl-map-tiles',
      }).addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      drawRef.current(true); // the data may have arrived before the map finished loading
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => { draw(true); /* new data → refit */ }, [places]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    draw(false);
    const p = places.find((x) => x.city === selected);
    if (p?.coords && map.current) map.current.flyTo(p.coords, Math.max(map.current.getZoom(), 6), { duration: 0.6 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative isolate h-full min-h-[420px] w-full overflow-hidden rounded-2xl">
      <style>{`
        .cl-map-tip { background: rgba(15,23,42,.95); color: #fff; border: 0; border-radius: 10px; padding: 6px 10px;
          font: 500 12px/1.45 inherit; box-shadow: 0 10px 25px -10px rgba(15,23,42,.4); }
        .cl-map-tip::before { display: none; }
        .leaflet-container { font-family: inherit; background: #eef0f6; }
        /* soften OSM's busy colours into a light, muted base so the meeting circles stand out */
        .cl-map-tiles { filter: grayscale(0.85) brightness(1.06) contrast(0.92); }
      `}</style>
      <div ref={el} className="absolute inset-0" aria-label="Map of meeting places" role="application" />
    </div>
  );
}
