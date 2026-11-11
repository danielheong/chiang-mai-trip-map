// Trip essentials: where you're staying (with the address in Thai to show a driver), flights,
// booking references and emergency numbers. Saved on the device, so it works offline.
//
// Sync: if the trip is synced, the card is encrypted in the browser with a key derived from
// the trip code and stored under a separate, derived namespace. So every device with the trip
// code gets it, the server can't read it, and view-only links (which read the pin rows of the
// real trip code) never include it.
import { rpc, isConfigured, getCode } from './sync.js?v=202611112358';

const KEY = 'cm-trip-map-essentials';
const ROW = '__ess';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(d) {
  d = d && typeof d === 'object' ? d : {};
  const extra = (Array.isArray(d.extra) ? d.extra : []).map(x => ({ label: str(x?.label, 40), value: str(x?.value, 160) })).filter(x => x.label || x.value).slice(0, 10);
  return {
    stayName: str(d.stayName, 80), stayAddr: str(d.stayAddr, 240), stayThai: str(d.stayThai, 240), stayPhone: str(d.stayPhone, 40),
    checkIn: DATE_RE.test(d.checkIn) ? d.checkIn : '', checkOut: DATE_RE.test(d.checkOut) ? d.checkOut : '', stayRef: str(d.stayRef, 60),
    arrive: str(d.arrive, 120), depart: str(d.depart, 120),
    insurer: str(d.insurer, 160), embassy: str(d.embassy, 80), notes: str(d.notes, 1500),
    extra, updatedAt: +d.updatedAt || 0,
  };
}
let data = clean(null);
export function load() { try { data = clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { data = clean(null); } }
function save(next) {
  data = clean({ ...next, updatedAt: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  schedule();
}
const isEmpty = () => !(data.stayName || data.stayAddr || data.stayThai || data.arrive || data.depart || data.extra.length || data.insurer || data.embassy || data.notes || data.stayRef);
const fmtDate = d => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const tel = n => `tel:${String(n).replace(/[^0-9+]/g, '')}`;

// Thailand-wide numbers.
const EMERGENCY = [['Tourist police', '1155', 'English spoken'], ['Ambulance', '1669', 'Medical emergency'], ['Police', '191', ''], ['Fire', '199', '']];

/* ---------- view ---------- */
export function render(head, body, view, ctx) {
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>
    <div class="ptitle" style="margin-top:6px"><h2>Trip essentials</h2><span class="pcount">works offline</span></div>`;
  if (view.edit) { body.innerHTML = formHTML(ctx); return; }
  const d = data, row = (label, value, copy = true) => value ? `<div class="erow"><span class="eyebrow">${label}</span><p>${esc(value)}</p>${copy ? `<button type="button" class="linkbtn sm" data-ecopy="${esc(value)}" data-ewhat="${esc(label)}">Copy</button>` : ''}</div>` : '';
  const stayPin = ctx.stay;
  let out = '';
  if (isEmpty()) {
    out += `<div class="tnote"><b>Keep the important bits in one place</b>
      <p>Your hotel address (in Thai too, to show a driver), flight times, booking references and who to call. It stays on this device, so it opens without signal.</p>
      <div class="row"><button type="button" class="btn primary" data-eedit>Fill it in</button></div></div>`;
  } else {
    out += `<section class="esec"><h3 class="ehead">Where I’m staying</h3>
      ${d.stayName ? `<p class="ename">${esc(d.stayName)}</p>` : ''}
      ${d.stayAddr ? `<p class="eaddr">${esc(d.stayAddr)}</p>` : ''}
      ${d.stayThai ? `<p class="eaddr thai" lang="th">${esc(d.stayThai)}</p>` : ''}
      ${d.stayName || d.stayAddr || d.stayThai ? `<div class="row"><button type="button" class="btn primary" data-edriver>Show to driver</button>${d.stayPhone ? `<a class="btn" href="${tel(d.stayPhone)}">Call ${esc(d.stayPhone)}</a>` : ''}</div>` : ''}
      ${stayPin ? ctx.goButtons(stayPin) : ''}
      <div class="egrid">${row('Check-in', fmtDate(d.checkIn), false)}${row('Check-out', fmtDate(d.checkOut), false)}${row('Booking ref', d.stayRef)}</div></section>`;
    if (d.arrive || d.depart) out += `<section class="esec"><h3 class="ehead">Flights</h3><div class="egrid">${row('Arriving', d.arrive)}${row('Leaving', d.depart)}</div></section>`;
    if (d.extra.length) out += `<section class="esec"><h3 class="ehead">Bookings</h3><div class="egrid">${d.extra.map(x => row(esc(x.label || 'Booking'), x.value)).join('')}</div></section>`;
  }
  out += `<section class="esec"><h3 class="ehead">If something goes wrong</h3>
    <div class="ecalls">${EMERGENCY.map(([n, num, sub]) => `<a class="ecall" href="${tel(num)}"><b>${num}</b><span>${n}${sub ? `<small>${sub}</small>` : ''}</span></a>`).join('')}</div>
    <div class="egrid">${row('Travel insurance', d.insurer)}${d.embassy ? `<div class="erow"><span class="eyebrow">Embassy</span><p>${esc(d.embassy)}</p><a class="linkbtn sm" href="${tel(d.embassy)}">Call</a></div>` : ''}</div></section>`;
  if (d.notes) out += `<section class="esec"><h3 class="ehead">Notes</h3><p class="dnote">${esc(d.notes)}</p></section>`;
  if (!isEmpty()) out += `<div class="cardfoot"><button type="button" class="linkbtn" data-eedit>Edit essentials</button><span class="fine">${syncNote()}</span></div>`;
  else out += `<p class="fine">${syncNote()}</p>`;
  body.innerHTML = `<div class="ess">${out}</div>`;
}
function syncNote() {
  if (!isConfigured() || !getCode()) return 'Saved on this device only.';
  if (!crypto?.subtle) return 'Saved on this device only (this browser can’t encrypt it for syncing).';
  return 'Encrypted and synced to devices with your trip code. Never on view-only links.';
}
function formHTML(ctx) {
  const d = data, f = (id, label, value, ph = '', attrs = '') => `<div><label class="l" for="e-${id}">${label}</label><input type="text" id="e-${id}" name="${id}" value="${esc(value)}" placeholder="${esc(ph)}" ${attrs}></div>`;
  const pre = !d.stayName && ctx.stay ? ctx.stay.name : d.stayName;
  const extra = [...d.extra, { label: '', value: '' }];
  return `<form class="form ess" data-eform autocomplete="off">
    <h3 class="ehead">Where I’m staying</h3>
    ${f('stayName', 'Name', pre, 'e.g. Himku Hotel')}
    <div><label class="l" for="e-stayAddr">Address</label><textarea id="e-stayAddr" name="stayAddr" rows="2" placeholder="Street, district, Chiang Mai">${esc(d.stayAddr)}</textarea></div>
    <div><label class="l" for="e-stayThai">Address in Thai <small class="opt">to show a driver</small></label><textarea id="e-stayThai" name="stayThai" rows="2" lang="th" placeholder="Copy it from your booking email or the hotel’s Google Maps page">${esc(d.stayThai)}</textarea></div>
    ${f('stayPhone', 'Phone', d.stayPhone, '+66 …', 'inputmode="tel"')}
    <div class="two"><div><label class="l" for="e-checkIn">Check-in</label><input type="date" id="e-checkIn" name="checkIn" value="${d.checkIn}"></div>
      <div><label class="l" for="e-checkOut">Check-out</label><input type="date" id="e-checkOut" name="checkOut" value="${d.checkOut}"></div></div>
    ${f('stayRef', 'Booking reference', d.stayRef)}
    <h3 class="ehead">Flights</h3>
    ${f('arrive', 'Arriving', d.arrive, 'e.g. AK852 · Sat 14 Nov · lands 10:35')}
    ${f('depart', 'Leaving', d.depart, 'e.g. AK853 · Wed 18 Nov · departs 11:20')}
    <h3 class="ehead">Other bookings</h3>
    <div class="extras">${extra.map((x, i) => `<div class="xrow"><input type="text" name="xl${i}" value="${esc(x.label)}" placeholder="What (e.g. Cooking class)" aria-label="Booking ${i + 1}: what"><input type="text" name="xv${i}" value="${esc(x.value)}" placeholder="Reference, time, phone" aria-label="Booking ${i + 1}: details"></div>`).join('')}</div>
    <p class="fine" style="margin:-6px 0 0">Save to get another empty row.</p>
    <h3 class="ehead">If something goes wrong</h3>
    ${f('insurer', 'Travel insurance', d.insurer, 'Insurer · policy number · 24h phone')}
    ${f('embassy', 'Embassy phone', d.embassy, '+66 …', 'inputmode="tel"')}
    <div><label class="l" for="e-notes">Notes</label><textarea id="e-notes" name="notes" rows="3" placeholder="Anything else: Wi-Fi password, door code, SIM plan…">${esc(d.notes)}</textarea></div>
    <p class="fine">Leave out card numbers and passwords. ${syncNote()}</p>
    <div class="row"><button type="submit" class="btn primary">Save</button><button type="button" class="btn ghost" data-ecancel>Cancel</button></div>
  </form>`;
}

/* ---------- events ---------- */
export function onSubmit(form, ctx) {
  const fd = new FormData(form), g = k => String(fd.get(k) || '');
  const extra = [];
  for (let i = 0; i < 12; i++) if (fd.has('xl' + i)) extra.push({ label: g('xl' + i), value: g('xv' + i) });
  save({ stayName: g('stayName'), stayAddr: g('stayAddr'), stayThai: g('stayThai'), stayPhone: g('stayPhone'), checkIn: g('checkIn'), checkOut: g('checkOut'), stayRef: g('stayRef'),
    arrive: g('arrive'), depart: g('depart'), insurer: g('insurer'), embassy: g('embassy'), notes: g('notes'), extra });
  ctx.view.edit = false; ctx.rerender(); ctx.toast('Essentials saved');
}
// Returns true when the click belonged to this panel.
export function onClick(t, ctx) {
  if (t.closest('[data-eedit]')) { ctx.view.edit = true; ctx.rerender(); return true; }
  if (t.closest('[data-ecancel]')) { ctx.view.edit = false; ctx.rerender(); return true; }
  const c = t.closest('[data-ecopy]');
  if (c) { ctx.copyText(c.dataset.ecopy, c.dataset.ewhat || 'Text'); return true; }
  if (t.closest('[data-edriver]')) { showDriver(); return true; }
  return false;
}
// Full-screen card with big text, to hold up to a songthaew or taxi driver.
function showDriver() {
  const d = data, el = document.createElement('div');
  el.className = 'driver'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Address to show a driver');
  el.innerHTML = `<div class="dcard"><span class="dlead" lang="th">กรุณาไปส่งที่</span><span class="dsub">Please take me to</span>
    ${d.stayName ? `<p class="dname">${esc(d.stayName)}</p>` : ''}
    ${d.stayThai ? `<p class="dthai" lang="th">${esc(d.stayThai)}</p>` : ''}
    ${d.stayAddr ? `<p class="${d.stayThai ? 'den' : 'dthai'}">${esc(d.stayAddr)}</p>` : ''}
    ${d.stayPhone ? `<p class="dphone">${esc(d.stayPhone)}</p>` : ''}
    <button type="button" class="btn">Close</button></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('button')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector('button').focus();
}

/* ---------- encrypted sync across devices that share the trip code ---------- */
let hooks = null, timer = null, busy = false;
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function keysFor(code) {
  const te = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', te.encode(code), 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('cm-trip-map-essentials-v1'), info: te.encode('namespace+key') }, base, 8 * 52));
  const ns = 'e' + [...bits.slice(0, 20)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', bits.slice(20), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { ns, key };
}
export async function syncNow() {
  const code = getCode();
  if (busy || !isConfigured() || !code || !crypto?.subtle) return;
  busy = true;
  try {
    const { ns, key } = await keysFor(code);
    const rows = await rpc('trip_get', { p_trip: ns });
    const row = (Array.isArray(rows) ? rows : []).find(r => r.id === ROW && !r.deleted && r.data?.ct);
    if (row && row.updated_at > data.updatedAt) {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.data.iv) }, key, unb64(row.data.ct));
      data = clean({ ...JSON.parse(new TextDecoder().decode(plain)), updatedAt: row.updated_at });
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
      hooks?.onChange?.();
    } else if (data.updatedAt > (row?.updated_at || 0)) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
      await rpc('trip_put', { p_trip: ns, p_rows: [{ id: ROW, data: { v: 1, iv: b64(iv), ct: b64(ct) }, deleted: false, updated_at: data.updatedAt }] });
    }
  } catch { /* offline or not set up: the local copy is still there */ } finally { busy = false; }
}
function schedule() { clearTimeout(timer); timer = setTimeout(syncNow, 900); }
export function startSync(h) {
  hooks = h; syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
}
