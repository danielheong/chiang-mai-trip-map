// Cloud sync for pins via Supabase (plain REST calls, no library).
// Each pin is one row keyed by (trip code, pin id). The newest edit wins per pin;
// deletions are kept as "deleted" rows so other devices remove the pin too.
// Works offline: pins always save locally first and sync when a connection is back.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202611190007';

const CODE_KEY = 'cm-trip-map-sync-code';
const TOMB_KEY = 'cm-trip-map-deleted';     // { id: deletedAtMs }
const KNOWN_KEY = 'cm-trip-map-known';      // { id: updatedAtMs the server has }
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L
const POLL_MS = 30000;

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let hooks = null, timer = null, running = false, again = false;
let status = { state: 'off', at: 0, msg: '' };

export const isConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const fmtCode = c => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
export function getCode() { const c = read(CODE_KEY, ''); return typeof c === 'string' ? c : ''; }
export function getStatus() { return status; }
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  return [...b].map(x => ALPHABET[x % ALPHABET.length]).join('');
}
export function setCode(c) {
  const n = normCode(c);
  if (n.length < 16) return false;
  write(CODE_KEY, n); write(KNOWN_KEY, {});
  setStatus('syncing'); syncNow();
  return true;
}
export function clearCode() {
  try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(KNOWN_KEY); } catch {}
  setStatus('off');
}
export function markDeleted(id) { const t = read(TOMB_KEY, {}); t[id] = Date.now(); write(TOMB_KEY, t); }
export function forgetDeleted(id) { const t = read(TOMB_KEY, {}); if (id in t) { delete t[id]; write(TOMB_KEY, t); } }

function setStatus(state, msg = '') {
  status = { state, at: state === 'ok' ? Date.now() : status.at, msg };
  hooks?.onStatus?.(status);
}

export async function rpc(fn, body) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;   // legacy anon JWT
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json()).message || ''; } catch {}
      const e = new Error(detail || `HTTP ${res.status}`); e.status = res.status; throw e;
    }
    return await res.json();
  } finally { clearTimeout(t); }
}

/* ---------- shared by pins, shared bills and private spending ----------
   Newest edit wins per row; deletes are kept as tombstones until the server has them. The network is awaited
   first; what the server sent is then applied to the data as it is *now* (re-read through get(), tombstones
   re-read too), so an edit, add or delete made while a sync was running stays as it is and goes up next round.
   (Before 18 Nov 2026 each store wrote back a snapshot taken before the network wait, which could undo such
   changes or bring a deleted item back.)
   o = { ns, get, put, tombKey, known, saveKnown, open?, seal? }
     get(): the store's rows now ([{ id, updatedAt, … }]); put(rows): replace the store with these rows;
     known: { id: updated_at the server has } (updated in place); open/seal: decrypt/encrypt a row's data. */
