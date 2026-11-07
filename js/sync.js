// Cloud sync for pins via Supabase (plain REST calls, no library).
// Each pin is one row keyed by (trip code, pin id). The newest edit wins per pin;
// deletions are kept as "deleted" rows so other devices remove the pin too.
// Works offline: pins always save locally first and sync when a connection is back.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202611080049';

const CODE_KEY = 'cm-trip-map-sync-code';
const TOMB_KEY = 'cm-trip-map-deleted';     // { id: deletedAtMs }
const KNOWN_KEY = 'cm-trip-map-known';      // { id: updatedAtMs the server has }
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L
const POLL_MS = 30000;

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let hooks = null, timer = null, poll = null, running = false, again = false;
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
  setStatus('syncing'); syncNow(); startPolling();
  return true;
}
export function clearCode() {
  try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(KNOWN_KEY); } catch {}
  stopPolling(); setStatus('off');
}
export function markDeleted(id) { const t = read(TOMB_KEY, {}); t[id] = Date.now(); write(TOMB_KEY, t); }
export function forgetDeleted(id) { const t = read(TOMB_KEY, {}); if (id in t) { delete t[id]; write(TOMB_KEY, t); } }

function setStatus(state, msg = '') {
  status = { state, at: state === 'ok' ? Date.now() : status.at, msg };
  hooks?.onStatus?.(status);
}

async function rpc(fn, body) {
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

// Pull everything for this trip, merge, then push whatever this device has that's newer.
export async function syncNow() {
  const code = getCode();
  if (!isConfigured() || !code || !hooks) return;
  if (running) { again = true; return; }
  running = true; setStatus('syncing');
  try {
    const rows = await rpc('trip_get', { p_trip: code });
    const local = new Map(hooks.getPlaces().map(p => [p.id, p]));
    const tombs = read(TOMB_KEY, {}), known = read(KNOWN_KEY, {});
    let changed = false;
    for (const r of Array.isArray(rows) ? rows : []) {
      const lp = local.get(r.id);
      const lu = Math.max(lp ? (lp.updatedAt || lp.createdAt || 1) : 0, tombs[r.id] || 0);
      // On a tie the first time this device sees a pin, the trip's copy wins.
      if (r.updated_at > lu || (r.updated_at === lu && !(r.id in known))) {
        if (r.deleted) { if (local.delete(r.id)) changed = true; tombs[r.id] = r.updated_at; }
        else if (r.data && typeof r.data === 'object') { local.set(r.id, { ...r.data, id: r.id, updatedAt: r.updated_at }); delete tombs[r.id]; changed = true; }
      }
      known[r.id] = r.updated_at;
    }
    const out = [];
    for (const p of local.values()) {
      const u = p.updatedAt || p.createdAt || 1;
      if (u > (known[p.id] || 0)) out.push({ id: p.id, data: p, deleted: false, updated_at: u });
    }
    for (const [id, ts] of Object.entries(tombs)) {
      if (!local.has(id) && ts > (known[id] || 0)) out.push({ id, data: null, deleted: true, updated_at: ts });
    }
    for (let i = 0; i < out.length; i += 400) {
      const chunk = out.slice(i, i + 400);
      await rpc('trip_put', { p_trip: code, p_rows: chunk });
      for (const r of chunk) known[r.id] = r.updated_at;
    }
    // Tombstones the server already has are no longer needed locally.
    for (const id of Object.keys(tombs)) if (known[id] >= tombs[id]) delete tombs[id];
    write(TOMB_KEY, tombs); write(KNOWN_KEY, known);
    if (changed) hooks.applyRemote([...local.values()]);
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
function startPolling() {
  stopPolling();
  poll = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, POLL_MS);
}
function stopPolling() { clearInterval(poll); poll = null; }

export function startSync(h) {
  hooks = h;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  // A "link this device" URL looks like  …/#join=ABCD-EFGH-…
  const m = location.hash.match(/^#join=([A-Za-z0-9-]+)$/);
  if (m && isConfigured()) {
    history.replaceState(null, '', location.pathname + location.search);
    if (normCode(m[1]) !== getCode()) { setCode(m[1]); hooks.onJoined?.(); return; }
  }
  if (!isConfigured()) { setStatus('unset'); return; }
  if (!getCode()) { setStatus('off'); return; }
  syncNow(); startPolling();
}
