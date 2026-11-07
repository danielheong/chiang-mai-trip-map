// Supabase Edge Function "unfurl": turns a Google Maps share link
// (maps.app.goo.gl/…, goo.gl/maps/…) into the full Google Maps URL it points to,
// so the trip map can read the place's name and coordinates from it.
//
// It only ever follows links to Google hosts, so it can't be used as a general proxy.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > Via Editor,
// name it "unfurl", paste this file, Deploy. Then in the function's Details,
// turn OFF "Verify JWT with legacy secret" / "Enforce JWT verification".

const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+|consent\.google\.[a-z.]+)$/i;
const SHORT = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let raw = "";
  try { raw = String((await req.json()).url || "").trim(); } catch { return json({ error: "Send {\"url\": \"…\"}" }, 400); }
  if (raw.length > 2000) return json({ error: "Link is too long" }, 400);

  let u: URL;
  try { u = new URL(raw); } catch { return json({ error: "That isn't a link" }, 400); }

  for (let hop = 0; hop < 6; hop++) {
    if (u.protocol !== "https:" && u.protocol !== "http:") break;
    if (!ALLOWED.test(u.hostname)) return json({ error: "Only Google Maps links are supported" }, 400);
    // Cookie-consent interstitial: the real destination is in ?continue=
    if (/^consent\./i.test(u.hostname)) {
      const next = u.searchParams.get("continue");
      if (!next) break;
      u = new URL(next);
      continue;
    }
    // Already a full Google Maps link: done.
    if (!SHORT.test(u.hostname)) break;
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (trip-map link reader)" } });
    const loc = res.headers.get("location");
    await res.body?.cancel();
    if (!loc) break;
    u = new URL(loc, u);
  }

  // A shared saved list ("Want to go", custom lists): read its places.
  const listId = listIdOf(u.toString());
  if (listId) {
    try {
      return json({ url: u.toString(), list: await readList(listId) });
    } catch (e) {
      return json({ url: u.toString(), error: `Couldn't read that list (${(e as Error).message}). Make sure it's shared with "anyone with the link".` }, 502);
    }
  }
  return json({ url: u.toString() });
});

// List links look like …/maps/placelists/list/<ID> or …/data=…!11m2!2s<ID>!3e3…
function listIdOf(s: string): string {
  const m = s.match(/\/placelists\/list\/([A-Za-z0-9_-]{10,40})/) || s.match(/!11m\d+!2s([A-Za-z0-9_-]{10,40})/);
  return m ? m[1] : "";
}

// Unofficial: this is the feed Google's own list page loads. It may change without notice.
// Only the list name and each place's name, coordinates and note are passed on.
async function readList(id: string) {
  const pb = `!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
  const res = await fetch(`https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=th&pb=${encodeURIComponent(pb)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (trip-map list reader)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = JSON.parse(text.slice(text.indexOf("\n") + 1));   // strip the )]}' guard line
  const L = data?.[0];
  if (!Array.isArray(L)) throw new Error("unexpected format");
  const places = [];
  for (const it of Array.isArray(L[8]) ? L[8] : []) {
    const info = it?.[1], ll = info?.[5], ids = info?.[6];
    const lat = Number(ll?.[2]), lng = Number(ll?.[3]), name = String(it?.[2] ?? "").trim();
    if (!name || !isFinite(lat) || !isFinite(lng)) continue;
    places.push({
      gid: Array.isArray(ids) ? ids.join(":") : "",
      name: name.slice(0, 80),
      lat, lng,
      note: String(it?.[3] ?? "").slice(0, 2000),
      address: String(info?.[4] ?? "").slice(0, 200),
    });
  }
  return { id, name: String(L[4] ?? "Saved list").slice(0, 60), places };
}
