// Offline support for the trip map.
// - The page itself: network first, cached copy when offline.
// - App files (versioned with ?v=), libraries and fonts: cached after first use.
// - Map tiles and map fonts: cached as you browse, plus "Save Chiang Mai for offline".
// - Sync (Supabase) and place search are never cached: they need a connection.
const APP = 'cm-app-v1';
const LIBS = 'cm-libs-v1';
const MAP = 'cm-map-v1';
const MAP_LIMIT = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = [APP, LIBS, MAP];
  for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

const LIB_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json')) {
      e.respondWith(networkFirst(req, APP, req.mode === 'navigate' ? './' : null));
    } else {
      e.respondWith(cacheFirst(req, APP, true));
    }
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req, LIBS)); return; }
  if (url.hostname === 'tiles.openfreemap.org') {
    // The tile index (/planet) changes weekly; prefer fresh, fall back to the saved one offline.
    if (/^\/planet\/?$/.test(url.pathname)) e.respondWith(networkFirst(req, MAP));
    else e.respondWith(cacheFirst(req, MAP, false, true));
  }
});

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey && req.mode === 'navigate' ? fallbackKey : req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' }) || (fallbackKey && await cache.match(fallbackKey));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, versioned = false, limit = false) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    if (versioned) dropOldVersions(cache, req.url);
    if (limit) trim(cache);
  }
  return res;
}

// After an update, remove older ?v= copies of the same file.
async function dropOldVersions(cache, href) {
  const u = new URL(href); if (!u.searchParams.has('v')) return;
  for (const k of await cache.keys()) {
    const ku = new URL(k.url);
    if (ku.pathname === u.pathname && ku.searchParams.get('v') !== u.searchParams.get('v')) cache.delete(k);
  }
}
let trimming = false;
async function trim(cache) {
  if (trimming) return; trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAP_LIMIT; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}
