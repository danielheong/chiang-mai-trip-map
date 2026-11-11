# Chiang Mai Trip Map

A hand-painted-style map for planning a Chiang Mai trip: pastel watercolor streets, little illustrated pins and hand-lettered names. Pin where you'll stay, eat, café-hop and wander, on real OpenStreetMap streets.

## What it does

- **Real streets, painted.** Leaflet + [OpenFreeMap](https://openfreemap.org) vector tiles (OpenStreetMap data, free, no API key) drawn with a custom watercolor style (`js/mapstyle.js`).
- **Works like an app on phones:** full-screen map with a sheet you drag up for your list and place cards.
- **Search as you type.** Instant matches from ~65 built-in Chiang Mai spots, plus live OpenStreetMap search (via [Photon](https://photon.komoot.io)) for hotels, cafés, restaurants and anything else that's mapped.
- **Exact pins from Google Maps.** Paste coordinates (`18.7877, 98.9934`) or a full Google Maps link into the search bar or a pin's *Exact location* box.
- **Tags:** add your own tags to any pin (e.g. `Day 1`, `Booked`, `Rainy day`), filter the map by tag, or type `#tag` in search.
- **Place cards:** click a pin to see its notes and tags, with one-tap **Google Maps** and **Waze** directions.
- **Search your own pins** by name, note or tag, alongside places and OpenStreetMap results.
- **You are here:** the locate button shows your position; **Near me** sorts your pins by distance.
- **Quick actions:** the **⋯** next to each place in the list opens Edit, Mark as visited, Must-go, Plan for a day, Show on map, Google Maps/Waze directions and Delete (with Undo).
- **Getting around:** the bus button on the map shows the airport, train station, bus terminals and taxi stands, plus bus stops as small dots once you zoom in. Tap one for directions. Off by default to keep the map calm.
- **Visited:** tick places off; visited pins fade on the map and can be hidden.
- **Day plans:** add as many days as you need, set the trip's start date (days show real dates and **Today**), name each day, and fill it with **+ Add places**. Every day has its own colour, badge and dotted route; tap a day chip to see just that day.
- **Per-pin details:** your own icon (lanterns, martini, elephant…), price (฿–฿฿฿฿) and opening hours with an "Open now / Closed" hint in Chiang Mai time.
- **Works offline:** the app and any map you've viewed stay on your phone; **Sync → Save Chiang Mai for offline** saves the whole area (a few MB).
- **Share:** your trip code lets friends plan with you; a **view-only link** lets others look without changing anything (needs `supabase/share.sql`, see below).
- **Pin types:** Stay, Sight, Eat, Café, Shop, Nature, Night, Other, with notes and a must-go heart. Drag any pin to move it.
- **Distances from your stay** on every pin (straight line).
- **Ideas layer:** dotted markers for classic spots you can add in one tap.
- **Saving:** pins save on the device first (works offline), then sync to your other devices through Supabase if it's set up. **Export**/**Import** still work as a backup.

## Run it locally

It's a static site with no build step, but ES modules need a local server (opening `index.html` straight from disk won't work):

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open <http://localhost:8000>.

## Put it online (free) with GitHub Pages

1. Push this folder to a GitHub repo.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
3. After a minute your map is at `https://<your-username>.github.io/<repo-name>/`. Open it on your phone and add it to your home screen.

Netlify or Cloudflare Pages work too: point them at the repo with no build command and `/` as the publish folder.

## Sync your laptop and phone (free, Supabase)

1. Sign up at [supabase.com](https://supabase.com) and create a **New project** (any name; region **Southeast Asia (Singapore)**; any database password).
2. In the project, open **SQL Editor → New query**, paste all of `supabase/setup.sql`, and press **Run**.
3. Open **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **anon / publishable** key into `js/config.js`. Never use the *secret* or *service_role* key.
4. On the laptop: **Sync → Create a trip code**. Then **Copy phone link**, send it to yourself and open it on the phone.

Your pins are protected by the 20-character trip code, which only lives on your devices. The URL and public key in `config.js` are fine to publish.

> Free Supabase projects pause after a week with no use. If sync says it can't connect, open the Supabase dashboard and press **Restore**. Your pins are still on each device in the meantime.

**What syncs:** pins, notes, tags and must-go hearts. Design changes are part of the website itself, so every device gets them on its next load once they're published.

## Share links from Google Maps (places the map can't find)

The built-in search uses OpenStreetMap, which misses some small hotels and new spots. For those, copy the place from Google Maps and paste it into the search bar:

- **Share link:** in Google Maps tap **Share → Copy link**, then paste. Short `maps.app.goo.gl` links need the one-time helper below.
- **Coordinates:** long-press (phone) or right-click (computer) the spot in Google Maps, copy the numbers like `18.7877, 98.9934`, then paste. Works offline, no setup.

**One-time helper setup (Supabase, about 2 minutes):**

1. Supabase dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `unfurl`, replace the sample code with everything in `supabase/functions/unfurl/index.ts`, and click **Deploy**.
3. Open the function's **Details** (or settings) and turn **off** "Verify JWT" / "Enforce JWT verification", then **Save**.

**Import a whole saved list:** in Google Maps open the list → **Share** (set to "anyone with the link") → copy the link, paste it into the map's search and pick **Import**. Tick the places you want, check the guessed types, and add them. Re-importing the same list later only offers places that aren't on your map yet.

> List import reads the same unofficial feed Google's own list page uses. It may stop working if Google changes it; single share links and coordinates keep working regardless. After editing `supabase/functions/unfurl/index.ts`, redeploy it in the Supabase dashboard (function → **Code** → paste → **Deploy**).

The helper only follows links to Google, so it can't be used to fetch anything else. (Google's terms don't allow Google *search* results on a non-Google map, which is why the map doesn't search Google directly.)

## iPhone home-screen app

On iPhone, an app added to the home screen keeps its own storage, separate from Safari. Use sync to share pins between them: in Safari open **Sync → Copy code**, then in the home-screen app tap **Paste code** (it offers this when it starts without a trip).

## Home-screen icon

The icon is `icons/icon.svg` (a painted Lanna temple in front of Doi Suthep), saved as `icons/icon-180.png` (iPhone), `icon-192.png` and `icon-512.png` (Android). To use your own picture, replace those PNGs with square images of the same sizes (no transparent areas), publish, then on the phone delete the old home-screen icon and add it again: iPhones save the icon at the moment you add it.

## View-only share links (one-time setup)

Supabase → **SQL Editor** → **New query**, paste all of `supabase/share.sql`, **Run**. Then in the map: **Sync → Copy view-only link**.

## Keeping Supabase awake

Free Supabase projects pause after about a week without use. `.github/workflows/keep-supabase-awake.yml` makes one tiny request every 3 days so that never happens. GitHub may switch scheduled workflows off after 60 days with no commits; re-enable it in the repo's **Actions** tab if so.

## Project layout

```
index.html            page shell
css/style.css         all styling (light + dark tokens at the top)
js/app.js             map, search, panel, storage
js/data.js            categories, pin glyphs, built-in places
js/mapstyle.js        the watercolor map colours
js/sync.js            Supabase sync (merge per pin, newest edit wins)
js/config.js          Supabase URL + public key (blank = sync off)
supabase/setup.sql    one-time database setup
supabase/share.sql    view-only share links
sw.js                 offline support (service worker)
supabase/functions/unfurl/index.ts   helper that opens Google Maps share links
data/seed-pins.json   pins loaded once on a browser's first visit
```

## Fair-use notes

- Map tiles: OpenFreeMap, © OpenStreetMap contributors. Free for light personal use with attribution (kept in the corner).
- Search: Photon is a free shared service run by komoot. It's fine for personal trip planning; don't hammer it.
- Built-in places have approximate coordinates. OpenStreetMap and Google Maps results are precise.
