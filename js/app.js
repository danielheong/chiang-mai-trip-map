// Chiang Mai Trip Map — main app.
// Map: Leaflet + CARTO basemap tiles (OpenStreetMap data).
// Search: built-in list (instant) + Photon geocoder (OpenStreetMap) + pasted Google Maps links/coordinates.
// Storage: localStorage, with export/import to a JSON file.
import { CATS, CAT_KEYS, IDEAS, DIR, AREAS, DECOR } from './data.js';
import { watercolorStyle } from './mapstyle.js';
import * as sync from './sync.js';

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
let mode = 'browse';            // browse | adding
let view = { kind: 'list' };    // list | edit | preview {item}
let draft = null;
let filters = new Set(CAT_KEYS);
let tagFilter = new Set();      // lower-cased tags; empty = show all
let showIdeas = true;
const hasTagMatch = p => !tagFilter.size || (p.tags || []).some(t => tagFilter.has(t.toLowerCase()));
const visible = p => filters.has(p.cat) && hasTagMatch(p);
let bounceId = null;

/* ---------- storage ---------- */
function load() {
  try { places = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { places = []; }
  if (!Array.isArray(places)) places = [];
  places = places.map(cleanPlace).filter(Boolean);   // fills in fields added later (tags, updatedAt)
}
function persist() {
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
  };
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
const PRESET_TAGS = ['Day 1', 'Day 2', 'Day 3', 'Booked', 'Want to try', 'Rainy day', 'Sunset', 'Cheap eats'];
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
  mapEl.classList.toggle('hide-idea-names', map.getZoom() < 15);
  mapEl.classList.toggle('hide-pin-names', map.getZoom() < 14);
};
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
  if (z >= 13 && z <= 16.5) for (const d of DECOR) {
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
    className: `pinicon${sel}${extra}`,
    iconSize: [48, 48], iconAnchor: [24, 44],
    html: `<div class="pin"><div class="${bob}">${artSVG(p.cat, 'art')}${heart}<span class="nm">${esc(p.name || 'New place')}</span></div></div>`,
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
  for (const p of places) {
    if (!visible(p) || p.id === editingId) continue;
    L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name, riseOnHover: true, zIndexOffset: 100 })
      .on('click', () => { if (mode === 'browse') openDetail(p.id, false); })
      .addTo(pinLayer);
  }
  if (draft && view.kind === 'edit') {
    const m = L.marker([draft.lat, draft.lng], { icon: pinIcon(draft, places.some(p => p.id === draft.id) ? '' : ' temp'), draggable: true, zIndexOffset: 1000, title: 'Drag to move' })
      .addTo(pinLayer);
    m.on('dragend', () => {
      const ll = m.getLatLng(); draft.lat = ll.lat; draft.lng = ll.lng; draft.exact = false;
      updateLocUI('Moved by hand. For a precise spot, paste coordinates from Google Maps.', false);
    });
  }
  if (view.kind === 'preview') {
    const i = view.item;
    const already = places.some(p => i.ideaId && p.ideaId === i.ideaId);
    if (!already) L.marker([i.lat, i.lng], { icon: pinIcon({ ...i, id: '__preview' }, ' temp'), zIndexOffset: 1000, interactive: false }).addTo(pinLayer);
  }
  bounceId = null;
}

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
    head.innerHTML = `<h2>My places <small>${n ? n + (n === 1 ? ' pin' : ' pins') : ''}</small></h2>
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
    const s = stayOf();
    let out = s ? '' : `<p class="lnote">Pin your stay and each place will show how far it is from your bed.</p>`;
    for (const c of CAT_KEYS) {
      if (!filters.has(c)) continue;
      const items = places.filter(p => p.cat === c && hasTagMatch(p)).sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
      if (!items.length) continue;
      out += `<div class="group"><h3>${CATS[c].label} <span>${items.length}</span></h3>` +
        items.map(p => `<button type="button" class="item" data-open="${esc(p.id)}">
          ${dotHTML(p.cat)}
          <span style="min-width:0"><span class="nm"><span>${esc(p.name)}</span>${p.fav ? '<svg class="heart" width="13" height="13" viewBox="0 0 24 24" aria-label="Must-go"><path d="M12 21 3.5 12.7A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 8.5 6.7z" fill="currentColor"/></svg>' : ''}</span>
          ${p.note ? `<span class="nt">${esc(p.note)}</span>` : ''}${p.tags?.length ? `<span class="tgs">${tagChips(p.tags)}</span>` : ''}</span>
          <span class="km">${distTxt(p)}${p.exact ? '' : '<span class="approx" title="Approximate spot. Open it and paste exact coordinates.">≈ approx</span>'}</span></button>`).join('') + `</div>`;
    }
    if (s) out += `<p class="lnote">Distances are straight-line from ${esc(s.name)}.</p>`;
    body.innerHTML = out || `<div class="empty"><p>${tagFilter.size ? 'No pins match these tags and categories.' : 'All categories are hidden. Turn some back on above.'}</p></div>`;
    return;
  }

  if (view.kind === 'sync') { renderSyncPanel(head, body); return; }

  if (view.kind === 'detail') {
    const p = places.find(x => x.id === view.id);
    if (!p) { view = { kind: 'list' }; renderPanel(); return; }
    const d = distTxt(p);
    head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>`;
    body.innerHTML = `<div class="idea">
      <div class="hero">${dotHTML(p.cat)}<div><span class="tag">${CATS[p.cat].label}${p.fav ? ' · <span class="heart">♥</span> must-go' : ''}</span>
      <h3>${esc(p.name)}</h3></div></div>
      ${p.tags?.length ? `<div class="tgs">${tagChips(p.tags)}</div>` : ''}
      ${p.note ? `<p class="dnote">${esc(p.note)}</p>` : ''}
      ${d ? `<p class="fine">About ${d} from your stay, as the crow flies.</p>` : ''}
      <div><span class="l golabel">Get there with</span>${goButtons(p)}</div>
      <div class="row"><button type="button" class="btn" data-edit="${esc(p.id)}">Edit pin</button></div>
      <p class="fine">${p.exact ? 'Exact spot.' : 'Approximate spot. Edit it and paste coordinates for a precise location.'} ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</p></div>`;
    return;
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
        <p>Full Google Maps links from a browser work too. Short <i>maps.app.goo.gl</i> share links don’t.</p></details>
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
function applyLoc() {
  const inp = $('#f-loc'); if (!inp || !draft) return;
  const v = inp.value.trim(); if (!v) { inp.focus(); return; }
  const loc = parseLoc(v);
  if (!loc) { updateLocUI(isShortLink(v) ? SHORT_HELP : 'Couldn’t read a location from that. Paste numbers like 18.7877, 98.9934 or a full Google Maps link.', false, true); return; }
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
const looksLikeLink = s => /^https?:\/\//i.test(s.trim()) || /google\.[a-z.]+\/maps/i.test(s);
const SHORT_HELP = 'Short share links can’t be opened from here. In Google Maps, right-click the place (computer) or long-press it (phone) and copy the numbers like 18.7877, 98.9934, then paste those.';

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
  const loc = parseLoc(q);
  if (loc || isShortLink(q) || looksLikeLink(q)) {
    if (loc) {
      opts.push({ type: 'exact', loc });
      html += '<h4>Exact spot</h4>' + optHTML(0, `<span class="dot" style="background:var(--accent)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" fill="var(--accent-ink)"/><circle cx="12" cy="10" r="2.3" fill="var(--accent)"/></svg></span>`,
        `Drop a pin here${loc.name ? `: ${esc(loc.name)}` : ''}`, `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.exact ? '' : ' · map view centre, may be slightly off'}`);
    } else html += `<div class="snote">${isShortLink(q) ? SHORT_HELP : 'That link doesn’t include a location. ' + SHORT_HELP}</div>`;
    show(html, loc ? 0 : -1); return;
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
qEl.addEventListener('input', () => { active = qEl.value.trim() ? 0 : -1; scheduleOSM(qEl.value); renderSearch(); });
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

// Another tab changed the pins → refresh.
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { load(); if (view.kind !== 'edit') { renderMap(); renderPanel(); } } });

/* ---------- boot ---------- */
(async () => {
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
