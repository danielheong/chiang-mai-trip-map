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
  `{ id, name, cat, note, fav, exact, lat, lng, ideaId, createdAt, updatedAt, tags[], visited, day, order, icon, hours{open,close,closed[]}, price }`. `icon` overrides the category art (keys of `CATS` or `EXTRA_ICONS`); hours are Chiang Mai time (`openStatus`, UTC+7). `exact` = location came from OSM search, coordinates or a Google Maps link (vs. built-in/hand-placed).
- **Panel views:** `sync` (trip code) | `list` | `detail` (place card with Google Maps/Waze links) | `edit` (uses `draft`) | `preview` (search or idea result before adding).
- **Search order:** pasted coords/Google Maps link → your tags (`#tag` filters) → your pins → built-in `DIR` matches → Photon (OSM) results, debounced 300 ms, filtered to 150 km around Chiang Mai.
- **Sync:** `js/sync.js` calls Supabase RPCs `trip_get`/`trip_put` (see `supabase/setup.sql`) over plain fetch. Rows keyed by (trip code, pin id); newest `updatedAt` wins; deletes are tombstones (`cm-trip-map-deleted`); `cm-trip-map-known` tracks what the server has. Trip code lives in localStorage only; `#join=CODE` links a device. Always bump `updatedAt` via `savePlace`.
- **Share links:** short Google Maps links are resolved by the Supabase Edge Function `unfurl` (`supabase/functions/unfurl/index.ts`, deployed by hand with JWT verification off); the app then parses coords/name from the full URL (`resolvePasted` in app.js). Google Places search is deliberately not used: Google's terms forbid Places content on a non-Google map.
- **List import:** `unfurl` also detects shared saved-list links and reads Google's unofficial `maps/preview/entitylist/getlist` feed (list name + each place's name/coords/note). The `import` panel view lets the user tick places and fix guessed categories (`guessCat`); pin ids are `g<cid parts>` so re-imports don't duplicate. The user chose this knowing it's unofficial and may break.
- **List modes:** `listMode` = type | near | days. Location starts only from the locate button (`startLocate`). Days use `p.day` + `p.order`; `dayFocus` filters the map and `renderRoute` draws the dotted path.
- **Trip settings:** `trip = { days, start, titles }` (localStorage `cm-trip-map-trip`) syncs as one extra row with id `__trip`; `getPlaces`/`applyRemote`/`loadViewOnly` split it out. Days tab: add/remove/rename days, start date → real dates + Today, `daypick` view to tick places for a day, day colours (`dayColor`), badges and per-day routes.
- **Quick-action menu:** `⋯` (`data-more`) on list rows opens `#qmenu` (`openMenu`), a fixed popover appended to body; closes on outside tap, Escape, scroll, resize. Deletes go through `deleteWithUndo` (toast with Undo).
- **iPhone home-screen app:** separate storage from Safari. `showJoinHint()` shows a Paste-code card when running standalone without a trip code; `pasteAndJoin()` reads a code or `#join=` link from the clipboard.
- **Offline:** `sw.js` (network-first page, cache-first versioned assets/libs/tiles, tile index network-first). `saveOffline()` pre-fetches ~200 tiles for the city (z10–14) and province (z8–11). The in-app preview browser can't register service workers, so test offline on a real browser.
- **View-only:** `#view=CODE` sets `viewOnly`: pins load from `trip_view_get` (`supabase/share.sql`), nothing persists, editing UI is hidden by `.viewonly` CSS.
- **Spending log (private):** `js/expenses.js` owns the `spend` panel view (header **Spend** button). Entries `{ id, amount, cur: THB|MYR, what, cat, date, shared, plan, createdAt, updatedAt }` (`shared` = bill split in two, half counts; `plan` = estimate, not spent; a category's projection is max(spent, planned)) in localStorage `cm-trip-map-expenses` (+ `-set` for the ฿-per-RM rate). Deliberately **never** in the trip-code sync, the pins Export or view-only maps: the map is shared, spending is per person. Don't route it through `sync.startSync` or `places`.
- **Spending sync (one person's devices):** optional, in `expenses.js`. A separate 24-char spending code (`cm-trip-map-expenses-code`, link `#spend=CODE`) is run through HKDF to get (a) the namespace sent as `p_trip` to the same `trip_get`/`trip_put` RPCs and (b) an AES-GCM key. Rows are `{v,iv,ct}` ciphertext (the rate is row `__rate`), so the server never sees the code or readable entries. Same newest-wins/tombstone merge as pins (`-deleted`, `-known` keys). Needs a secure context (https or localhost) for WebCrypto.
- **Spending budget and pre-fill:** trip budget (MYR) lives with the rate in `cm-trip-map-expenses-set` and syncs in the `__rate` row. `#addspend=<base64url JSON {budget, items}>` adds entries from a private link (fixed ids, so no duplicates); never hard-code personal amounts in this public repo.
- **Keep-awake:** `.github/workflows/keep-supabase-awake.yml` pings `trip_get` every 3 days.
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
- Real routing/walking times between pins (OSRM or similar).
