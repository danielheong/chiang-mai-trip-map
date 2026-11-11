// Walking and driving times between a day's stops, plus a road-following line to draw.
// Uses the free OpenStreetMap routing servers (routing.openstreetmap.de, fair use).
// Results are cached in memory and in localStorage, so a planned day still shows offline.
const LS = 'cm-trip-map-routes';
const MAX_SAVED = 14;
const mem = new Map();          // key -> { state: 'loading'|'done'|'error', legs, line, at }
let saved = {};
try { saved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { saved = {}; }

const keyOf = stops => stops.map(p => `${(+p.lat).toFixed(5)},${(+p.lng).toFixed(5)}`).join(';');

async function osrm(profile, name, stops, full) {
  const coords = stops.map(p => `${(+p.lng).toFixed(6)},${(+p.lat).toFixed(6)}`).join(';');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`https://routing.openstreetmap.de/${profile}/route/v1/${name}/${coords}?overview=${full ? 'full&geometries=geojson' : 'false'}`, { signal: ctl.signal });
    const d = await res.json();
    if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error(d.code || 'no route');
    return d.routes[0];
  } finally { clearTimeout(t); }
}

// Returns the route if it is known, otherwise null (and fetches it; onReady fires when it arrives).
export function routeFor(stops, onReady) {
  if (!stops || stops.length < 2) return null;
  const key = keyOf(stops);
  const m = mem.get(key);
  if (m) {
    if (m.state === 'done') return m;
    if (m.state === 'loading' || Date.now() - m.at < 60000) return null;
  }
  if (saved[key]) { const r = { state: 'done', ...saved[key] }; mem.set(key, r); return r; }
  mem.set(key, { state: 'loading', at: Date.now() });
  Promise.all([osrm('routed-foot', 'foot', stops, false), osrm('routed-car', 'driving', stops, true)]).then(([foot, car]) => {
    const legs = car.legs.map((c, i) => ({ walkM: Math.round(foot.legs[i].distance), walkMin: Math.max(1, Math.round(foot.legs[i].duration / 60)), driveM: Math.round(c.distance), driveMin: Math.max(1, Math.round(c.duration / 60)) }));
    const line = car.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]);
    const r = { state: 'done', legs, line, at: Date.now() };
    mem.set(key, r);
    saved[key] = { legs, line, at: r.at };
    const keys = Object.keys(saved).sort((a, b) => saved[b].at - saved[a].at);
    for (const k of keys.slice(MAX_SAVED)) delete saved[k];
    try { localStorage.setItem(LS, JSON.stringify(saved)); } catch {}
    onReady?.();
  }).catch(() => { mem.set(key, { state: 'error', at: Date.now() }); });
  return null;
}

// Short hops are shown as a walk, longer ones as a drive (songthaew, Grab, scooter).
export const WALK_MAX_M = 1300;
export function legText(leg) {
  if (!leg) return '';
  const dist = m => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(1)} km`);
  return leg.walkM <= WALK_MAX_M ? `${leg.walkMin} min walk · ${dist(leg.walkM)}` : `${leg.driveMin} min drive · ${dist(leg.driveM)}`;
}
export function totalText(legs) {
  if (!legs?.length) return '';
  const mins = legs.reduce((s, l) => s + (l.walkM <= WALK_MAX_M ? l.walkMin : l.driveMin), 0);
  return mins < 60 ? `about ${mins} min getting around` : `about ${Math.floor(mins / 60)} h ${mins % 60} min getting around`;
}
