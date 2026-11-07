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
data/seed-pins.json   pins loaded once on a browser's first visit
```

## Fair-use notes

- Map tiles: OpenFreeMap, © OpenStreetMap contributors. Free for light personal use with attribution (kept in the corner).
- Search: Photon is a free shared service run by komoot. It's fine for personal trip planning; don't hammer it.
- Built-in places have approximate coordinates. OpenStreetMap and Google Maps results are precise.