export async function syncRows(o) {
  const open = o.open || ((id, d) => d), seal = o.seal || ((id, x) => x), known = o.known;
  const ts = x => (x ? x.updatedAt || x.createdAt || 1 : 0);
  const rows = await rpc('trip_get', { p_trip: o.ns });
  const snap = new Map(o.get().map(x => [x.id, x])), tombs0 = read(o.tombKey, {});
  const incoming = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const lu = Math.max(ts(snap.get(r.id)), tombs0[r.id] || 0);
    const tie = r.updated_at === lu && !(r.id in known);   // on a tie the first time this device sees a row, the server's copy wins
    if (r.updated_at > lu || tie) {
      if (r.deleted) incoming.push({ id: r.id, at: r.updated_at, tie, del: true });
      else if (r.data && typeof r.data === 'object') {
        const obj = await open(r.id, r.data);
        if (obj) incoming.push({ id: r.id, at: r.updated_at, tie, obj: { ...obj, id: r.id, updatedAt: r.updated_at } });
      }
    }
    known[r.id] = r.updated_at;
  }
  const out = [];
  for (const x of snap.values()) if (ts(x) > (known[x.id] || 0)) out.push({ id: x.id, data: await seal(x.id, x), deleted: false, updated_at: ts(x) });
  for (const [id, at] of Object.entries(tombs0)) if (!snap.has(id) && at > (known[id] || 0)) out.push({ id, data: null, deleted: true, updated_at: at });
  for (let i = 0; i < out.length; i += 400) {
    const chunk = out.slice(i, i + 400);
    await rpc('trip_put', { p_trip: o.ns, p_rows: chunk });
    for (const r of chunk) known[r.id] = r.updated_at;
  }
  // No awaits from here on: apply to the current data.
  const cur = new Map(o.get().map(x => [x.id, x])), tombs = read(o.tombKey, {});
  let changed = false;
  for (const c of incoming) {
    const lu = Math.max(ts(cur.get(c.id)), tombs[c.id] || 0);
    if (!(c.at > lu || (c.tie && c.at === lu))) continue;   // changed on this device meanwhile: keep it
    if (c.del) { if (cur.delete(c.id)) changed = true; tombs[c.id] = c.at; }
    else { cur.set(c.id, c.obj); delete tombs[c.id]; changed = true; }
  }
  for (const id of Object.keys(tombs)) if (known[id] >= tombs[id]) delete tombs[id];
  write(o.tombKey, tombs); o.saveKnown(known);
  if (changed) o.put([...cur.values()]);
  return changed;
}

/* One timer and one set of wake-ups for every sync (pins, shared bills, spending, essentials) instead of one
   each: every 30 s while the app is on screen, when it comes back on screen, and when the signal returns.
   Each sync skips itself when it isn't set up. */
const ticks = new Set();
let tickPoll = null;
const runTicks = () => { for (const fn of ticks) fn(); };
export function onSyncTick(fn) {
  ticks.add(fn);
  if (tickPoll) return;
  tickPoll = setInterval(() => { if (document.visibilityState === 'visible') runTicks(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runTicks(); });
  window.addEventListener('online', runTicks);
}

// Pins: pull everything for this trip, merge, push whatever this device has that's newer.
export async function syncNow() {
  const code = getCode();
  if (!isConfigured() || !code || !hooks) return;
  if (running) { again = true; return; }
  running = true; setStatus('syncing');
  try {
    await syncRows({ ns: code, get: hooks.getPlaces, put: rows => { if (getCode() === code) hooks.applyRemote(rows); },
      tombKey: TOMB_KEY, known: read(KNOWN_KEY, {}), saveKnown: k => write(KNOWN_KEY, k) });
    setStatus('ok');
  } catch (e) {
    const offline = e.name === 'AbortError' || e instanceof TypeError || !navigator.onLine;
    setStatus('error', offline
      ? 'Can’t reach the sync server. Pins are saved on this device and will sync when you’re back online.'
      : e.status === 404 ? 'Sync server is missing its setup. Run supabase/setup.sql in Supabase.'
      : e.status === 401 || e.status === 403 ? 'Sync key was refused. Check SUPABASE_KEY in js/config.js.'
      : `Sync failed: ${e.message}`);
  } finally {
    running = false;
    if (again) { again = false; schedule(300); }
  }
}

export function schedule(ms = 800) {
  if (!isConfigured() || !getCode()) return;
  clearTimeout(timer); timer = setTimeout(syncNow, ms);
}

export function startSync(h) {
  hooks = h;
  onSyncTick(syncNow);
  // A "link this device" URL looks like  …/#join=ABCD-EFGH-…
  const m = location.hash.match(/^#join=([A-Za-z0-9-]+)$/);
  if (m && isConfigured()) {
    history.replaceState(null, '', location.pathname + location.search);
    if (normCode(m[1]) !== getCode()) { setCode(m[1]); hooks.onJoined?.(); return; }
  }
  if (!isConfigured()) { setStatus('unset'); return; }
  if (!getCode()) { setStatus('off'); return; }
  syncNow();
}
