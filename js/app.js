// Chiang Mai Trip Map — main app.
// Map: Leaflet + CARTO basemap tiles (OpenStreetMap data).
// Search: built-in list (instant) + Photon geocoder (OpenStreetMap) + pasted Google Maps links/coordinates.
// Storage: localStorage, with export/import to a JSON file.
import { CATS, CAT_KEYS, IDEAS, DIR, AREAS, DECOR, EXTRA_ICONS } from './data.js?v=202611080103';
import { watercolorStyle } from './mapstyle.js?v=202611080103';
import * as sync from './sync.js?v=202611080103';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202611080103';

const L = window.L;
const CENTER = [18.7883, 98.9853];
const STORAGE_KEY = 'cm-trip-map-places';
const SEEDED_KEY = 'cm-trip-map-seeded';

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = c => `var(--c-${c})`;
const artSVG = (c, cls = '') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><g filter="url(#wc)">${(CATS[c] || CATS.other).art}</g></svg>`;
const dotHTML = c => `<span class="dot" style="background:${col(c)}">${artSVG(c)}</span>`;
// A pin can override its category icon (p.icon): any category icon or an extra one.
const ICONS = { ...Object.fromEntries(Object.keys(CATS).map(c => [c, { label: CATS[c].short || CATS[c].label, art: CATS[c].art }])), ...EXTRA_ICONS };
const artOf = p => (p && p.icon && ICONS[p.icon] ? ICONS[p.icon].art : (CATS[p?.cat] || CATS.other).art);
const svgArt = (art, cls = '') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><g filter="url(#wc)">${art}</g></svg>`;
const dotFor = p => `<span class="dot" style="background:${col(p.cat)}">${svgArt(artOf(p))}</span>`;
const PRICE = ['', '฿', '฿฿', '฿฿฿', '฿฿฿฿'];
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Open/closed in Chiang Mai time (UTC+7), from the hours you entered.
function openStatus(p) {
  const h = p.hours; if (!h) return null;
  const now = new Date(Date.now() + 7 * 3600e3), dow = now.getUTCDay(), mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toM = t => t ? +t.slice(0, 2) * 60 + +t.slice(3) : null;
  const o = toM(h.open), c = toM(h.close);
  if (h.closed.includes(dow) && !(o != null && c != null && c < o && mins < c)) return { open: false, text: 'Closed today' };
  if (o == null || c == null) return h.closed.length ? { open: null, text: `Closed ${h.closed.map(d => DAYNAMES[d]).join(', ')}` } : null;
  const open = c > o ? mins >= o && mins < c : mins >= o || mins < c;
  if (open) { const left = (c - mins + 1440) % 1440; return { open: true, text: left <= 60 ? `Open · closes soon (${h.close})` : `Open now · until ${h.close}` }; }
  return { open: false, text: `Closed · opens ${h.open}` };
}
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isMobile = () => window.matchMedia('(max-width:860px)').matches;
function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

/* ---------- state ---------- */
let places = [];
// View-only mode: opened from a share link (#view=CODE). Pins come from the trip, nothing is saved.
const VIEW_CODE = (location.hash.match(/^#view=([A-Za-z0-9-]{16,40})$/) || [])[1]?.replace(/-/g, '') || '';
const viewOnly = !!VIEW_CODE;
if (viewOnly) document.documentElement.classList.add('viewonly');
let mode = 'browse';            // browse | adding
let view = { kind: 'list' };    // list | edit | preview {item}
let draft = null;
let filters = new Set(CAT_KEYS);
let tagFilter = new Set();      // lower-cased tags; empty = show all
let listMode = 'type';          // type | near | days
let hideVisited = false;
let dayFocus = null;            // a day number to show only that day's stops (and its route)
let me = null;                  // { lat, lng, acc } from the phone's location
let showIdeas = false;   // built-in suggestions are opt-in (Ideas button), to keep the map calm
const hasTagMatch = p => !tagFilter.size || (p.tags || []).some(t => tagFilter.has(t.toLowerCase()));
const visible = p => filters.has(p.cat) && hasTagMatch(p) && !(hideVisited && p.visited) && (dayFocus == null || p.day === dayFocus);
let bounceId = null;

/* ---------- storage ---------- */
function load() {
  try { places = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { places = []; }
  if (!Array.isArray(places)) places = [];
  places = places.map(cleanPlace).filter(Boolean);   // fills in fields added later (tags, updatedAt)
}
function persist() {
  if (viewOnly) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); }
  catch { toast('Couldn’t save in this browser. Use Export to keep a copy.'); }
  sync.schedule();
}
async function seedOnFirstVisit() {
  let seeded = false;
  try { seeded = localStorage.getItem(SEEDED_KEY) === '1'; } catch {}
  if (seeded || places.length) return;
  try {
    const res = await fetch('data/seed-pins.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.places;
      if (Array.isArray(list)) { places = list.map(cleanPlace).filter(Boolean); persist(); }
    }
  } catch {}
  try { localStorage.setItem(SEEDED_KEY, '1'); } catch {}
}
function cleanPlace(p) {
  if (!p || typeof p.name !== 'string' || !isFinite(+p.lat) || !isFinite(+p.lng)) return null;
  return {
    id: typeof p.id === 'string' && p.id ? p.id : newId(),
    name: p.name.slice(0, 80), cat: CATS[p.cat] ? p.cat : 'other', note: typeof p.note === 'string' ? p.note.slice(0, 2000) : '',
    fav: !!p.fav, exact: !!p.exact, lat: +(+p.lat).toFixed(6), lng: +(+p.lng).toFixed(6),
    ideaId: typeof p.ideaId === 'string' ? p.ideaId : null, createdAt: +p.createdAt || Date.now(),
    tags: cleanTags(p.tags),
    updatedAt: +p.updatedAt || +p.createdAt || Date.now(),
    visited: !!p.visited,
    day: Number.isInteger(+p.day) && +p.day >= 1 && +p.day <= 30 && p.day !== null && p.day !== '' ? +p.day : null,
    order: isFinite(+p.order) ? +p.order : 0,
    icon: typeof p.icon === 'string' && p.icon ? p.icon.slice(0, 20) : null,
    hours: cleanHours(p.hours),
    price: Number.isInteger(+p.price) && +p.price >= 0 && +p.price <= 4 ? +p.price : 0,
  };
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanHours(h) {
  if (!h || typeof h !== 'object') return null;
  const open = HHMM.test(h.open) ? h.open : '', close = HHMM.test(h.close) ? h.close : '';
  const closed = Array.isArray(h.closed) ? [...new Set(h.closed.map(Number).filter(d => d >= 0 && d <= 6))] : [];
  return open || close || closed.length ? { open, close, closed } : null;
}
function cleanTags(t) {
  if (!Array.isArray(t)) return [];
  const out = [];
  for (const x of t) {
    const v = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (v && !out.some(o => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 12);
}
const PRESET_TAGS = ['Booked', 'Want to try', 'Rainy day', 'Sunset', 'Cheap eats', 'Date night', 'With friends'];
function allTags() {
  const seen = new Map();
  for (const p of places) for (const t of p.tags || []) { const k = t.toLowerCase(); if (!seen.has(k)) seen.set(k, t); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function savePlace(p) {
  const clean = cleanPlace({ ...p, updatedAt: Date.now() });
  const i = places.findIndex(x => x.id === clean.id);
  if (i >= 0) places[i] = clean; else places.push(clean);
  sync.forgetDeleted(clean.id);
  persist();
  return clean;
}
function deletePlace(id) { places = places.filter(p => p.id !== id); sync.markDeleted(id); persist(); }
// Another device changed pins: take the merged list, keep any open edit untouched.
function applyRemote(list) {
  places = list.map(cleanPlace).filter(Boolean);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); } catch {}
  if (view.kind === 'edit') { renderMap(); return; }
  renderMap(); renderPanel();
}

/* ---------- map ---------- */
const map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 19, tap: true })
  .setView(CENTER, 14);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
// Basemap: our own watercolor style (js/mapstyle.js) on OpenFreeMap's free vector tiles,
// drawn by MapLibre GL inside Leaflet. A paper texture is laid over it in CSS (.paper).
const ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const base = L.maplibreGL({ style: watercolorStyle, attribution: ATTR }).addTo(map);
base.getMaplibreMap().on('error', e => console.warn('Basemap:', e.error?.message || e));

const decorLayer = L.layerGroup().addTo(map);
const ideaLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const mapEl = $('#map');
const updateIdeaNames = () => {
  const z = map.getZoom();
  mapEl.classList.toggle('hide-idea-names', z < 14);
  // Icons are smaller when zoomed out and reach full size at street level.
  mapEl.style.setProperty('--ps', z <= 12.5 ? .6 : z <= 13.5 ? .72 : z <= 14.5 ? .86 : 1);
};
if (new URLSearchParams(location.search).has('debug')) window.__map = map;
map.on('zoomend', updateIdeaNames); updateIdeaNames();

// Hand-lettered area names + little paintings, shown only at zooms where they help.
const DECOR_ART = {
  lotus: `<ellipse cx="24" cy="34" rx="15" ry="4.5" fill="#9FBF8A" stroke="#4A4036" stroke-width="1.2"/>
    <path d="M24 33c-5-3-7-9-6-15 3 2 5 6 6 9 1-3 3-7 6-9 1 6-1 12-6 15z" fill="#EBB4C4" stroke="#4A4036" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M24 33c-2-4-2-11 0-17 2 6 2 13 0 17z" fill="#F4CCD7" stroke="#4A4036" stroke-width="1.2" stroke-linejoin="round"/>`,
  tree: `<path d="M24 42v-9" stroke="#8C6A55" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 8c6 5 11 12 11 18a11 8 0 0 1-22 0c0-6 5-13 11-18z" fill="#8FAA72" stroke="#4A4036" stroke-width="1.2" stroke-linejoin="round"/>`,
  hill: `<path d="M4 40c5-10 9-15 13-15 3 0 5 3 7 3 3-7 6-13 9-13 5 0 9 12 11 25z" fill="#93AC74" stroke="#4A4036" stroke-width="1.2" stroke-linejoin="round"/>`,
};
function renderDecor() {
  decorLayer.clearLayers();
  const z = map.getZoom();
  for (const a of AREAS) {
    if (z < a.min || z > 17) continue;
    L.marker([a.lat, a.lng], { interactive: false, keyboard: false, zIndexOffset: -1000,
      icon: L.divIcon({ className: `arealbl ${a.size}${a.water ? ' water' : ''}`, iconSize: [0, 0], html: `<span>${esc(a.name)}</span>` }) }).addTo(decorLayer);
  }
  if (z >= 15 && z <= 17) for (const d of DECOR) {
    L.marker([d.lat, d.lng], { interactive: false, keyboard: false, zIndexOffset: -900,
      icon: L.divIcon({ className: 'decor', iconSize: [30, 30], iconAnchor: [15, 26],
        html: `<svg viewBox="0 0 48 48" aria-hidden="true"><g filter="url(#wc)">${DECOR_ART[d.kind]}</g></svg>` }) }).addTo(decorLayer);
  }
}
map.on('zoomend', renderDecor); renderDecor();

function pinIcon(p, extra = '') {
  const sel = (view.kind === 'edit' && draft && draft.id === p.id) || (view.kind === 'detail' && view.id === p.id) ? ' sel' : '';
  const bob = bounceId === p.id ? 'bob' : '';
  const heart = p.fav ? `<svg class="fav" viewBox="0 0 24 24" aria-label="Must-go"><path d="M12 20.5 4.2 13A4.8 4.8 0 0 1 12 6.8a4.8 4.8 0 0 1 7.8 6.2z" fill="#E58C7E" stroke="#4A4036" stroke-width="1.4" stroke-linejoin="round"/></svg>` : '';
  return L.divIcon({
    className: `pinicon${sel}${p.fav ? ' fav' : ''}${p.visited ? ' visited' : ''}${extra}`,
    iconSize: [48, 48], iconAnchor: [24, 44],
    html: `<div class="pin"><div class="${bob}">${svgArt(artOf(p), 'art')}${heart}${p.visited ? '<span class="vtick" aria-label="Visited">✓</span>' : ''}<span class="nm" title="${esc(p.name)}">${esc(shortName(p.name) || 'New place')}</span></div></div>`,
  });
}
function ideaIcon(i) {
  return L.divIcon({
    className: 'ideaicon', iconSize: [12, 12], iconAnchor: [6, 6],
    html: `<div class="ring" style="color:#8C6A55"></div><span class="nm">${esc(i.name)}</span>`,
  });
}

function renderMap() {
  ideaLayer.clearLayers(); pinLayer.clearLayers();
  if (showIdeas && !tagFilter.size) {
    const saved = new Set(places.map(p => p.ideaId).filter(Boolean));
    for (const i of IDEAS) {
      if (saved.has(i.id) || !filters.has(i.cat)) continue;
      L.marker([i.lat, i.lng], { icon: ideaIcon(i), keyboard: true, title: i.name, riseOnHover: true })
        .on('click', () => openPreview({ ...i, ideaId: i.id, source: 'list' }, false))
        .addTo(ideaLayer);
    }
  }
  const editingId = view.kind === 'edit' && draft ? draft.id : null;
  const shown = places.filter(p => visible(p) && p.id !== editingId);
  for (const g of clusterPins(shown)) {
    if (g.length === 1) {
      const p = g[0];
      L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name, riseOnHover: true, zIndexOffset: 100 + (p.fav ? 50 : 0) })
        .on('click', () => { if (mode === 'browse') openDetail(p.id, false); })
        .addTo(pinLayer);
    } else {
      const c = L.latLngBounds(g.map(p => [p.lat, p.lng])).getCenter();
      L.marker(c, { icon: clusterIcon(g), title: g.map(p => p.name).join(', '), riseOnHover: true, zIndexOffset: 120 })
        .on('click', () => {
          if (mode !== 'browse') return;
          const b = L.latLngBounds(g.map(p => [p.lat, p.lng]));
          const z = Math.min(18, Math.max(map.getZoom() + 2, map.getBoundsZoom(b.pad(0.6))));
          flyVis(b.getCenter(), z, { duration: .6 });
        })
        .addTo(pinLayer);
    }
  }
  if (draft && view.kind === 'edit') {
    const m = L.marker([draft.lat, draft.lng], { icon: pinIcon(draft, places.some(p => p.id === draft.id) ? '' : ' temp'), draggable: true, zIndexOffset: 1000, title: 'Drag to move' })
      .addTo(pinLayer);
    m.on('dragend', () => {
      const ll = m.getLatLng(); draft.lat = ll.lat; draft.lng = ll.lng; draft.exact = false;
      updateLocUI('Moved by hand. For a precise spot, paste coordinates from Google Maps.', false);
    });
  }
  if (view.kind === 'import') {
    view.rows.forEach((r, i) => { if (r.pick) L.marker([r.lat, r.lng], { icon: pinIcon({ ...r, id: '__imp' + i }, ' temp'), zIndexOffset: 900, interactive: false }).addTo(pinLayer); });
  }
  if (view.kind === 'preview') {
    const i = view.item;
    const already = places.some(p => i.ideaId && p.ideaId === i.ideaId);
    if (!already) L.marker([i.lat, i.lng], { icon: pinIcon({ ...i, id: '__preview' }, ' temp'), zIndexOffset: 1000, interactive: false }).addTo(pinLayer);
  }
  bounceId = null;
  renderRoute();
  setTimeout(declutterLabels, 0);
}

