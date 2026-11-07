# CLAUDE.md

Notes for Claude Code working in this repo.

## What this is
A personal Chiang Mai trip-planning map. Static site, **no build step, no npm dependencies**. Leaflet 1.9.4 loads from unpkg in `index.html`; `js/app.js` is an ES module that imports `js/data.js`.

## Run / check
- Serve locally: `python3 -m http.server 8000`, then open http://localhost:8000
- Syntax check: `node --check js/app.js && node --check js/data.js`
- Deploy: GitHub Pages from `main` / root (`.nojekyll` is present).

## Architecture
- **Map:** Leaflet + OpenFreeMap vector tiles via MapLibre GL (`maplibre-gl-leaflet`); styles `liberty` (light) / `dark`, chosen by `prefers-color-scheme` (`STYLE_LIGHT`/`STYLE_DARK` in app.js). CARTO free tiles now need an API key, so don't go back to them.
- **Pins:** `L.divIcon` teardrop SVGs; glyphs and colours per category live in `CATS` (`js/data.js`) and the `--c-<cat>` CSS tokens.
- **State:** `places` array in localStorage key `cm-trip-map-places`. Place shape:
  `{ id, name, cat, note, fav, exact, lat, lng, ideaId, createdAt, tags[] }`. `exact` = location came from OSM search, coordinates or a Google Maps link (vs. built-in/hand-placed).
- **Panel views:** `list` | `detail` (place card with Google Maps/Waze links) | `edit` (uses `draft`) | `preview` (search or idea result before adding).
- **Search order:** pasted coords/Google Maps link → your tags (`#tag` filters) → your pins → built-in `DIR` matches → Photon (OSM) results, debounced 300 ms, filtered to 150 km around Chiang Mai.
- **Sync:** `js/sync.js` calls Supabase RPCs `trip_get`/`trip_put` (see `supabase/setup.sql`) over plain fetch. Rows keyed by (trip code, pin id); newest `updatedAt` wins; deletes are tombstones (`cm-trip-map-deleted`); `cm-trip-map-known` tracks what the server has. Trip code lives in localStorage only; `#join=CODE` links a device. Always bump `updatedAt` via `savePlace`.
- **Export/Import:** JSON `{ app, version, exportedAt, places }`; import merges by `id`.

## Style
- Design tokens are CSS custom properties at the top of `css/style.css`, with dark values under `prefers-color-scheme: dark` and `[data-theme]`. Use tokens, never literal colours.
- Fonts: Mali (display/labels), Nunito (body).
- Keep it cute but tidy: sticker-style cards (2px ink border + offset shadow), rounded pills.
- Must work at ~400px phone width.

## Ideas not built yet
- Day-by-day itinerary (assign pins to days, draw each day's route).
- Real routing/walking times between pins (OSRM or similar).
- Google Places search (needs an API key with billing).
