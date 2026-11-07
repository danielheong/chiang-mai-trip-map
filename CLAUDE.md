# CLAUDE.md

Notes for Claude Code working in this repo.

## What this is
A personal Chiang Mai trip-planning map. Static site, **no build step, no npm dependencies**. Leaflet 1.9.4 loads from unpkg in `index.html`; `js/app.js` is an ES module that imports `js/data.js`.

## Run / check
- Serve locally: `python3 -m http.server 8000`, then open http://localhost:8000
- Syntax check: `node --check js/app.js && node --check js/data.js`
- Deploy: GitHub Pages from `main` / root (`.nojekyll` is present).
- **Before every deploy commit run `tools/bump-version.sh`.** It stamps `?v=` on the CSS/JS references in index.html and on the local imports in js/app.js and js/sync.js, so phones don't keep running a cached old version. New local imports must use the same `?v=` pattern (all imports of a module need the identical string, or the browser loads it twice).

## Architecture
- **Map:** Leaflet + OpenFreeMap vector tiles via MapLibre GL (`maplibre-gl-leaflet`), drawn with our own style object from `js/mapstyle.js`. CARTO free tiles now need an API key, so don't go back to them.
- **Pins:** `L.divIcon` painted SVGs from `CATS[cat].art` (`js/data.js`) with `--c-<cat>` wash colours. Night = martini glass, Other = quiet flower.
- **State:** `places` array in localStorage key `cm-trip-map-places`. Place shape:
  `{ id, name, cat, note, fav, exact, lat, lng, ideaId, createdAt, tags[] }`. `exact` = location came from OSM search, coordinates or a Google Maps link (vs. built-in/hand-placed).
- **Panel views:** `sync` (trip code) | `list` | `detail` (place card with Google Maps/Waze links) | `edit` (uses `draft`) | `preview` (search or idea result before adding).
- **Search order:** pasted coords/Google Maps link → your tags (`#tag` filters) → your pins → built-in `DIR` matches → Photon (OSM) results, debounced 300 ms, filtered to 150 km around Chiang Mai.
- **Sync:** `js/sync.js` calls Supabase RPCs `trip_get`/`trip_put` (see `supabase/setup.sql`) over plain fetch. Rows keyed by (trip code, pin id); newest `updatedAt` wins; deletes are tombstones (`cm-trip-map-deleted`); `cm-trip-map-known` tracks what the server has. Trip code lives in localStorage only; `#join=CODE` links a device. Always bump `updatedAt` via `savePlace`.
- **Share links:** short Google Maps links are resolved by the Supabase Edge Function `unfurl` (`supabase/functions/unfurl/index.ts`, deployed by hand with JWT verification off); the app then parses coords/name from the full URL (`resolvePasted` in app.js). Google Places search is deliberately not used: Google's terms forbid Places content on a non-Google map.
- **List import:** `unfurl` also detects shared saved-list links and reads Google's unofficial `maps/preview/entitylist/getlist` feed (list name + each place's name/coords/note). The `import` panel view lets the user tick places and fix guessed categories (`guessCat`); pin ids are `g<cid parts>` so re-imports don't duplicate. The user chose this knowing it's unofficial and may break.
- **Export/Import:** JSON `{ app, version, exportedAt, places }`; import merges by `id`.

## Style
- Look: pastel watercolor illustrated map (inspired by hand-painted city maps). One deliberate light theme, no dark mode.
- Basemap: hand-built MapLibre style in `js/mapstyle.js` (colours in `PAINT`). Paper/wash texture is the `.paper` overlay in CSS.
- Pins are small paintings: `CATS[cat].art` in `js/data.js` (48×48 SVG, ink #4A4036), run through the `#wc` SVG filter defined in `index.html`. Area names (`AREAS`) and decorations (`DECOR`) are painted as non-interactive markers.
- Fonts: Amatic SC (titles), Patrick Hand (UI labels, pin names), Nunito (body text).
- Tokens are CSS custom properties at the top of `css/style.css`; `--wobble` is the hand-drawn pill radius.
- Phone (≤860px): full-screen map, panel is a bottom sheet (`#panel[data-sheet=peek|half|full]`, `setSheet()` in app.js).
- Declutter: built-in ideas are off by default; pins closer than ~38px bundle (`clusterPins`, off at zoom ≥17); every pin name stays visible and `declutterLabels()` moves it right → below → left → above to avoid overlaps (only idea names may hide); `shortName()` trims long names on the map; icon size scales with zoom via `--ps`.
- The map needs requestAnimationFrame, so it stays blank in a hidden/background browser tab; that's not a bug.

## Ideas not built yet
- Day-by-day itinerary (assign pins to days, draw each day's route).
- Real routing/walking times between pins (OSRM or similar).