/* ---------- keeping the map tidy ---------- */
// Shorter names on the map (the full name is in the place card).
function shortName(n) {
  const full = String(n || ''), cut = full.replace(/[\s,–-]+chiang ?mai$/i, '').trim();
  let s = cut.split(/\s+/).length >= 2 ? cut : full;
  if (s.length > 22) s = s.slice(0, 21).replace(/\s+\S*$/, '') + '…';
  return s;
}
// Pins closer than ~38px on screen become one bundle with a count. The selected pin stays alone.
function clusterPins(list) {
  if (map.getZoom() >= 17) return list.map(p => [p]);
  const selId = view.kind === 'detail' ? view.id : null;
  const groups = [];
  const sorted = [...list].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const pt = map.project([p.lat, p.lng]);
    if (p.id === selId) { groups.push({ pt, items: [p], solo: true }); continue; }
    const g = groups.find(g => !g.solo && g.pt.distanceTo(pt) < 38);
    if (g) g.items.push(p); else groups.push({ pt, items: [p] });
  }
  return groups.map(g => g.items);
}
function clusterIcon(g) {
  const lead = g[0], more = g.length - 1;
  return L.divIcon({
    className: 'pinicon cluster', iconSize: [48, 48], iconAnchor: [24, 44],
    html: `<div class="pin">${svgArt(artOf(g[1]), 'art back')}${svgArt(artOf(lead), 'art')}<span class="count">${g.length}</span><span class="nm">${esc(shortName(lead.name))} <i>+${more}</i></span></div>`,
  });
}
// Keep every pin name, but move it to a side of its icon that has room:
// right first, then below, left, above. Selected > must-go > others get first pick.
// Only suggestion ("idea") names are hidden when there's no room. Area names fade under pins.
const boxHit = (a, b, pad = 2) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const POS = ['r', 'b', 'l', 't'];
function declutterLabels() {
  const items = [...mapEl.querySelectorAll('.pinicon, .ideaicon')].map(el => ({
    el, nm: el.querySelector('.nm'), icon: (el.querySelector('.art:not(.back)') || el.querySelector('.ring'))?.getBoundingClientRect(),
    pr: el.classList.contains('sel') ? 3 : el.classList.contains('fav') ? 2 : el.classList.contains('ideaicon') ? 0 : 1,
  }));
  const box = mapEl.getBoundingClientRect();
  const placed = [];
  const order = [...items].sort((a, b) => (b.pr - a.pr) || ((a.icon?.top || 0) - (b.icon?.top || 0)));
  for (const it of order) {
    if (!it.nm || !it.icon) continue;
    it.nm.classList.remove('clash', 'pos-b', 'pos-l', 'pos-t');
    const r0 = it.nm.getBoundingClientRect();
    if (!r0.width) continue;
    const w = r0.width, h = r0.height, ic = it.icon, cx = (ic.left + ic.right) / 2, cy = (ic.top + ic.bottom) / 2;
    const cand = {
      r: { left: ic.right - 2, right: ic.right - 2 + w, top: cy - h / 2, bottom: cy + h / 2 },
      b: { left: cx - w / 2, right: cx + w / 2, top: ic.bottom - 1, bottom: ic.bottom - 1 + h },
      l: { left: ic.left + 2 - w, right: ic.left + 2, top: cy - h / 2, bottom: cy + h / 2 },
      t: { left: cx - w / 2, right: cx + w / 2, top: ic.top - h + 1, bottom: ic.top + 1 },
    };
    const others = items.filter(o => o !== it && o.icon).map(o => o.icon);
    const cost = r => placed.reduce((s, q) => s + overlapArea(r, q), 0) + others.reduce((s, q) => s + overlapArea(r, q), 0)
      + (r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom ? 1 : 0);
    let best = null, bestCost = Infinity;
    for (const k of POS) {
      const r = cand[k], c = (placed.some(q => boxHit(r, q)) || others.some(q => boxHit(r, q, 0))) ? cost(r) + 0.5 : cost(r);
      if (c === 0) { best = k; bestCost = 0; break; }
      if (c < bestCost) { best = k; bestCost = c; }
    }
    if (bestCost > 0 && it.pr === 0) { it.nm.classList.add('clash'); continue; }
    if (best !== 'r') it.nm.classList.add('pos-' + best);
    placed.push(cand[best]);
  }
  const blockers = [...placed, ...items.map(i => i.icon).filter(Boolean)];
  for (const sp of mapEl.querySelectorAll('.arealbl span')) {
    const r = sp.getBoundingClientRect();
    sp.classList.toggle('clash', blockers.some(b => boxHit(r, b, 4)));
  }
}
map.on('zoomend', () => renderMap());
map.on('moveend', () => setTimeout(declutterLabels, 0));

