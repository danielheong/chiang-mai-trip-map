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
  return json({ url: u.toString() });
});