/* ---------- panel ---------- */
const stayOf = () => places.find(p => p.cat === 'stay');
function distTxt(p) {
  const s = stayOf(); if (!s || s.id === p.id || p.cat === 'stay') return '';
  const d = km(s, p); return d < 1 ? `${Math.round(d * 1000 / 50) * 50} m` : `${d.toFixed(1)} km`;
}
function gmapsLink(p) { return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`; }
// Hand-off to real navigation apps. On phones these open the installed app.
const llOf = p => `${(+p.lat).toFixed(6)},${(+p.lng).toFixed(6)}`;
function gmapsDirLink(p) { return `https://www.google.com/maps/dir/?api=1&destination=${llOf(p)}`; }
function wazeLink(p) { return `https://waze.com/ul?ll=${llOf(p)}&navigate=yes`; }
function goButtons(p) {
  return `<div class="gorow">
    <a class="btn go" href="${gmapsDirLink(p)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.4-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.6 12 21 12 21z" fill="currentColor"/><circle cx="12" cy="9.8" r="2.4" fill="var(--panel)"/></svg>Google Maps</a>
    <a class="btn go" href="${wazeLink(p)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13a8 7 0 1 1 15.5 2.4c-.6 1.6-2 2.8-3.7 3.1M4 13c0 1.8.6 3.3 2 4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="19" r="1.8" fill="currentColor"/><circle cx="14.5" cy="19" r="1.8" fill="currentColor"/><circle cx="9.5" cy="11" r="1.1" fill="currentColor"/><circle cx="14.5" cy="11" r="1.1" fill="currentColor"/></svg>Waze</a>
  </div>`;
}
const tagChips = (tags, cls = 'tg') => (tags || []).map(t => `<span class="${cls}">${esc(t)}</span>`).join('');

function renderPanel() {
  const head = $('#phead'), body = $('#pbody');
  if (view.kind === 'list') {
    const n = places.length;
    const nv = places.filter(p => p.visited).length;
    head.innerHTML = `<h2>My places <small>${n ? n + (n === 1 ? ' pin' : ' pins') : ''}${nv ? ` · ${nv} visited` : ''}</small></h2>
      ${n ? `<div class="modes" role="tablist" aria-label="Arrange list">
        ${[['type', 'By type'], ['near', 'Near me'], ['days', 'Days']].map(([k, t]) => `<button type="button" role="tab" class="mode" data-listmode="${k}" aria-selected="${listMode === k}">${t}</button>`).join('')}
        ${nv ? `<button type="button" class="tchip vis" data-hidevisited aria-pressed="${hideVisited}">${hideVisited ? 'Show visited' : 'Hide visited'}</button>` : ''}
      </div>` : ''}
      ${dayFocus ? `<div class="dayfocus">Showing <b>Day ${dayFocus}</b> on the map <button type="button" class="tclear" data-dayfocus="">Show all</button></div>` : ''}
      <div class="filters" role="group" aria-label="Show categories">${CAT_KEYS.map(c => `<button type="button" class="fchip" data-f="${c}" aria-pressed="${filters.has(c)}">${dotHTML(c)}${CATS[c].short || CATS[c].label}</button>`).join('')}</div>
      ${allTags().length ? `<div class="filters tagfilters" role="group" aria-label="Filter by tag"><span class="flabel">Tags</span>${allTags().map(t => `<button type="button" class="tchip" data-tf="${esc(t)}" aria-pressed="${tagFilter.has(t.toLowerCase())}">#${esc(t)}</button>`).join('')}${tagFilter.size ? '<button type="button" class="tclear" data-tfclear>Clear</button>' : ''}</div>` : ''}`;
    if (!n) {
      body.innerHTML = `<div class="empty">
        <svg class="art" viewBox="0 0 48 48" aria-hidden="true"><g filter="url(#wc)">${CATS.see.art}</g></svg>
        <h3>No pins yet</h3>
        <p>Type a name in the <b>search bar</b> on the map, or paste a Google Maps link.</p>
        <p>Or tap a dotted <b>idea</b>, or use <b>Add a place</b> and tap the map yourself.</p></div>`;
      return;
    }
    body.innerHTML = listBody();
    return;
  }

  if (view.kind === 'sync') { renderSyncPanel(head, body); body.insertAdjacentHTML('beforeend', offlineHTML() + shareHTML()); return; }
  if (view.kind === 'import') { renderImportPanel(head, body); return; }

  if (view.kind === 'detail') {
    const p = places.find(x => x.id === view.id);
    if (!p) { view = { kind: 'list' }; renderPanel(); return; }
    const d = distTxt(p);
    head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>`;
    body.innerHTML = `<div class="idea">
      <div class="hero">${dotFor(p)}<div><span class="tag">${CATS[p.cat].label}${p.price ? ' · ' + PRICE[p.price] : ''}${p.fav ? ' · <span class="heart">♥</span> must-go' : ''}</span>
      <h3>${esc(p.name)}</h3></div></div>
      ${(() => { const st = openStatus(p); return st ? `<p class="openst ${st.open === true ? 'is-open' : st.open === false ? 'is-closed' : ''}"><b></b>${esc(st.text)}${p.hours?.open && p.hours?.close ? ` <small>· ${p.hours.open}–${p.hours.close}</small>` : ''}</p>` : ''; })()}
      ${p.tags?.length ? `<div class="tgs">${tagChips(p.tags)}</div>` : ''}
      ${p.note ? `<p class="dnote">${esc(p.note)}</p>` : ''}
      ${me ? `<p class="fine">${fmtDist(km(me, p))} from you, as the crow flies.</p>` : d ? `<p class="fine">About ${d} from your stay, as the crow flies.</p>` : ''}
      <div><span class="l golabel">Get there with</span>${goButtons(p)}</div>
      <div class="planrow">
        <button type="button" class="btn ${p.visited ? 'done' : 'ghost'}" data-visit="${esc(p.id)}" aria-pressed="${p.visited}">${p.visited ? '✓ Been here' : 'Mark as visited'}</button>
        <label class="daypick"><span>Plan for</span><select data-setday="${esc(p.id)}" aria-label="Plan for which day">${dayOptions(p.day)}</select></label>
      </div>
      <div class="row"><button type="button" class="btn" data-edit="${esc(p.id)}">Edit pin</button></div>
      <p class="fine">${p.exact ? 'Exact spot.' : 'Approximate spot. Edit it and paste coordinates for a precise location.'} ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</p></div>`;
    return;
  }

  if (view.kind === 'import') {
    view.rows.forEach((r, i) => { if (r.pick) L.marker([r.lat, r.lng], { icon: pinIcon({ ...r, id: '__imp' + i }, ' temp'), zIndexOffset: 900, interactive: false }).addTo(pinLayer); });
  }
  if (view.kind === 'preview') {
    const i = view.item;
    const saved = places.find(p => (i.ideaId && p.ideaId === i.ideaId) || p.name.toLowerCase() === i.name.toLowerCase());
    const src = { list: 'Idea', osm: 'OpenStreetMap', link: 'Google Maps link' }[i.source] || 'Result';
    const d = distTxt(i);
    head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>`;
    body.innerHTML = `<div class="idea">
      <div class="hero">${dotHTML(i.cat)}<div><span class="tag">${src} · ${CATS[i.cat].label}</span>
      <h3>${esc(i.name)}</h3></div></div>${i.area ? `<p class="fine" style="margin-top:-6px">${esc(i.area)}</p>` : ''}${i.blurb ? `<p>${esc(i.blurb)}</p>` : ''}
      ${d ? `<p class="fine">About ${d} from your stay, as the crow flies.</p>` : ''}
      <div class="row">${saved ? `<button type="button" class="btn" data-open="${esc(saved.id)}">Already on your map · open</button>` : `<button type="button" class="btn primary" data-adopt>Add to my map</button>`}
      <a class="btn ghost" href="${i.source === 'list' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.name + ' Chiang Mai')}` : gmapsLink(i)}" target="_blank" rel="noopener">View on Google Maps ↗</a></div>
      <div><span class="l golabel">Get there with</span>${goButtons(i)}</div>
      <p class="fine">${i.source === 'osm'
        ? 'Location from OpenStreetMap. Usually spot on, but give it a glance on the map before you rely on it.'
        : 'Built-in spots are approximate. Check opening days before you go.'}</p></div>`;
    return;
  }

  // edit
  const p = draft, isNew = !places.some(x => x.id === p.id);
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>`;
  const d = distTxt(p);
  body.innerHTML = `<form class="form" id="form" autocomplete="off">
    <div><label class="l" for="f-name">Name</label><input type="text" id="f-name" value="${esc(p.name)}" placeholder="e.g. Hostel near Tha Phae Gate" maxlength="80" required></div>
    <div><span class="l" style="font-weight:800;font-size:13px;display:block;margin-bottom:5px">Type</span>
      <div class="cats">${CAT_KEYS.map(c => `<input type="radio" name="cat" id="f-cat-${c}" value="${c}" ${p.cat === c ? 'checked' : ''}><label for="f-cat-${c}">${dotHTML(c)}${CATS[c].short || CATS[c].label}</label>`).join('')}</div></div>
    <div><span class="l">Icon</span>
      <div class="icons" role="radiogroup" aria-label="Icon">
        <input type="radio" name="icon" id="f-icon-auto" value="" ${!p.icon ? 'checked' : ''}><label for="f-icon-auto" title="Same as type">${dotFor({ cat: p.cat })}<span>Auto</span></label>
        ${Object.entries(ICONS).filter(([k]) => k !== p.cat).map(([k, v]) => `<input type="radio" name="icon" id="f-icon-${k}" value="${k}" ${p.icon === k ? 'checked' : ''}><label for="f-icon-${k}" title="${esc(v.label)}"><span class="dot" style="background:var(--paper-2)">${svgArt(v.art)}</span></label>`).join('')}
      </div></div>
    <div class="two">
      <div><label class="l" for="f-day">Plan for</label><select id="f-day">${dayOptions(p.day)}</select></div>
      <div><span class="l">Price</span><div class="seg" role="radiogroup" aria-label="Price">${PRICE.map((t, i) => `<input type="radio" name="price" id="f-price-${i}" value="${i}" ${(p.price || 0) === i ? 'checked' : ''}><label for="f-price-${i}">${i ? t : '–'}</label>`).join('')}</div></div>
    </div>
    <div><span class="l">Opening hours <small class="opt">optional, Chiang Mai time</small></span>
      <div class="hours"><input type="time" id="f-open" value="${p.hours?.open || ''}" aria-label="Opens"><span>to</span><input type="time" id="f-close" value="${p.hours?.close || ''}" aria-label="Closes"></div>
      <div class="seg days" role="group" aria-label="Closed on">${[1, 2, 3, 4, 5, 6, 0].map(d => `<input type="checkbox" id="f-closed-${d}" value="${d}" ${p.hours?.closed?.includes(d) ? 'checked' : ''}><label for="f-closed-${d}" title="Closed on ${DAYNAMES[d]}">${DAYNAMES[d].slice(0, 2)}</label>`).join('')}<span class="segnote">closed</span></div></div>
    <div><label class="l" for="f-note">Notes</label><textarea id="f-note" placeholder="Opening hours, what to order, price, booking ref…" maxlength="2000">${esc(p.note)}</textarea></div>
    <div><label class="l" for="f-tag">Tags</label>
      <div class="tagbox" id="tagBox"></div>
      <div class="sugs" id="tagSugs"></div></div>
    <div class="exactbox${p.exact ? ' ok' : ''}" id="exactBox">
      <label class="l" for="f-loc">Exact location</label>
      <p class="hint" id="exactHint">${p.exact ? 'Pinned at an exact spot.' : 'This spot is approximate. Drag the pin on the map, or paste coordinates or a Google Maps link.'}</p>
      <div class="locrow"><input type="text" id="f-loc" placeholder="18.7877, 98.9934 or a Google Maps link"><button type="button" class="btn ghost" data-loc>Apply</button></div>
      <details class="how"><summary>How do I get these?</summary>
        <p><b>Computer:</b> in Google Maps, right-click the exact spot. The first line is the coordinates; click it to copy.</p>
        <p><b>Phone:</b> in Google Maps, long-press the exact spot to drop a pin. The coordinates show in the search bar; tap to copy.</p>
        <p><b>Easiest:</b> in Google Maps tap <b>Share → Copy link</b> and paste it here.</p></details>
    </div>
    <label class="toggle" for="f-fav"><input type="checkbox" id="f-fav" ${p.fav ? 'checked' : ''}> Must-go</label>
    <div class="row"><button type="submit" class="btn primary">${isNew ? 'Save pin' : 'Save changes'}</button>
      <button type="button" class="btn ghost" data-back>Cancel</button></div>
    <div class="meta"><span id="f-coords">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>${d ? `<span>${d} from your stay</span>` : ''}
      <a id="f-gmaps" href="${gmapsLink(p)}" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>
    ${isNew ? '' : `<div class="row" id="delRow"><button type="button" class="btn danger" data-del>Delete pin</button></div>`}
  </form>`;
  const f = $('#form'), nm = $('#f-name');
  renderTagEditor();
  nm.addEventListener('input', () => { draft.name = nm.value; });
  nm.addEventListener('change', () => renderMap());
  f.addEventListener('change', e => {
    if (e.target.name === 'cat') { draft.cat = e.target.value; renderMap(); }
    if (e.target.id === 'f-fav') { draft.fav = e.target.checked; renderMap(); }
    if (e.target.name === 'icon') { draft.icon = e.target.value || null; renderMap(); }
    if (e.target.name === 'price') draft.price = +e.target.value;
    if (e.target.id === 'f-day') { draft.day = e.target.value ? +e.target.value : null; if (draft.day) draft.order = nextOrder(draft.day, draft.id); }
    if (/^f-(open|close|closed-)/.test(e.target.id)) draft.hours = cleanHours({ open: $('#f-open').value, close: $('#f-close').value,
      closed: [...document.querySelectorAll('[id^="f-closed-"]:checked')].map(x => +x.value) });
  });
  $('#f-note').addEventListener('input', e => { draft.note = e.target.value; });
  $('#f-loc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyLoc(); } });
  f.addEventListener('submit', e => {
    e.preventDefault();
    draft.name = nm.value.trim();
    if (!draft.name) { nm.focus(); toast('Give it a name first.'); return; }
    const pending = $('#f-tag')?.value.trim(); if (pending) addTag(pending);
    const saved = savePlace(draft);
    toast(isNew ? 'Pinned!' : 'Saved');
    bounceId = isNew ? saved.id : null;
    openDetail(saved.id, false);
  });
  if (isNew) setTimeout(() => nm.focus({ preventScroll: true }), 30);
}


/* ---------- list modes, visited, days, location ---------- */
const fmtDist = d => d < 1 ? `${Math.max(50, Math.round(d * 1000 / 50) * 50)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`;
function itemHTML(p, dist, extra = '') {
  const st = openStatus(p);
  return `<div class="itemrow${p.visited ? ' visited' : ''}"><button type="button" class="item" data-open="${esc(p.id)}">
    ${dotFor(p)}
    <span style="min-width:0"><span class="nm"><span>${esc(p.name)}</span>${p.fav ? '<svg class="heart" width="13" height="13" viewBox="0 0 24 24" aria-label="Must-go"><path d="M12 21 3.5 12.7A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 8.5 6.7z" fill="currentColor"/></svg>' : ''}${p.visited ? '<span class="vt" aria-label="Visited">✓</span>' : ''}</span>
    ${p.note ? `<span class="nt">${esc(p.note)}</span>` : ''}${p.tags?.length || st || p.price ? `<span class="tgs">${st ? `<span class="os ${st.open === true ? 'is-open' : st.open === false ? 'is-closed' : ''}">${st.open === true ? 'Open' : st.open === false ? 'Closed' : 'Hours'}</span>` : ''}${p.price ? `<span class="pr">${PRICE[p.price]}</span>` : ''}${tagChips(p.tags)}</span>` : ''}</span>
    <span class="km">${dist}${p.exact ? '' : '<span class="approx" title="Approximate spot. Open it and paste exact coordinates.">≈ approx</span>'}</span></button>${extra}</div>`;
}
function listBody() {
  const shown = places.filter(p => filters.has(p.cat) && hasTagMatch(p) && !(hideVisited && p.visited));
  if (!shown.length) return `<div class="empty"><p>${hideVisited && places.some(p => p.visited) ? 'Everything here is visited. Tap “Show visited” to see them.' : tagFilter.size ? 'No pins match these tags and categories.' : 'All categories are hidden. Turn some back on above.'}</p></div>`;
  const byVisit = (a, b) => (a.visited - b.visited);
  if (listMode === 'near') {
    if (!me) return `<div class="empty"><p>Turn on your location to see what’s closest.</p><p><button type="button" class="btn primary" data-locate>Find me</button></p><p class="fine">Your location stays on this device.</p></div>`;
    const rows = shown.map(p => [km(me, p), p]).sort((a, b) => byVisit(a[1], b[1]) || a[0] - b[0]);
    return `<p class="lnote">Closest first, from where you are now (straight line).</p>` + rows.map(([d, p]) => itemHTML(p, fmtDist(d))).join('');
  }
  if (listMode === 'days') {
    const days = [...new Set(places.filter(p => p.day).map(p => p.day))].sort((a, b) => a - b);
    let out = days.length ? '' : `<p class="lnote">Open a place and pick <b>Plan for → Day 1</b> to start a day plan. Each day gets its own route on the map.</p>`;
    for (const d of days) {
      const items = shown.filter(p => p.day === d).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      if (!items.length) continue;
      out += `<div class="group day"><h3>Day ${d} <span>${items.length} ${items.length === 1 ? 'stop' : 'stops'}</span>
        <button type="button" class="tchip" data-dayfocus="${dayFocus === d ? '' : d}" aria-pressed="${dayFocus === d}">${dayFocus === d ? 'Showing on map' : 'Show route'}</button></h3>` +
        items.map((p, i) => itemHTML(p, `<span class="stopn">${i + 1}</span>`, `<span class="mv"><button type="button" data-move="${esc(p.id)}" data-dir="-1" aria-label="Move ${esc(p.name)} earlier" ${i ? '' : 'disabled'}>↑</button><button type="button" data-move="${esc(p.id)}" data-dir="1" aria-label="Move ${esc(p.name)} later" ${i < items.length - 1 ? '' : 'disabled'}>↓</button></span>`)).join('') + `</div>`;
    }
    const loose = shown.filter(p => !p.day).sort((a, b) => byVisit(a, b) || a.name.localeCompare(b.name));
    if (loose.length) out += `<div class="group"><h3>Not planned yet <span>${loose.length}</span></h3>` + loose.map(p => itemHTML(p, distTxt(p))).join('') + `</div>`;
    return out;
  }
  const s = stayOf();
  let out = s ? '' : `<p class="lnote">Pin your stay and each place will show how far it is from your bed.</p>`;
  for (const c of CAT_KEYS) {
    if (!filters.has(c)) continue;
    const items = shown.filter(p => p.cat === c).sort((a, b) => byVisit(a, b) || (b.fav - a.fav) || a.name.localeCompare(b.name));
    if (!items.length) continue;
    out += `<div class="group"><h3>${CATS[c].label} <span>${items.length}</span></h3>` + items.map(p => itemHTML(p, me ? fmtDist(km(me, p)) : distTxt(p))).join('') + `</div>`;
  }
  if (me) out += `<p class="lnote">Distances are straight-line from where you are.</p>`;
  else if (s) out += `<p class="lnote">Distances are straight-line from ${esc(s.name)}.</p>`;
  return out;
}
function dayOptions(cur) {
  const max = Math.max(3, ...places.map(p => p.day || 0)) + 1;
  return `<option value="">Not planned</option>` + Array.from({ length: Math.min(30, max) }, (_, i) => `<option value="${i + 1}" ${cur === i + 1 ? 'selected' : ''}>Day ${i + 1}</option>`).join('');
}
const nextOrder = (day, exceptId) => Math.max(0, ...places.filter(p => p.day === day && p.id !== exceptId).map(p => p.order || 0)) + 1;
function updatePlace(id, patch) {
  const p = places.find(x => x.id === id); if (!p) return null;
  return savePlace({ ...p, ...patch });
}
function moveStop(id, dir) {
  const p = places.find(x => x.id === id); if (!p || !p.day) return;
  const items = places.filter(x => x.day === p.day).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const i = items.findIndex(x => x.id === id), j = i + dir;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  const now = Date.now();
  items.forEach((x, k) => { if (x.order !== k + 1) Object.assign(x, { order: k + 1, updatedAt: now }); });
  persist(); renderMap(); renderPanel();
}
// Dotted route through a focused day's stops, in order.
const routeLayer = L.layerGroup().addTo(map);
function renderRoute() {
  routeLayer.clearLayers();
  if (!dayFocus) return;
  const stops = places.filter(p => p.day === dayFocus).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  if (stops.length < 2) return;
  L.polyline(stops.map(p => [p.lat, p.lng]), { color: '#B86A59', weight: 3.5, opacity: .85, dashArray: '2 9', lineCap: 'round', interactive: false }).addTo(routeLayer);
}
// "You are here": only starts after you tap the locate button (the browser asks first).
let meWatch = null, meMarker = null, meCircle = null, meFirst = false;
function startLocate() {
  if (!('geolocation' in navigator)) { toast('This browser can’t share your location.'); return; }
  if (meWatch != null) { if (me) flyVis([me.lat, me.lng], Math.max(map.getZoom(), 15), { duration: .6 }); return; }
  $('#locBtn')?.classList.add('busy'); meFirst = true;
  meWatch = navigator.geolocation.watchPosition(pos => {
    me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    $('#locBtn')?.classList.remove('busy'); $('#locBtn')?.setAttribute('aria-pressed', 'true');
    if (!meMarker) {
      meCircle = L.circle([me.lat, me.lng], { radius: me.acc, color: '#5F8790', weight: 1, fillColor: '#7FAEB5', fillOpacity: .15, interactive: false }).addTo(map);
      meMarker = L.marker([me.lat, me.lng], { interactive: false, keyboard: false, zIndexOffset: 2000,
        icon: L.divIcon({ className: 'medot', iconSize: [22, 22], iconAnchor: [11, 11], html: '<i></i>' }) }).addTo(map);
    } else { meMarker.setLatLng([me.lat, me.lng]); meCircle.setLatLng([me.lat, me.lng]).setRadius(me.acc); }
    if (meFirst) { meFirst = false; if (km(me, { lat: CENTER[0], lng: CENTER[1] }) < 150) flyVis([me.lat, me.lng], Math.max(map.getZoom(), 15), { duration: .7 }); else toast('You’re not in Chiang Mai yet, so the map stays put.'); }
    if (view.kind === 'list' || view.kind === 'detail') renderPanel();
  }, err => {
    $('#locBtn')?.classList.remove('busy');
    navigator.geolocation.clearWatch(meWatch); meWatch = null;
    toast(err.code === 1 ? 'Location is blocked. Allow it for this site in your browser settings.' : 'Couldn’t find your location. Try again outside or with Wi-Fi on.');
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}


/* ---------- offline ---------- */
// The service worker (sw.js) keeps the app and any map you've looked at. This pre-saves
// the whole Chiang Mai area (city in detail, the wider province roughly) in one go.
const OFFLINE_KEY = 'cm-trip-map-offline';
const AREAS_OFFLINE = [
  { s: 18.70, w: 98.88, n: 18.87, e: 99.08, z: [10, 14] },   // city + Doi Suthep, full detail
  { s: 18.30, w: 98.40, n: 19.25, e: 99.45, z: [8, 11] },    // day trips (Inthanon, Mae Kampong…), overview
];
let offlineJob = null;
function tileRange(a, z) {
  const n = 2 ** z, x = lng => Math.floor((lng + 180) / 360 * n);
  const y = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  return { x0: x(a.w), x1: x(a.e), y0: y(a.n), y1: y(a.s) };
}
function offlineHTML() {
  const saved = (() => { try { return +localStorage.getItem(OFFLINE_KEY) || 0; } catch { return 0; } })();
  const can = 'serviceWorker' in navigator && 'caches' in window;
  return `<div class="idea offl"><span class="l golabel">Offline map</span>
    <p class="fine" style="margin:0">${can ? 'Save the Chiang Mai map onto this device so it still works with weak signal. Your pins are always saved on the device.' : 'This browser can’t save the map for offline use. Your pins still work offline.'}</p>
    ${can ? `<div class="row"><button type="button" class="btn ${saved ? 'ghost' : 'primary'}" data-offline ${offlineJob ? 'disabled' : ''}>${offlineJob ? `Saving… ${offlineJob.done}/${offlineJob.total}` : saved ? 'Update offline map' : 'Save Chiang Mai for offline'}</button></div>
    <p class="fine" style="margin:0">${saved ? `Saved ${new Date(saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. ` : ''}A few MB. Search and sync still need a connection.</p>` : ''}</div>`;
}
async function saveOffline() {
  if (offlineJob) return;
  try {
    await navigator.serviceWorker?.ready;
    const tj = await fetch('https://tiles.openfreemap.org/planet').then(r => r.json());
    const tpl = tj.tiles[0], urls = new Set();
    for (const a of AREAS_OFFLINE) for (let z = a.z[0]; z <= a.z[1]; z++) {
      const r = tileRange(a, z);
      for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.add(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
    for (const f of ['Noto Sans Italic', 'Noto Sans Regular']) urls.add(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/0-255.pbf`);
    const list = [...urls];
    offlineJob = { done: 0, total: list.length, failed: 0 }; renderPanel();
    let i = 0;
    const worker = async () => { while (i < list.length) { const u = list[i++]; try { const r = await fetch(u); if (!r.ok) offlineJob.failed++; } catch { offlineJob.failed++; } offlineJob.done++; if (offlineJob.done % 10 === 0 && view.kind === 'sync') renderPanel(); } };
    await Promise.all(Array.from({ length: 6 }, worker));
    const { failed, total } = offlineJob;
    offlineJob = null;
    if (failed > total * 0.1) toast(`Saved most of the map, but ${failed} pieces failed. Try again on Wi-Fi.`);
    else { try { localStorage.setItem(OFFLINE_KEY, String(Date.now())); } catch {} toast('Chiang Mai map saved for offline'); }
  } catch {
    offlineJob = null; toast('Couldn’t save the map. Check your connection and try again.');
  }
  if (view.kind === 'sync') renderPanel();
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}


/* ---------- sharing ---------- */
function shareHTML() {
  if (!sync.isConfigured() || !sync.getCode()) return `<div class="idea offl"><span class="l golabel">Share with travel buddies</span><p class="fine" style="margin:0">Create a trip code above first. Then you can share a link that lets friends add places with you, or one that only lets them look.</p></div>`;
  return `<div class="idea offl"><span class="l golabel">Share with travel buddies</span>
    <p class="fine" style="margin:0"><b>Plan together:</b> send them the phone link above. They see and edit the same pins as you.</p>
    <p class="fine" style="margin:0"><b>Just to look:</b> a separate link that shows your map and plan, but can’t change anything.</p>
    <div class="row"><button type="button" class="btn" data-viewlink>Copy view-only link</button></div></div>`;
}
async function copyViewLink() {
  try {
    const code = await sync.rpc('trip_view_code', { p_trip: sync.getCode() });
    const link = `${location.origin}${location.pathname}#view=${sync.fmtCode(code)}`;
    try { await navigator.clipboard.writeText(link); toast('View-only link copied'); }
    catch { prompt('Copy this view-only link:', link); }
  } catch (e) {
    toast(e.status === 404 ? 'View-only links need a one-time setup: run supabase/share.sql in Supabase.' : 'Couldn’t make a view-only link. Check your connection.');
  }
}
async function loadViewOnly() {
  try {
    const rows = await sync.rpc('trip_view_get', { p_view: VIEW_CODE });
    places = (Array.isArray(rows) ? rows : []).map(r => cleanPlace({ ...r.data, id: r.id })).filter(Boolean);
    renderMap(); renderPanel();
    return true;
  } catch (e) {
    toast(e.status === 404 ? 'This share link isn’t set up yet.' : 'Couldn’t load the shared map. Check your connection.');
    return false;
  }
}

/* ---------- import a shared Google Maps list ---------- */
const CAT_GUESS = [
  ['stay', /hotel|hostel|resort|guest ?house|homestay|villa|residence|\binn\b|airbnb|condo|lodge|^home\b/i],
  ['night', /\bbar\b|bar\.|\bpub\b|club|jazz|cocktail|beer|brew|speakeasy/i],
  ['cafe', /caf[eé]|coffee|roast|espresso|bakery|cake|dessert|\btea\b|brunch|matcha/i],
  ['shop', /market|bazaar|\bmall\b|\bshop|store|plaza|walking street/i],
  ['nature', /national park|\bpark\b|\bdoi\b|waterfall|\bfalls?\b|lake|reservoir|garden|mountain|cave|hot spring|canyon|view ?point/i],
  ['see', /\bwat\b|temple|museum|gallery|monument|palace|chedi|\bgate\b|art village/i],
  ['eat', /restaurant|food|khao|kaphrao|noodle|kitchen|grill|bbq|eatery|diner|som ?tam|\bpad\b|crab|seafood|pork|chicken|curry|soup/i],
];
function guessCat(name, note) {
  const d = DIR.find(x => norm(x.name) === norm(name) || (x.alias && norm(x.alias).split(' ').length > 1 && norm(name).includes(norm(x.alias))));
  if (d) return d.cat;
  const hay = `${name} ${note || ''}`;
  for (const [c, re] of CAT_GUESS) if (re.test(hay)) return c;
  return 'other';
}
const listPinId = r => r.gid ? 'g' + r.gid.replace(/[^0-9-]+/g, '_').slice(0, 60) : null;
function existingFor(r) {
  const id = listPinId(r);
  return places.find(p => (id && p.id === id) || (norm(p.name) === norm(r.name) && km(p, r) < 0.3) || km(p, r) < 0.025) || null;
}
function openImport(list) {
  const rows = list.places.map(r => {
    const ex = existingFor(r);
    return { ...r, cat: ex ? ex.cat : guessCat(r.name, r.note), pick: !ex, existing: ex ? ex.name : '' };
  });
  draft = null; setMode('browse');
  view = { kind: 'import', list, rows, tag: list.name && list.name !== 'Saved list' ? list.name : '' };
  renderMap(); renderPanel(); setSheet('full');
  const b = rows.length ? L.latLngBounds(rows.map(r => [r.lat, r.lng])) : null;
  if (b) map.flyToBounds(b.pad(0.2), { maxZoom: 15, duration: .7 });
}
function renderImportPanel(head, body) {
  const v = view, picked = v.rows.filter(r => r.pick).length, fresh = v.rows.filter(r => !r.existing).length;
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>
    <h2 style="margin-top:6px">Import list <small>${v.rows.length} ${v.rows.length === 1 ? 'place' : 'places'}</small></h2>`;
  if (!v.rows.length) { body.innerHTML = `<div class="empty"><p>“${esc(v.list.name)}” has no places, or they’re hidden. Check the list is shared with “anyone with the link”.</p></div>`; return; }
  body.innerHTML = `<div class="form imp">
    <p class="fine" style="margin:0">From your Google Maps list <b>“${esc(v.list.name)}”</b>. ${fresh < v.rows.length ? `${v.rows.length - fresh} already on your map ${v.rows.length - fresh === 1 ? 'is' : 'are'} unticked.` : 'Untick anything you don’t want.'} Check the guessed types.</p>
    <div><label class="l" for="imp-tag">Tag them all with</label>
      <input type="text" id="imp-tag" value="${esc(v.tag)}" placeholder="e.g. Google list (optional)" maxlength="30"></div>
    <div class="row" style="gap:6px"><button type="button" class="tclear" data-impall="1">Select all</button><button type="button" class="tclear" data-impall="0">Select none</button></div>
    <div class="improws">${v.rows.map((r, i) => `
      <div class="improw${r.pick ? '' : ' off'}">
        <input type="checkbox" id="imp-${i}" data-imp="${i}" ${r.pick ? 'checked' : ''} aria-label="Add ${esc(r.name)}">
        <label for="imp-${i}" class="impdot">${dotHTML(r.cat)}</label>
        <label for="imp-${i}" class="impname"><b>${esc(r.name)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}${r.existing ? `<small class="impx">Already on your map</small>` : ''}</label>
        <select data-impcat="${i}" aria-label="Type for ${esc(r.name)}">${CAT_KEYS.map(c => `<option value="${c}" ${r.cat === c ? 'selected' : ''}>${CATS[c].short || CATS[c].label}</option>`).join('')}</select>
      </div>`).join('')}</div>
    <div class="row"><button type="button" class="btn primary" data-impgo ${picked ? '' : 'disabled'}>Add ${picked} ${picked === 1 ? 'place' : 'places'}</button>
      <button type="button" class="btn ghost" data-back>Cancel</button></div>
    <p class="fine">Locations come straight from Google, so they’re exact. Re-import the same list later and only new places are added.</p></div>`;
  $('#imp-tag').addEventListener('input', e => { view.tag = e.target.value; });
}
function doImport() {
  const v = view, tag = v.tag.trim(), now = Date.now();
  let n = 0;
  for (const r of v.rows) {
    if (!r.pick) continue;
    const ex = existingFor(r);
    const id = (ex && ex.id) || listPinId(r) || newId();
    const p = cleanPlace({ ...(ex || {}), id, name: ex ? ex.name : r.name, cat: r.cat, note: (ex && ex.note) || r.note || r.address || '',
      fav: ex ? ex.fav : false, exact: true, lat: r.lat, lng: r.lng, ideaId: ex ? ex.ideaId : null,
      tags: [...((ex && ex.tags) || []), ...(tag ? [tag] : [])], createdAt: ex ? ex.createdAt : now, updatedAt: now });
    const i = places.findIndex(x => x.id === p.id);
    if (i >= 0) places[i] = p; else places.push(p);
    sync.forgetDeleted(p.id); n++;
  }
  persist();
  view = { kind: 'list' }; renderMap(); renderPanel(); setSheet('half'); fitAll();
  toast(`Added ${n} ${n === 1 ? 'place' : 'places'} from “${v.list.name}”`);
}

/* ---------- sync panel + status ---------- */
function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}
function syncLine(st = sync.getStatus()) {
  if (st.state === 'unset' || st.state === 'off') return { cls: '', txt: 'Saved on this device only · Set up sync' };
  if (st.state === 'syncing') return { cls: 'busy', txt: 'Syncing…' };
  if (st.state === 'error') return { cls: 'err', txt: navigator.onLine ? 'Sync problem · tap for details' : 'Offline · will sync when back online' };
  return { cls: 'ok', txt: `Synced ${ago(st.at)}` };
}
function renderStatus(st) {
  const f = $('#pfoot'), l = syncLine(st);
  f.className = 'pfoot ' + l.cls; $('#syncTxt').textContent = l.txt;
  if (view.kind === 'sync') renderPanel();
}
setInterval(() => { if (sync.getStatus().state === 'ok') renderStatus(sync.getStatus()); }, 30000);
function joinLink() { return `${location.origin}${location.pathname}#join=${sync.fmtCode(sync.getCode())}`; }
function renderSyncPanel(head, body) {
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button><h2 style="margin-top:6px">Sync devices</h2>`;
  const st = sync.getStatus(), code = sync.getCode();
  if (!sync.isConfigured()) {
    body.innerHTML = `<div class="idea"><p>Sync isn’t switched on yet. Pins are saved on this device only.</p>
      <p class="fine">To turn it on, the Supabase project address and public key go into <code>js/config.js</code>. See the README for the steps.</p>
      <p class="fine">Until then, use <b>Export</b> and <b>Import</b> to move pins between devices.</p></div>`;
    return;
  }
  if (!code) {
    body.innerHTML = `<div class="idea">
      <p>Keep your pins the same on your laptop and phone. Every device that uses the same <b>trip code</b> shares one set of pins.</p>
      <div><span class="l golabel">First device</span><button type="button" class="btn primary" data-newcode>Create a trip code</button>
        <p class="fine" style="margin-top:6px">Your current ${places.length} ${places.length === 1 ? 'pin' : 'pins'} will be uploaded.</p></div>
      <div><label class="l golabel" for="f-code">Already have a code?</label>
        <div class="locrow"><input type="text" id="f-code" placeholder="ABCD-EFGH-…" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="button" class="btn" data-joincode>Join</button></div>
        <p class="fine" style="margin-top:6px">Pins on this device will be merged in, not replaced.</p></div></div>`;
    $('#f-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); body.querySelector('[data-joincode]').click(); } });
    return;
  }
  const l = syncLine(st);
  body.innerHTML = `<div class="idea">
    <p class="syncstate ${l.cls}"><b></b>${esc(l.txt)}</p>
    ${st.state === 'error' && st.msg ? `<p class="fine">${esc(st.msg)}</p>` : ''}
    <div><span class="l golabel">Your trip code</span>
      <div class="codebox" id="codeTxt">${esc(sync.fmtCode(code))}</div>
      <p class="fine" style="margin-top:6px">Treat it like a password: anyone with it can see and change your pins.</p></div>
    <div><span class="l golabel">Add your phone</span>
      <p class="fine" style="margin:0 0 8px">Copy this link, send it to yourself (Notes, email, LINE…) and open it on your phone. Or type the code into Sync on the phone.</p>
      <div class="row"><button type="button" class="btn" data-copy="link">Copy phone link</button><button type="button" class="btn ghost" data-copy="code">Copy code</button></div></div>
    <div class="row"><button type="button" class="btn ghost" data-syncnow>Sync now</button><button type="button" class="btn ghost" data-unlink>Stop syncing here</button></div>
    <p class="fine">Pins sync automatically when you make a change, when you come back to the page, and every 30 seconds while it’s open.</p></div>`;
}
async function copyText(txt, what) {
  try { await navigator.clipboard.writeText(txt); toast(`${what} copied`); }
  catch { const el = $('#codeTxt'); if (el) { el.textContent = txt; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Selected. Copy it with Ctrl/Cmd+C.'); }
}

function renderTagEditor(focus = false) {
  const box = $('#tagBox'), sugs = $('#tagSugs'); if (!box || !draft) return;
  const cur = draft.tags || [];
  box.innerHTML = cur.map((t, i) => `<span class="tg edit">${esc(t)}<button type="button" data-untag="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join('') +
    `<input type="text" id="f-tag" placeholder="${cur.length ? 'Add another…' : 'Type a tag and press Enter'}" maxlength="30" autocomplete="off">`;
  const have = new Set(cur.map(t => t.toLowerCase()));
  const pool = [...allTags(), ...PRESET_TAGS].filter((t, i, a) => !have.has(t.toLowerCase()) && a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 10);
  sugs.innerHTML = pool.length ? `<span class="flabel">Quick add</span>` + pool.map(t => `<button type="button" class="tchip" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join('') : '';
  const inp = $('#f-tag');
  inp.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); addTag(inp.value); renderTagEditor(true); }
    else if (e.key === 'Enter') e.preventDefault();
    else if (e.key === 'Backspace' && !inp.value && cur.length) { draft.tags = cur.slice(0, -1); renderTagEditor(true); }
  });
  inp.addEventListener('blur', () => { if (inp.value.trim()) { addTag(inp.value); renderTagEditor(); } });
  if (focus) inp.focus();
}
function addTag(v) { draft.tags = cleanTags([...(draft.tags || []), v.replace(/^#/, '')]); }
function updateLocUI(msg, ok, bad = false) {
  const box = $('#exactBox'), hint = $('#exactHint');
  if (!box || !draft) return;
  hint.textContent = msg; box.classList.toggle('ok', ok); box.classList.toggle('bad', bad);
  $('#f-coords').textContent = `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`;
  $('#f-gmaps').href = gmapsLink(draft);
}
async function applyLoc() {
  const inp = $('#f-loc'); if (!inp || !draft) return;
  const v = inp.value.trim(); if (!v) { inp.focus(); return; }
  let loc = parseLoc(v);
  if (!loc && isShortLink(urlIn(v) || v)) {
    if (!linkHelperReady) { updateLocUI(SHORT_HELP, false, true); return; }
    const id = draft.id;
    updateLocUI('Opening the Google Maps link…', false);
    try { loc = (await resolvePasted(v)).loc; }
    catch (e) { if (draft?.id === id) updateLocUI(unfurlError(e), false, true); return; }
    if (draft?.id !== id) return;
    if (!loc) { updateLocUI('That link opened, but it has no exact location. Long-press the place in Google Maps and paste the numbers instead.', false, true); return; }
  }
  if (!loc) { updateLocUI('Couldn’t read a location from that. Paste numbers like 18.7877, 98.9934, a Google Maps link, or a Share link.', false, true); return; }
  if (!loc.name) loc.name = textBeforeUrl(v);
  draft.lat = loc.lat; draft.lng = loc.lng; draft.exact = loc.exact;
  if (!$('#f-name').value.trim() && loc.name) { $('#f-name').value = loc.name; draft.name = loc.name; }
  inp.value = '';
  updateLocUI(loc.exact ? 'Got it. Pinned at the exact spot. Save to keep it.' : 'Moved to that link’s map view centre, which may be slightly off. Coordinates are more precise.', loc.exact);
  bounceId = draft.id; renderMap(); flyVis([draft.lat, draft.lng], Math.max(map.getZoom(), 16), { duration: .6 });
}


/* ---------- phone bottom sheet ---------- */
const panelEl = $('#panel');
const SHEETS = ['peek', 'half', 'full'];
function sheetPx(state) {
  const h = document.querySelector('.app').clientHeight;
  return state === 'full' ? h - 8 : state === 'half' ? h * 0.52 : 132;
}
function setSheet(state) {
  if (!isMobile()) return;
  panelEl.dataset.sheet = state;
  if (state !== 'peek') return;
  panelEl.querySelector('.pbody').scrollTop = 0;
}
// Fly so the point lands in the middle of the map area the sheet leaves visible.
function flyVis(ll, z, opts) {
  if (!isMobile()) return map.flyTo(ll, z, opts);
  const off = Math.min(sheetPx(panelEl.dataset.sheet), sheetPx('half')) / 2;
  map.flyTo(map.unproject(map.project(ll, z).add([0, off]), z), z, opts);
}
// After tapping a pin on a phone, nudge the map if the sheet now covers it.
function keepVisible(ll) {
  if (!isMobile()) return;
  const pt = map.latLngToContainerPoint(ll), limit = map.getSize().y - sheetPx(panelEl.dataset.sheet) - 40;
  if (pt.y > limit) map.panBy([0, pt.y - limit + 40], { duration: .4 });
}
(() => {
  const grab = $('#grab');
  let y0 = 0, h0 = 0, moved = false, dragging = false;
  grab.addEventListener('pointerdown', e => {
    if (!isMobile()) return;
    dragging = true; moved = false; y0 = e.clientY; h0 = panelEl.offsetHeight;
    grab.setPointerCapture(e.pointerId); panelEl.classList.add('dragging');
  });
  grab.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - y0; if (Math.abs(dy) > 6) moved = true;
    const max = document.querySelector('.app').clientHeight - 8;
    panelEl.style.height = Math.max(90, Math.min(max, h0 - dy)) + 'px';
  });
  const end = e => {
    if (!dragging) return;
    dragging = false; panelEl.classList.remove('dragging');
    const h = panelEl.offsetHeight; panelEl.style.height = '';
    if (!moved) { const i = SHEETS.indexOf(panelEl.dataset.sheet); setSheet(SHEETS[(i + 1) % 3]); return; }
    const appH = document.querySelector('.app').clientHeight, r = h / appH, up = e.clientY < y0;
    setSheet(r > 0.72 ? 'full' : r > 0.3 ? (up && r > 0.6 ? 'full' : 'half') : (up && r > 0.22 ? 'half' : 'peek'));
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
  // In peek, tapping the panel heading opens it.
  $('#phead').addEventListener('click', e => {
    if (isMobile() && panelEl.dataset.sheet === 'peek' && !e.target.closest('button,a,input')) setSheet('half');
  });
  panelEl.dataset.sheet = 'peek';
})();
map.on('dragstart', () => { if (isMobile() && panelEl.dataset.sheet === 'full') setSheet('half'); });

/* ---------- flows ---------- */
function openEditor(p) { draft = { ...p, tags: [...(p.tags || [])] }; view = { kind: 'edit' }; setMode('browse'); renderMap(); renderPanel(); setSheet('full'); }
function openDetail(id, fly = true) {
  const p = places.find(x => x.id === id); if (!p) return;
  draft = null; setMode('browse');
  view = { kind: 'detail', id };
  renderMap(); renderPanel();
  setSheet('half');
  if (fly) flyVis([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: .6 });
  else keepVisible([p.lat, p.lng]);
}
function closeEditor() { draft = null; view = { kind: 'list' }; setMode('browse'); renderMap(); renderPanel(); setSheet('half'); }
function openPreview(item, fly = true) {
  draft = null; setMode('browse');
  view = { kind: 'preview', item };
  bounceId = '__preview';
  renderMap(); renderPanel();
  setSheet('half');
  if (fly) flyVis([item.lat, item.lng], Math.max(map.getZoom(), 16), { duration: .7 });
  else keepVisible([item.lat, item.lng]);
}
function setMode(m) {
  mode = m;
  $('#banner').hidden = m === 'browse';
  mapEl.classList.toggle('placing', m !== 'browse');
  document.querySelector('.mapwrap').classList.toggle('placing-mode', m !== 'browse');
  if (m !== 'browse') closeSearch();
}
function fitAll() {
  const shown = places.filter(visible);
  if (!shown.length) { map.flyTo(CENTER, 14, { duration: .6 }); return; }
  const b = L.latLngBounds(shown.map(p => [p.lat, p.lng]));
  map.flyToBounds(b.pad(0.25), { maxZoom: 16, duration: .7 });
}
map.on('click', e => {
  if (mode !== 'adding') { setSheet('peek'); return; }
  const id = newId();
  openEditor({ id, name: '', cat: 'see', note: '', fav: false, exact: false, lat: e.latlng.lat, lng: e.latlng.lng });
  bounceId = id; renderMap();
});

/* ---------- Google Maps links / coordinates ---------- */
function parseLoc(raw) {
  const s = String(raw || '').trim(); if (!s) return null;
  let name = '';
  const pm = s.match(/\/place\/([^/@?]+)/);
  if (pm) { try { name = decodeURIComponent(pm[1].replace(/\+/g, ' ')); } catch { name = pm[1].replace(/\+/g, ' '); } }
  const ok = (a, b) => isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
  let m;
  if ((m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/))) { const a = +m[1], b = +m[2]; if (ok(a, b)) return { lat: a, lng: b, name, exact: true }; }
  if ((m = s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i))) { const a = +m[1], b = +m[2]; if (ok(a, b)) return { lat: a, lng: b, name, exact: true }; }
  if ((m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) { const a = +m[1], b = +m[2]; if (ok(a, b)) return { lat: a, lng: b, name, exact: false }; }
  const dms = /(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NS])[\s,]+(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([EW])/i.exec(s);
  if (dms) { const a = (+dms[1] + dms[2] / 60 + dms[3] / 3600) * (/s/i.test(dms[4]) ? -1 : 1), b = (+dms[5] + dms[6] / 60 + dms[7] / 3600) * (/w/i.test(dms[8]) ? -1 : 1); if (ok(a, b)) return { lat: a, lng: b, name, exact: true }; }
  if ((m = s.match(/^\(?\s*(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})\s*\)?$/))) { const a = +m[1], b = +m[2]; if (ok(a, b)) return { lat: a, lng: b, name, exact: true }; }
  return null;
}
const isShortLink = s => /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(s);
const isListLink = s => /placelists\/list\/|!11m\d+!2s[A-Za-z0-9_-]{10,}/.test(s);
const looksLikeLink = s => /https?:\/\//i.test(s) || /google\.[a-z.]+\/maps/i.test(s);
const SHORT_HELP = 'Short share links can’t be opened yet (the link helper isn’t set up). In Google Maps, long-press the place (phone) or right-click it (computer) and copy the numbers like 18.7877, 98.9934, then paste those.';
// Phone "Share → Copy" gives text like "Home Chiang Mai Hotel\nhttps://maps.app.goo.gl/AbC". Split it.
const urlIn = s => (String(s).match(/https?:\/\/[^\s<>"']+/) || [])[0] || '';
const textBeforeUrl = s => urlIn(s) ? String(s).split(/https?:\/\//)[0].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
// A place name carried in ?q= / ?query= when the link has no coordinates.
function linkName(url) {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q') || u.searchParams.get('query') || '';
    if (q && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)) return q.split(',')[0].trim().slice(0, 80);
  } catch {}
  return '';
}

// Short links (maps.app.goo.gl) are opened by the "unfurl" helper on Supabase,
// because a browser page can't follow Google's redirects itself.
const linkHelperReady = !!(SUPABASE_URL && SUPABASE_KEY);
const unfurlCache = new Map();
async function unfurl(short) {
  if (unfurlCache.has(short)) return unfurlCache.get(short);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/unfurl`, { method: 'POST', headers, body: JSON.stringify({ url: short }), signal: ctl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(body.error || body.message || `HTTP ${res.status}`); e.status = res.status; throw e;
    }
    unfurlCache.set(short, body);
    return body;
  } finally { clearTimeout(t); }
}
function unfurlError(e) {
  if (e.status === 404) return 'The link helper isn’t installed on Supabase yet. See “Share links” in the README.';
  if (e.status === 401 || e.status === 403) return 'The link helper refused the request. In Supabase, turn off JWT verification for the “unfurl” function.';
  if (e.name === 'AbortError' || e instanceof TypeError) return navigator.onLine
    ? 'Couldn’t open that link. If the link helper isn’t set up on Supabase yet, see “Share links” in the README.'
    : 'You’re offline. Share links need a connection; pasted coordinates work offline.';
  return 'Couldn’t open that link: ' + e.message;
}
// Resolve any pasted text (coords, full link, short link, share text) to {loc, name}.
async function resolvePasted(text) {
  const direct = parseLoc(text);
  const pre = textBeforeUrl(text);
  if (direct) return { loc: { ...direct, name: direct.name || pre }, name: direct.name || pre };
  const link = urlIn(text) || text.trim();
  if (!isShortLink(link) && !isListLink(link)) return { loc: null, name: pre || linkName(link) };
  const got = await unfurl(link);
  if (got.list) return { list: got.list };
  const full = got.url || '';
  const loc = parseLoc(full);
  const name = (loc && loc.name) || pre || linkName(full);
  return { loc: loc ? { ...loc, name } : null, name };
}
let linkJob = { key: '', state: 'idle', loc: null, name: '', msg: '' };
function startLinkJob(text) {
  const key = text.trim();
  if (linkJob.key === key && linkJob.state !== 'idle') return;
  linkJob = { key, state: 'loading', loc: null, name: '', msg: '' };
  resolvePasted(text).then(r => {
    if (linkJob.key !== key) return;
    linkJob = { key, state: 'done', loc: r.loc || null, name: r.name || '', list: r.list || null, msg: '' };
    if (qEl.value.trim() === key) renderSearch();
  }).catch(e => {
    if (linkJob.key !== key) return;
    linkJob = { key, state: 'error', loc: null, name: '', msg: unfurlError(e) };
    if (qEl.value.trim() === key) renderSearch();
  });
}

/* ---------- search ---------- */
const qEl = $('#q'), sres = $('#sres'), qClear = $('#qclear');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let opts = [], active = -1;
let osm = { q: '', state: 'idle', results: [] };
const osmCache = new Map();
let osmTimer = null, osmCtl = null;

function localMatches(q) {
  const nq = norm(q); if (!nq) return [];
  const words = nq.split(' ');
  const scored = [];
  for (const d of DIR) {
    const nn = norm(d.name), hay = nn + ' ' + norm(d.alias || '');
    let s = 0;
    if (nn.startsWith(nq)) s = 100;
    else if (hay.split(' ').some(w => w.startsWith(nq))) s = 80;
    else if (hay.includes(nq)) s = 60;
    else if (words.every(w => hay.includes(w))) s = 40;
    else if (nq.length > 3 && norm(d.blurb).includes(nq)) s = 15;
    if (s) scored.push([s - nn.length / 100, d]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 5).map(x => x[1]);
}
function hl(name, q) {
  const t = q.trim(); const i = name.toLowerCase().indexOf(t.toLowerCase());
  if (!t || i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + t.length)) + '</mark>' + esc(name.slice(i + t.length));
}

// OpenStreetMap search via Photon (komoot). Free, autocomplete-friendly, no key.
function osmCat(k, v) {
  if (k === 'tourism' && /hotel|hostel|guest_house|motel|apartment|chalet|resort/.test(v)) return 'stay';
  if (k === 'amenity' && /restaurant|fast_food|food_court/.test(v)) return 'eat';
  if (k === 'amenity' && v === 'cafe') return 'cafe';
  if (k === 'amenity' && /bar|pub|nightclub/.test(v)) return 'night';
  if (k === 'shop' || (k === 'amenity' && v === 'marketplace')) return 'shop';
  if ((k === 'amenity' && v === 'place_of_worship') || k === 'historic' || (k === 'tourism' && /attraction|museum|viewpoint|gallery|artwork|zoo/.test(v))) return 'see';
  if (k === 'natural' || k === 'waterway' || (k === 'leisure' && /park|garden|nature_reserve/.test(v))) return 'nature';
  return 'other';
}
async function fetchOSM(q) {
  osmCtl?.abort();
  const ctl = new AbortController(); osmCtl = ctl;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${CENTER[0]}&lon=${CENTER[1]}&limit=10&lang=en`;
  const res = await fetch(url, { signal: ctl.signal });
  if (!res.ok) throw new Error('http ' + res.status);
  const json = await res.json();
  const seen = new Set();
  return (json.features || []).map(f => {
    const pr = f.properties || {}, [lng, lat] = f.geometry?.coordinates || [];
    const name = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ');
    const area = [pr.district || pr.locality, pr.city || pr.county, pr.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 2).join(', ');
    const street = [pr.housenumber, pr.street].filter(Boolean).join(' ');
    return { name, lat, lng, cat: osmCat(pr.osm_key, pr.osm_value), area, blurb: street && street !== name ? street : '', exact: true, source: 'osm', kind: (pr.osm_value || '').replace(/_/g, ' ') };
  }).filter(r => r.name && isFinite(r.lat) && isFinite(r.lng) && km({ lat: CENTER[0], lng: CENTER[1] }, r) < 150)
    .filter(r => { const k = r.name + Math.round(r.lat * 1e3) + Math.round(r.lng * 1e3); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
}
function scheduleOSM(q) {
  clearTimeout(osmTimer);
  const t = q.trim();
  if (t.length < 3) { osm = { q: t, state: 'idle', results: [] }; return; }
  if (osmCache.has(t)) { osm = { q: t, state: 'done', results: osmCache.get(t) }; return; }
  osm = { q: t, state: 'loading', results: [] };
  osmTimer = setTimeout(async () => {
    try {
      const results = await fetchOSM(t);
      osmCache.set(t, results);
      if (qEl.value.trim() === t) { osm = { q: t, state: 'done', results }; renderSearch(); }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (qEl.value.trim() === t) { osm = { q: t, state: 'error', results: [] }; renderSearch(); }
    }
  }, 300);
}

function optHTML(i, dot, title, sub) {
  return `<button type="button" class="sopt" role="option" data-i="${i}" id="so${i}">${dot}<span style="min-width:0"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
}
function renderSearch() {
  const q = qEl.value; qClear.hidden = !q;
  if (!q.trim()) { closeSearch(); return; }
  opts = []; let html = '';
  const direct = parseLoc(q);
  if (direct || isShortLink(q) || looksLikeLink(q)) {
    const pinDot = `<span class="dot" style="background:var(--c-eat)"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:70%;height:70%"><path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" fill="var(--accent-dk)"/><circle cx="12" cy="10" r="2.3" fill="var(--card)"/></svg></span>`;
    const exactOpt = loc => {
      opts.push({ type: 'exact', loc });
      html += '<h4>From your link</h4>' + optHTML(opts.length - 1, pinDot,
        `Drop a pin here${loc.name ? `: ${esc(loc.name)}` : ''}`, `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.exact ? '' : ' · map view centre, may be slightly off'}`);
    };
    const nameOpt = name => {
      opts.push({ type: 'searchname', name });
      html += optHTML(opts.length - 1, `<span class="dot hash">⌕</span>`, `Search for “${esc(name)}” instead`, 'Finds it on the map by name');
    };
    if (direct) exactOpt({ ...direct, name: direct.name || textBeforeUrl(q) });
    else if (isShortLink(urlIn(q) || q) || isListLink(q)) {
      if (!linkHelperReady) html += `<div class="snote">${SHORT_HELP}</div>`;
      else {
        if (linkJob.key !== q.trim()) startLinkJob(q);
        if (linkJob.state === 'loading') html += `<div class="snote"><span class="spin" aria-hidden="true"></span>Opening the Google Maps link…</div>`;
        else if (linkJob.state === 'error') html += `<div class="snote">${esc(linkJob.msg)}</div>`;
        else if (linkJob.list) {
          const L = linkJob.list, n = L.places.length;
          opts.push({ type: 'importlist', list: L });
          html += '<h4>Google Maps list</h4>' + optHTML(opts.length - 1, `<span class="dot" style="background:var(--c-see)">${artSVG('see')}</span>`,
            `Import “${esc(L.name)}”`, n ? `${n} ${n === 1 ? 'place' : 'places'} · pick which to add` : 'This list is empty');
        }
        else if (linkJob.loc) exactOpt(linkJob.loc);
        else {
          html += `<div class="snote">That link opened, but Google didn’t include the exact location in it.${linkJob.name ? '' : ' Long-press the place in Google Maps and copy the numbers instead.'}</div>`;
          if (linkJob.name) nameOpt(linkJob.name);
        }
      }
    } else {
      const name = textBeforeUrl(q) || linkName(urlIn(q));
      html += `<div class="snote">That link doesn’t include a location. Long-press the place in Google Maps and copy the numbers like 18.7877, 98.9934, or use Share → Copy link.</div>`;
      if (name) nameOpt(name);
    }
    show(html, opts.length ? 0 : -1); return;
  }
  // Your own pins and tags come first.
  const nq = norm(q.replace(/^#/, ''));
  const tagHits = nq ? allTags().filter(t => norm(t).includes(nq)).slice(0, 4) : [];
  const mine = nq && !q.trim().startsWith('#') ? places.filter(p => {
    const hay = norm(p.name) + ' ' + norm(p.note) + ' ' + (p.tags || []).map(norm).join(' ');
    return nq.split(' ').every(w => hay.includes(w));
  }).sort((a, b) => (norm(b.name).startsWith(nq) - norm(a.name).startsWith(nq)) || a.name.localeCompare(b.name)).slice(0, 6) : [];
  if (tagHits.length) {
    html += '<h4>Your tags</h4>';
    for (const t of tagHits) {
      const n = places.filter(p => (p.tags || []).some(x => x.toLowerCase() === t.toLowerCase())).length;
      opts.push({ type: 'tag', tag: t });
      html += optHTML(opts.length - 1, `<span class="dot hash">#</span>`, `Show only #${hl(t, q.replace(/^#/, ''))}`, `${n} ${n === 1 ? 'pin' : 'pins'}`);
    }
  }
  if (mine.length) {
    html += '<h4>Your pins</h4>';
    for (const p of mine) { opts.push({ type: 'mine', id: p.id }); html += optHTML(opts.length - 1, dotHTML(p.cat), hl(p.name, q), esc([(p.tags || []).map(t => '#' + t).join(' '), p.note].filter(Boolean).join(' · '))); }
  }
  if (q.trim().startsWith('#')) {
    if (!tagHits.length) html += `<div class="snote">No tag matches “${esc(q.trim())}”. Add tags when you edit a pin.</div>`;
    show(html, opts.length ? 0 : -1); return;
  }
  const local = localMatches(q).filter(d => !places.some(p => p.ideaId === d.id));
  if (local.length) {
    html += '<h4>Chiang Mai spots</h4>';
    for (const d of local) { opts.push({ type: 'item', item: { ...d, ideaId: d.id, source: 'list' } }); html += optHTML(opts.length - 1, dotHTML(d.cat), hl(d.name, q), esc(d.blurb)); }
  }
  const t = q.trim();
  if (osm.q === t && osm.state === 'done') {
    const fresh = osm.results.filter(r => !local.some(d => norm(d.name) === norm(r.name)));
    html += '<h4>On the map (OpenStreetMap)</h4>';
    if (!fresh.length) html += `<div class="snote">Nothing else found for “${esc(t)}”. Try another spelling, paste a Google Maps link, or drop a pin by hand with <b>Add a place</b>.</div>`;
    for (const r of fresh) { opts.push({ type: 'item', item: r }); html += optHTML(opts.length - 1, dotHTML(r.cat), hl(r.name, q), esc([r.kind, r.blurb, r.area].filter(Boolean).join(' · '))); }
  } else if (osm.q === t && osm.state === 'loading') {
    html += `<div class="snote"><span class="spin" aria-hidden="true"></span>Searching the map…</div>`;
  } else if (osm.q === t && osm.state === 'error') {
    html += `<div class="snote">Map search isn’t responding right now. Paste a Google Maps link instead, or try again in a moment.</div>`;
  } else if (t.length < 3 && !local.length) {
    html += `<div class="snote">Keep typing…</div>`;
  }
  show(html, Math.min(Math.max(active, 0), opts.length - 1));
}
function show(html, act) {
  sres.innerHTML = html; active = act; markActive();
  sres.hidden = false; qEl.setAttribute('aria-expanded', 'true');
}
function markActive() {
  sres.querySelectorAll('.sopt').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.i === active)));
  if (active >= 0) { qEl.setAttribute('aria-activedescendant', 'so' + active); $('#so' + active)?.scrollIntoView({ block: 'nearest' }); }
  else qEl.removeAttribute('aria-activedescendant');
}
function closeSearch() { sres.hidden = true; qEl.setAttribute('aria-expanded', 'false'); active = -1; }
function choose(i) {
  const o = opts[i]; if (!o) return;
  closeSearch(); qEl.blur();
  if (viewOnly && ['exact', 'importlist'].includes(o.type)) { toast('This is a view-only map.'); return; }
  if (o.type === 'importlist') { qEl.value = ''; qClear.hidden = true; openImport(o.list); return; }
  if (o.type === 'searchname') { qEl.value = o.name; qEl.focus(); qEl.dispatchEvent(new Event('input')); return; }
  if (o.type === 'mine') { qEl.value = ''; qClear.hidden = true; openDetail(o.id, true); return; }
  if (o.type === 'tag') {
    qEl.value = ''; qClear.hidden = true;
    tagFilter = new Set([o.tag.toLowerCase()]); view = { kind: 'list' }; draft = null;
    renderMap(); renderPanel();
    const hits = places.filter(visible);
    if (hits.length) map.flyToBounds(L.latLngBounds(hits.map(p => [p.lat, p.lng])).pad(0.3), { maxZoom: 16, duration: .7 });
    toast(`Showing #${o.tag}. Clear it in the panel.`);
    return;
  }
  if (o.type === 'exact') {
    const n = o.loc.name || '';
    const cat = /hotel|hostel|resort|residence|guest ?house|villa|inn|apartment|airbnb|condo|homestay/i.test(n) ? 'stay' : 'see';
    qEl.value = ''; qClear.hidden = true;
    const id = newId();
    openEditor({ id, name: n, cat, note: '', fav: false, exact: o.loc.exact, lat: o.loc.lat, lng: o.loc.lng });
    bounceId = id; renderMap();
    flyVis([o.loc.lat, o.loc.lng], Math.max(map.getZoom(), 16), { duration: .7 });
    return;
  }
  openPreview(o.item, true);
}
qEl.addEventListener('input', () => { active = qEl.value.trim() ? 0 : -1; if (!looksLikeLink(qEl.value)) scheduleOSM(qEl.value); renderSearch(); });
qEl.addEventListener('focus', () => { setSheet('peek'); if (qEl.value.trim()) renderSearch(); });
qEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); if (sres.hidden) renderSearch(); active = Math.min(active + 1, opts.length - 1); markActive(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); markActive(); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
  else if (e.key === 'Escape') closeSearch();
});
sres.addEventListener('pointerdown', e => e.preventDefault());
sres.addEventListener('click', e => { const b = e.target.closest('.sopt'); if (b) choose(+b.dataset.i); });
qClear.addEventListener('click', () => { qEl.value = ''; closeSearch(); qClear.hidden = true; qEl.focus(); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#search')) closeSearch(); });
// Keep map gestures from firing under the overlay controls.
for (const el of document.querySelectorAll('.ovl')) { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); }

/* ---------- export / import ---------- */
$('#exportBtn').addEventListener('click', () => {
  const data = { app: 'chiang-mai-trip-map', version: 2, exportedAt: new Date().toISOString(), places };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chiang-mai-pins-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${places.length} ${places.length === 1 ? 'pin' : 'pins'}`);
});
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = (Array.isArray(data) ? data : data.places || []).map(cleanPlace).filter(Boolean);
    if (!list.length) { toast('No pins found in that file.'); return; }
    let added = 0, updated = 0;
    const now = Date.now();
    for (const p of list) { p.updatedAt = now; sync.forgetDeleted(p.id); const i = places.findIndex(x => x.id === p.id); if (i >= 0) { places[i] = p; updated++; } else { places.push(p); added++; } }
    persist(); view = { kind: 'list' }; draft = null; renderMap(); renderPanel(); fitAll();
    toast(`Imported: ${added} new, ${updated} updated`);
  } catch { toast('That file isn’t a pins export. Choose a .json file from Export.'); }
});

/* ---------- other events ---------- */
$('#addBtn').addEventListener('click', () => {
  if (mode === 'adding') { setMode('browse'); return; }
  draft = null; view = { kind: 'list' }; renderMap(); renderPanel();
  setMode('adding');
  setSheet('peek');
});
$('#bannerCancel').addEventListener('click', () => setMode('browse'));
const openSync = () => { draft = null; setMode('browse'); view = { kind: 'sync' }; renderMap(); renderPanel(); setSheet('half'); };
$('#syncBtn').addEventListener('click', openSync);
$('#pfoot').addEventListener('click', openSync);
$('#ideasBtn').addEventListener('click', e => { showIdeas = !showIdeas; e.currentTarget.setAttribute('aria-pressed', showIdeas); renderMap(); });
$('#zfit').addEventListener('click', fitAll);
$('#locBtn').addEventListener('click', startLocate);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode !== 'browse') setMode('browse'); });

document.querySelector('.panel').addEventListener('click', e => {
  const t = e.target;
  const f = t.closest('[data-f]');
  if (f) {
    const c = f.dataset.f;
    if (filters.has(c) && filters.size === CAT_KEYS.length) filters = new Set([c]);   // first click isolates
    else if (filters.has(c)) { filters.delete(c); if (!filters.size) filters = new Set(CAT_KEYS); }
    else filters.add(c);
    renderMap(); renderPanel(); return;
  }
  const lm = t.closest('[data-listmode]');
  if (lm) { listMode = lm.dataset.listmode; if (listMode === 'near' && !me) startLocate(); if (listMode !== 'days' && dayFocus) { dayFocus = null; renderMap(); } renderPanel(); return; }
  if (t.closest('[data-hidevisited]')) { hideVisited = !hideVisited; renderMap(); renderPanel(); return; }
  if (t.closest('[data-locate]')) { startLocate(); return; }
  const df = t.closest('[data-dayfocus]');
  if (df) {
    dayFocus = df.dataset.dayfocus ? +df.dataset.dayfocus : null;
    renderMap(); renderPanel();
    const stops = places.filter(visible);
    if (dayFocus && stops.length) map.flyToBounds(L.latLngBounds(stops.map(p => [p.lat, p.lng])).pad(0.3), { maxZoom: 16, duration: .7 });
    return;
  }
  const mv = t.closest('[data-move]');
  if (mv) { moveStop(mv.dataset.move, +mv.dataset.dir); return; }
  const vb = t.closest('[data-visit]');
  if (vb) { const p = places.find(x => x.id === vb.dataset.visit); if (p) { updatePlace(p.id, { visited: !p.visited }); toast(p.visited ? 'Unmarked' : 'Marked as visited ✓'); renderMap(); renderPanel(); } return; }
  const ia = t.closest('[data-impall]');
  if (ia && view.kind === 'import') { const on = ia.dataset.impall === '1'; view.rows.forEach(r => { r.pick = on; }); renderPanel(); return; }
  if (t.closest('[data-impgo]') && view.kind === 'import') { doImport(); return; }
  if (t.closest('[data-offline]')) { saveOffline(); return; }
  if (t.closest('[data-viewlink]')) { copyViewLink(); return; }
  if (t.closest('[data-newcode]')) { sync.setCode(sync.newCode()); renderPanel(); toast('Trip code created. Now add your phone.'); return; }
  if (t.closest('[data-joincode]')) {
    const v = $('#f-code').value;
    if (!sync.setCode(v)) { toast('That code looks too short. It has 20 letters and numbers.'); $('#f-code').focus(); return; }
    renderPanel(); toast('Joined. Merging pins…'); return;
  }
  const cp = t.closest('[data-copy]');
  if (cp) { cp.dataset.copy === 'link' ? copyText(joinLink(), 'Phone link') : copyText(sync.fmtCode(sync.getCode()), 'Code'); return; }
  if (t.closest('[data-syncnow]')) { sync.syncNow(); return; }
  if (t.closest('[data-unlink]')) {
    const row = t.closest('.row');
    row.innerHTML = `<span style="font-weight:700;align-self:center">Stop syncing on this device? Your pins stay here.</span><button type="button" class="btn danger" data-unlinkyes>Stop syncing</button><button type="button" class="btn ghost" data-unlinkno>Keep</button>`;
    return;
  }
  if (t.closest('[data-unlinkno]')) { renderPanel(); return; }
  if (t.closest('[data-unlinkyes]')) { sync.clearCode(); renderPanel(); toast('Sync stopped on this device'); return; }
  const tf = t.closest('[data-tf]');
  if (tf) { const k = tf.dataset.tf.toLowerCase(); tagFilter.has(k) ? tagFilter.delete(k) : tagFilter.add(k); renderMap(); renderPanel(); return; }
  if (t.closest('[data-tfclear]')) { tagFilter.clear(); renderMap(); renderPanel(); return; }
  const un = t.closest('[data-untag]');
  if (un && draft) { draft.tags.splice(+un.dataset.untag, 1); renderTagEditor(true); return; }
  const at = t.closest('[data-addtag]');
  if (at && draft) { addTag(at.dataset.addtag); renderTagEditor(); return; }
  const ed = t.closest('[data-edit]');
  if (ed) { const p = places.find(x => x.id === ed.dataset.edit); if (p) openEditor({ ...p }); return; }
  const o = t.closest('[data-open]');
  if (o) { openDetail(o.dataset.open, true); return; }
  if (t.closest('[data-back]')) { closeEditor(); return; }
  if (t.closest('[data-loc]')) { applyLoc(); return; }
  if (t.closest('[data-adopt]') && view.kind === 'preview') {
    const i = view.item;
    const saved = savePlace({ id: newId(), name: i.name, cat: i.cat, note: i.blurb || '', fav: false, exact: i.source === 'osm' || !!i.exact, lat: i.lat, lng: i.lng, ideaId: i.ideaId || null, tags: [] });
    bounceId = saved.id; toast('Added to your map. Tap Edit pin to tag it.');
    openDetail(saved.id, false);
    return;
  }
  if (t.closest('[data-del]')) {
    $('#delRow').innerHTML = `<span style="font-weight:700;align-self:center">Delete “${esc(draft.name)}”?</span><button type="button" class="btn danger" data-delyes>Yes, delete</button><button type="button" class="btn ghost" data-delno>Keep</button>`;
    return;
  }
  if (t.closest('[data-delno]')) { renderPanel(); return; }
  if (t.closest('[data-delyes]')) { const id = draft.id; deletePlace(id); closeEditor(); toast('Pin deleted'); }
});

document.querySelector('.panel').addEventListener('change', e => {
  const sd = e.target.closest?.('[data-setday]');
  if (sd) { const d = sd.value ? +sd.value : null; updatePlace(sd.dataset.setday, { day: d, order: d ? nextOrder(d, sd.dataset.setday) : 0 }); toast(d ? `Planned for Day ${d}` : 'Removed from the plan'); renderMap(); renderPanel(); return; }
  if (view.kind !== 'import') return;
  const t = e.target;
  const pb = $('#pbody'), top = pb.scrollTop;
  if (t.dataset.imp != null) view.rows[+t.dataset.imp].pick = t.checked;
  else if (t.dataset.impcat != null) view.rows[+t.dataset.impcat].cat = t.value;
  else return;
  renderPanel(); renderMap(); pb.scrollTop = top;
});
// Another tab changed the pins → refresh.
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { load(); if (view.kind !== 'edit') { renderMap(); renderPanel(); } } });

/* ---------- boot ---------- */
(async () => {
  if (viewOnly) {
    $('#syncTxt').textContent = 'View-only shared map';
    document.querySelector('.brand p').textContent = 'a shared trip map · view only';
    if (await loadViewOnly() && places.length) fitAll();
    setInterval(() => { if (document.visibilityState === 'visible') loadViewOnly(); }, 60000);
    return;
  }
  load();
  await seedOnFirstVisit();
  renderMap(); renderPanel();
  if (places.length) fitAll();
  sync.startSync({
    getPlaces: () => places,
    applyRemote,
    onStatus: renderStatus,
    onJoined: () => { view = { kind: 'sync' }; draft = null; renderPanel(); toast('This device is now synced with your trip'); },
  });
  renderStatus(sync.getStatus());
})();
