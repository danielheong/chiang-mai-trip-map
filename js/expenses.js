// Personal spending log. PRIVATE to one person on purpose: it is never sent with the
// shared trip code, never included in the pins Export file and never visible through
// view-only share links.
// Optional sync between ONE person's own devices uses a separate secret "spending code".
// Entries are encrypted on the device (AES-GCM, key derived from the code) before upload,
// and stored under a namespace also derived from the code, so the server holds only
// scrambled text and never sees the code. Same trip_get/trip_put functions as the pins.
import { rpc, isConfigured } from './sync.js?v=202611112358';

const KEY = 'cm-trip-map-expenses';
const SET_KEY = 'cm-trip-map-expenses-set';
const CODE_KEY = 'cm-trip-map-expenses-code';
const TOMB_KEY = 'cm-trip-map-expenses-deleted';   // { id: deletedAtMs }
const KNOWN_KEY = 'cm-trip-map-expenses-known';    // { id: updatedAtMs the server has }
const RATE_ID = '__rate';                          // the baht rate syncs as one extra row
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_RATE = 7.8;   // Thai baht per 1 Malaysian ringgit; an estimate, editable in the panel

export const XCATS = {
  food: { label: 'Food', c: 'eat' },
  drinks: { label: 'Cafés & drinks', c: 'cafe' },
  transport: { label: 'Getting around', c: 'other' },
  stay: { label: 'Stay', c: 'stay' },
  fun: { label: 'Sights & activities', c: 'see' },
  shop: { label: 'Shopping', c: 'shop' },
  flights: { label: 'Flights', c: 'night' },
  misc: { label: 'Everything else', c: 'nature' },
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let items = [];
let rate = DEFAULT_RATE;
let rateAt = 0;       // when the rate was last changed by hand (0 = still the default)
let budget = 0;       // whole-trip budget in MYR (0 = not set); syncs with the rate
let lastCur = 'THB';
// My part of each shared bill (js/bills.js), handed in by app.js. They count as spending here
// but live in the shared ledger, so they are shown read-only and never stored in this log.
let sharesFn = () => [];
export const setShares = fn => { sharesFn = fn; };
const billRows = () => sharesFn().map(s => ({ id: 'bill:' + s.id, amount: s.amount, cur: s.cur, what: s.what, cat: XCATS[s.cat] ? s.cat : 'misc', date: s.date, shared: false, plan: false, createdAt: s.createdAt, bill: s }));

function clean(x) {
  const amount = Math.round(+x?.amount * 100) / 100;
  if (!x || !isFinite(amount) || amount <= 0) return null;
  return {
    id: typeof x.id === 'string' && x.id ? x.id : newId(),
    amount, cur: x.cur === 'MYR' ? 'MYR' : 'THB',
    what: typeof x.what === 'string' ? x.what.trim().slice(0, 80) : '',
    cat: XCATS[x.cat] ? x.cat : 'misc',
    date: DATE_RE.test(x.date) ? x.date : today(),
    shared: !!x.shared,   // a bill split in two: the full amount is typed, half counts as mine
    plan: !!x.plan,       // an estimate made before the trip, not money spent yet
    createdAt: +x.createdAt || Date.now(),
    updatedAt: +x.updatedAt || +x.createdAt || Date.now(),
  };
}
export function load() {
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { items = []; }
  items = (Array.isArray(items) ? items : []).map(clean).filter(Boolean);
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
    if (+s.rate > 0) rate = +s.rate;
    rateAt = +s.rateAt || 0;
    if (+s.budget > 0) budget = +s.budget;
    if (s.cur === 'MYR' || s.cur === 'THB') lastCur = s.cur;
  } catch {}
}
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(SET_KEY, JSON.stringify({ rate, rateAt, budget, cur: lastCur }));
    return true;
  } catch { return false; }
}
function persist() { const ok = store(); schedule(); return ok; }
export const count = () => items.length;
const toMYR = x => (x.cur === 'MYR' ? x.amount : x.amount / rate);
const mine = x => toMYR(x) * (x.shared ? 0.5 : 1);   // my share, in ringgit
const sum = list => list.reduce((t, x) => t + mine(x), 0);
const num = (n, dp) => n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const rm = n => 'RM ' + num(n, 2);
const money = x => (x.cur === 'MYR' ? rm(x.amount) : '฿' + num(x.amount, x.amount % 1 ? 2 : 0));
function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  return iso === today() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------- panel ---------- */
const billRowHTML = x => `
  <div class="xrow"><button type="button" class="xitem" data-xbills aria-label="${esc(x.what || XCATS[x.cat].label)}, from Shared bills">
    <span class="xdot" style="background:var(--c-${XCATS[x.cat].c})"></span>
    <span class="xw"><b>${esc(x.what || XCATS[x.cat].label)}</b><small>shared bill · ${x.bill.paidByMe ? 'you paid' : `${esc(x.bill.other)} paid`}</small></span>
    <span class="xamt">${money(x)}<small>${x.bill.whole ? 'all yours' : `your part of ${money({ amount: x.bill.full, cur: x.cur })}`}</small></span>
  </button><span class="xdel xnodel" aria-hidden="true"></span></div>`;
const rowHTML = (x, view) => x.bill ? billRowHTML(x) : `
  <div class="xrow${view.edit === x.id ? ' sel' : ''}"><button type="button" class="xitem" data-xedit="${esc(x.id)}" aria-label="Edit ${esc(x.what || XCATS[x.cat].label)}">
    <span class="xdot" style="background:var(--c-${XCATS[x.cat].c})"></span>
    <span class="xw"><b>${esc(x.what || XCATS[x.cat].label)}</b><small>${[x.what ? XCATS[x.cat].label : '', x.shared ? 'split in two' : ''].filter(Boolean).join(' · ')}</small></span>
    <span class="xamt">${x.shared ? rm(mine(x)) : money(x)}${x.shared ? `<small>half of ${money(x)}</small>` : x.cur === 'THB' ? `<small>${rm(toMYR(x))}</small>` : ''}</span>
  </button><button type="button" class="xdel" data-xdel="${esc(x.id)}" aria-label="Delete ${esc(x.what || XCATS[x.cat].label)}">×</button></div>`;

export function render(head, body, view) {
  const editing = view.edit ? items.find(x => x.id === view.edit) : null;
  const fromBills = billRows(), oldSplit = items.filter(x => x.shared && !x.plan);
  const spentItems = [...items.filter(x => !x.plan), ...fromBills], planItems = items.filter(x => x.plan);
  const spent = sum(spentItems);
  const hasTHB = items.some(x => x.cur === 'THB') || fromBills.some(x => x.cur === 'THB');
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>
    <h2 style="margin-top:6px">My spending <small>${getCode() ? 'private · on your devices' : 'private to this device'}</small></h2>`;

  // Per category: what's spent and what was planned. A plan is "used up" as real spending comes in,
  // so the projection for a category is whichever is larger.
  const cats = Object.keys(XCATS).map(k => ({ k, spent: sum(spentItems.filter(x => x.cat === k)), plan: sum(planItems.filter(x => x.cat === k)) }))
    .filter(c => c.spent > 0 || c.plan > 0).sort((a, b) => Math.max(b.spent, b.plan) - Math.max(a.spent, a.plan));
  const projected = cats.reduce((t, c) => t + Math.max(c.spent, c.plan), 0);
  const top = Math.max(1, ...cats.map(c => Math.max(c.spent, c.plan)));
  const dates = [...new Set(spentItems.map(x => x.date))].sort().reverse();
  const f = editing || { amount: '', cur: lastCur, what: '', cat: 'food', date: today(), shared: false, plan: false };
  const left = budget - spent, over = budget && projected > budget;
  const pct = v => Math.min(100, Math.max(0, v / (budget || 1) * 100)).toFixed(1);

  body.innerHTML = `<div class="form spend">
    <div class="xtotal${budget && left < 0 ? ' over' : ''}"><span>Spent so far${budget ? ` <em>of ${rm(budget)}</em>` : ''}</span><b>${rm(spent)}</b>
      ${budget ? `<i class="xbar" role="img" aria-label="${pct(spent)}% of budget spent"><u style="width:${pct(projected)}%"></u><b style="width:${pct(spent)}%"></b></i>
        <small><strong>${left >= 0 ? `${rm(left)} left` : `${rm(-left)} over budget`}</strong>${planItems.length ? ` · with what's planned: ${rm(projected)} (${over ? `${rm(projected - budget)} over` : `${rm(budget - projected)} spare`})` : ''}</small>` : ''}
      <small>${spentItems.length ? `${spentItems.length} ${spentItems.length === 1 ? 'entry' : 'entries'}${fromBills.length ? `, ${rm(sum(fromBills))} from shared bills` : ''}` : 'Nothing spent yet'}${!budget && planItems.length ? ` · planned total ${rm(projected)}` : ''}${hasTHB ? ` · baht at ${num(rate, 2)} per RM` : ''}</small></div>
    ${cats.length > 1 || planItems.length ? `<div class="xcats">${cats.map(c => `<div class="xcat"><span>${XCATS[c.k].label}</span><i>${c.plan ? `<u style="width:${(c.plan / top * 100).toFixed(1)}%"></u>` : ''}<b style="width:${c.spent ? Math.max(3, c.spent / top * 100).toFixed(1) : 0}%;background:var(--c-${XCATS[c.k].c})"></b></i><em>${rm(c.spent)}${c.plan ? `<small> / ${num(c.plan, 0)} planned</small>` : ''}</em></div>`).join('')}</div>` : ''}

    ${oldSplit.length ? `<div class="tnote"><b>${oldSplit.length} ${oldSplit.length === 1 ? 'entry is' : 'entries are'} marked “split in two”</b>
      <p>Bills you split now live in Shared bills, which works out who owes who. Move ${oldSplit.length === 1 ? 'it' : 'them'} there as paid by you, split evenly. Your half still counts here.</p>
      <div class="row"><button type="button" class="btn" data-xmove>Move to Shared bills</button></div></div>` : ''}
    <form class="xadd" data-xform novalidate>
      <span class="l">${editing ? 'Edit entry' : 'Add spending'}</span>
      <div class="xline">
        <input class="xin" id="x-amount" type="text" inputmode="decimal" placeholder="Amount" value="${esc(f.amount)}" aria-label="Amount" autocomplete="off">
        <select class="xin" id="x-cur" aria-label="Currency"><option value="THB"${f.cur === 'THB' ? ' selected' : ''}>฿ Baht</option><option value="MYR"${f.cur === 'MYR' ? ' selected' : ''}>RM Ringgit</option></select>
      </div>
      <input class="xin" id="x-what" type="text" placeholder="What was it? e.g. khao soi" value="${esc(f.what)}" maxlength="80" aria-label="What was it">
      <div class="xline">
        <select class="xin" id="x-cat" aria-label="Category">${Object.keys(XCATS).map(k => `<option value="${k}"${f.cat === k ? ' selected' : ''}>${XCATS[k].label}</option>`).join('')}</select>
        <input class="xin" id="x-date" type="date" value="${esc(f.date)}" aria-label="Date">
      </div>
      <label class="xchk"><input type="checkbox" id="x-plan"${f.plan ? ' checked' : ''}><span>Planned, not spent yet <small>an estimate for the budget</small></span></label>
      <label class="xchk xsplit"><input type="checkbox" id="x-shared"${f.shared && f.plan ? ' checked' : ''}><span>We’ll split this <small>type the full estimate, half counts as yours</small></span></label>
      <div class="row"><button type="submit" class="btn primary">${editing ? 'Save changes' : 'Add'}</button>${editing ? '<button type="button" class="btn ghost" data-xcancel>Cancel</button>' : ''}</div>
      ${editing ? '' : '<p class="fine">Paid for something you’re splitting? <button type="button" class="linkbtn sm" data-xbills>Add it in Shared bills</button> and your part shows up here.</p>'}
    </form>

    ${dates.map(d => {
      const rows = spentItems.filter(x => x.date === d).sort((a, b) => b.createdAt - a.createdAt);
      return `<div class="group"><h3>${dayLabel(d)} <span>${rm(sum(rows))}</span></h3>${rows.map(x => rowHTML(x, view)).join('')}</div>`;
    }).join('')}
    ${planItems.length ? `<div class="group xplan"><h3>Planned <span>${rm(sum(planItems))}</span></h3>
      <p class="fine">Estimates. Each one is replaced by real spending in the same category as you log it.</p>
      ${[...planItems].sort((a, b) => mine(b) - mine(a)).map(x => rowHTML(x, view)).join('')}</div>` : ''}

    <div class="xset">
      <label class="xrate"><span>Trip budget RM</span><input class="xin" id="x-budget" type="text" inputmode="decimal" value="${budget ? num(budget, 0) : ''}" placeholder="none" aria-label="Trip budget in ringgit"></label>
      <label class="xrate"><span>฿ per RM 1</span><input class="xin" id="x-rate" type="text" inputmode="decimal" value="${num(rate, 2)}" aria-label="Baht per ringgit"></label>
      ${items.length || fromBills.length ? '<button type="button" class="btn ghost" data-xcsv>Save as spreadsheet (CSV)</button>' : ''}
    </div>
    ${syncHTML()}
    <p class="fine">Your spending is never shared with the trip code, the pins Export file or view-only maps.${getCode() ? '' : ' Right now it is only on this device, so save a CSV now and then as a backup.'}</p>
  </div>`;
}

const parseNum = s => +String(s).replace(/[,\s]/g, '').replace(/^(rm|฿)/i, '');

// Returns true when it handled the form submit.
export function onSubmit(form, ctx) {
  const $ = id => form.querySelector(id) || document.querySelector(id);
  const amount = parseNum($('#x-amount').value);
  if (!isFinite(amount) || amount <= 0) { ctx.toast('Type an amount first'); $('#x-amount').focus(); return true; }
  const prev = ctx.view.edit ? items.find(x => x.id === ctx.view.edit) : null;
  const x = clean({ id: prev?.id, createdAt: prev?.createdAt, amount, cur: $('#x-cur').value, what: $('#x-what').value, cat: $('#x-cat').value, date: $('#x-date').value, shared: $('#x-plan').checked ? $('#x-shared').checked : !!(prev && prev.shared && !prev.plan), plan: $('#x-plan').checked, updatedAt: Date.now() });
  if (!x) return true;
  items = prev ? items.map(y => (y.id === prev.id ? x : y)) : [...items, x];
  lastCur = x.cur;
  ctx.view.edit = null;
  ctx.toast(persist() ? (prev ? 'Saved' : x.plan ? `Planned ${money(x)}` : `Added ${money(x)}`) : 'Couldn’t save in this browser');
  ctx.rerender();
  return true;
}

// Returns true when the click was for the spending panel.
export function onClick(t, ctx) {
  if (t.closest('[data-xbills]')) { ctx.openBills(); return true; }
  if (t.closest('[data-xmove]')) {
    const old = items.filter(x => x.shared && !x.plan);
    if (!old.length || !ctx.moveSplit(old)) return true;   // moveSplit explains itself when it can't
    const tb = read(TOMB_KEY, {}); for (const x of old) tb[x.id] = Date.now(); write(TOMB_KEY, tb);
    items = items.filter(x => !old.includes(x)); persist(); ctx.rerender();
    ctx.toast(`Moved ${old.length} to Shared bills`);
    return true;
  }
  const ed = t.closest('[data-xedit]');
  if (ed) { ctx.view.edit = ed.dataset.xedit; ctx.rerender(); document.querySelector('#pbody').scrollTop = 0; document.querySelector('#x-amount')?.focus(); return true; }
  if (t.closest('[data-xcancel]')) { ctx.view.edit = null; ctx.rerender(); return true; }
  const del = t.closest('[data-xdel]');
  if (del) {
    const x = items.find(y => y.id === del.dataset.xdel); if (!x) return true;
    items = items.filter(y => y !== x); const tb = read(TOMB_KEY, {}); tb[x.id] = Date.now(); write(TOMB_KEY, tb); persist();
    if (ctx.view.edit === x.id) ctx.view.edit = null;
    ctx.rerender();
    ctx.toastAction(`Deleted ${money(x)}`, 'Undo', () => { const t2 = read(TOMB_KEY, {}); delete t2[x.id]; write(TOMB_KEY, t2); items = [...items, { ...x, updatedAt: Date.now() }]; persist(); ctx.rerender(); });
    return true;
  }
  if (t.closest('[data-xnewcode]')) { setCode(newCode()); ctx.rerender(); ctx.toast('Spending sync is on. Now link your other device.'); return true; }
  if (t.closest('[data-xjoin]')) {
    const inp = document.querySelector('#x-code');
    const pre = prefillFrom(inp.value);
    if (pre) {
      const n = addPrefill(pre);
      if (!n) { ctx.toast('That pre-fill code didn’t work, or it’s already added.'); return true; }
      schedule(); ctx.rerender(); ctx.toast('Added to your private spending'); return true;
    }
    if (!setCode(codeFrom(inp.value))) { ctx.toast('That code looks too short. It has 24 letters and numbers.'); inp.focus(); return true; }
    ctx.rerender(); ctx.toast('Linked. Fetching your spending…'); return true;
  }
  const cp = t.closest('[data-xcopy]');
  if (cp) { cp.dataset.xcopy === 'link' ? ctx.copyText(joinLink(), 'Private link') : ctx.copyText(fmtCode(getCode()), 'Spending code'); return true; }
  if (t.closest('[data-xsyncnow]')) { syncNow(); return true; }
  if (t.closest('[data-xunlink]')) {
    t.closest('.row').innerHTML = `<span style="font-weight:700;align-self:center">Stop syncing spending on this device? Entries stay here.</span><button type="button" class="btn danger" data-xunlinkyes>Stop syncing</button><button type="button" class="btn ghost" data-xcancel>Keep</button>`;
    return true;
  }
  if (t.closest('[data-xunlinkyes]')) { clearCode(); ctx.rerender(); ctx.toast('Spending sync stopped on this device'); return true; }
  if (t.closest('[data-xcsv]')) { downloadCSV(); ctx.toast('Spending saved as a CSV file'); return true; }
  return false;
}

export function onChange(t, ctx) {
  if (t.id === 'x-budget') {
    const b = t.value.trim() ? parseNum(t.value) : 0;
    if (isFinite(b) && b >= 0 && b < 1e7) { budget = Math.round(b); rateAt = Date.now(); persist(); ctx.toast(budget ? `Trip budget set to ${rm(budget)}` : 'Trip budget removed'); }
    else ctx.toast('That budget doesn’t look right');
    keepForm(ctx.rerender);
    return true;
  }
  if (t.id !== 'x-rate') return false;
  const r = parseNum(t.value);
  if (isFinite(r) && r > 0.01 && r < 1000) { rate = Math.round(r * 1000) / 1000; rateAt = Date.now(); persist(); ctx.toast(`Baht now converts at ${num(rate, 2)} per RM`); }
  else ctx.toast('That rate doesn’t look right');
  keepForm(ctx.rerender);
  return true;
}

function downloadCSV() {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [...items, ...billRows()].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map(x => [x.date, q(x.what), q(XCATS[x.cat].label), x.plan ? 'Planned' : x.bill ? 'Shared bill (my part)' : 'Spent', x.amount.toFixed(2), x.cur, x.shared ? 'yes' : 'no', mine(x).toFixed(2)].join(','));
  const csv = ['Date,What,Category,Type,Amount,Currency,Split in two,My share in MYR', ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `chiang-mai-spending-${today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- private sync between one person's own devices ---------- */
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = c => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
const codeFrom = raw => { const m = String(raw).match(/#spend=([A-Za-z0-9-]+)/); return m ? m[1] : raw; };
const canSync = () => isConfigured() && !!globalThis.crypto?.subtle;
export function getCode() { const c = read(CODE_KEY, ''); return typeof c === 'string' ? c : ''; }
function newCode() { return [...crypto.getRandomValues(new Uint8Array(24))].map(b => ALPHABET[b % ALPHABET.length]).join(''); }
const joinLink = () => `${location.origin}${location.pathname}#spend=${fmtCode(getCode())}`;

let hooks = null, timer = null, poll = null, running = false, again = false;
let status = { state: 'off', at: 0, msg: '' };
function setStatus(state, msg = '') {
  status = { state, at: state === 'ok' ? Date.now() : status.at, msg };
  const el = document.querySelector('#x-syncst'); if (el) el.innerHTML = statusHTML();
}
function statusHTML() {
  const t = status.state === 'ok' ? 'Up to date on your devices' : status.state === 'syncing' ? 'Syncing…' : status.state === 'error' ? esc(status.msg) : 'Waiting to sync';
  return `<b class="xst ${status.state}"></b>${t}`;
}
function setCode(c) {
  const n = normCode(c);
  if (n.length < 20 || !canSync()) return false;
  write(CODE_KEY, n); write(KNOWN_KEY, {});
  syncNow(); startPolling();
  return true;
}
function clearCode() {
  try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(KNOWN_KEY); } catch {}
  clearInterval(poll); poll = null; status = { state: 'off', at: 0, msg: '' };
}
function schedule(ms = 800) { if (!canSync() || !getCode() || !hooks) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); }
function startPolling() { clearInterval(poll); poll = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000); }

// Both the storage namespace and the encryption key come from the code, so the server gets neither the code nor readable data.
const te = new TextEncoder(), td = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyCache = null;
async function keysFor(code) {
  if (keyCache?.code === code) return keyCache;
  const raw = await crypto.subtle.importKey('raw', te.encode(code), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = te.encode('cm-trip-map-spend-v1');
  const nsBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('namespace') }, raw, 128);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('aes-gcm') }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ns = 'S' + [...new Uint8Array(nsBits)].map(b => b.toString(16).padStart(2, '0')).join('');
  return (keyCache = { code, ns, key });
}
async function seal(key, id, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(id) }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
async function unseal(key, id, d) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv), additionalData: te.encode(id) }, key, unb64(d.ct));
    return JSON.parse(td.decode(pt));
  } catch { return null; }   // not ours or damaged: ignore the row
}

export async function syncNow() {
  const code = getCode();
  if (!canSync() || !code) return;
  if (running) { again = true; return; }
  running = true; setStatus('syncing');
  try {
    const { ns, key } = await keysFor(code);
    const rows = await rpc('trip_get', { p_trip: ns });
    const local = new Map(items.map(x => [x.id, x]));
    if (rateAt) local.set(RATE_ID, { id: RATE_ID, rate, budget, updatedAt: rateAt });
    const tombs = read(TOMB_KEY, {}), known = read(KNOWN_KEY, {});
    let changed = false;
    for (const r of Array.isArray(rows) ? rows : []) {
      const lp = local.get(r.id);
      const lu = Math.max(lp ? lp.updatedAt || 1 : 0, tombs[r.id] || 0);
      if (r.updated_at > lu || (r.updated_at === lu && !(r.id in known))) {
        if (r.deleted) { if (local.delete(r.id)) changed = true; tombs[r.id] = r.updated_at; }
        else if (r.data?.ct) {
          const obj = await unseal(key, r.id, r.data);
          if (obj) { local.set(r.id, { ...obj, id: r.id, updatedAt: r.updated_at }); delete tombs[r.id]; changed = true; }
        }
      }
      known[r.id] = r.updated_at;
    }
    const out = [];
    for (const x of local.values()) {
      const u = x.updatedAt || 1;
      if (u > (known[x.id] || 0)) out.push({ id: x.id, data: await seal(key, x.id, x), deleted: false, updated_at: u });
    }
    for (const [id, ts] of Object.entries(tombs)) {
      if (!local.has(id) && ts > (known[id] || 0)) out.push({ id, data: null, deleted: true, updated_at: ts });
    }
    for (let i = 0; i < out.length; i += 400) {
      const chunk = out.slice(i, i + 400);
      await rpc('trip_put', { p_trip: ns, p_rows: chunk });
      for (const r of chunk) known[r.id] = r.updated_at;
    }
    for (const id of Object.keys(tombs)) if (known[id] >= tombs[id]) delete tombs[id];
    write(TOMB_KEY, tombs); write(KNOWN_KEY, known);
    if (getCode() !== code) return;   // unlinked while this was running
    if (changed) {
      const rr = local.get(RATE_ID);
      if (rr && +rr.rate > 0) { rate = +rr.rate; rateAt = rr.updatedAt; budget = +rr.budget > 0 ? +rr.budget : 0; }
      local.delete(RATE_ID);
      items = [...local.values()].map(clean).filter(Boolean);
      store(); hooks?.onChange?.();
    }
    setStatus('ok');
  } catch (e) {
    const offline = e.name === 'AbortError' || e instanceof TypeError || !navigator.onLine;
    setStatus('error', offline ? 'Offline. Saved on this device; it will sync when you’re back online.'
      : e.status === 404 ? 'Sync server is missing its setup.' : `Sync failed: ${e.message}`);
  } finally {
    running = false;
    if (again) { again = false; schedule(300); }
  }
}

// h.onChange: another device changed the log. h.onJoined: this device was just linked by a #spend= link.
export function startSync(h) {
  hooks = h;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  if (addFromLink()) { h.onPrefill?.(); schedule(1500); }
  const m = location.hash.match(/^#spend=([A-Za-z0-9-]+)$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);   // keep the secret out of the address bar
    if (normCode(m[1]) !== getCode() && setCode(m[1])) { h.onJoined?.(); return; }
  }
  if (canSync() && getCode()) { syncNow(); startPolling(); }
}

// Re-render without losing what is being typed in the add form.
export function keepForm(rerender) {
  const ids = ['x-amount', 'x-cur', 'x-what', 'x-cat', 'x-date', 'x-code'], boxes = ['x-shared', 'x-plan'];
  const vals = ids.map(id => document.getElementById(id)?.value), on = boxes.map(id => document.getElementById(id)?.checked), focus = document.activeElement?.id;
  rerender();
  ids.forEach((id, i) => { const el = document.getElementById(id); if (el && vals[i] != null) el.value = vals[i]; });
  boxes.forEach((id, i) => { const el = document.getElementById(id); if (el && on[i] != null) el.checked = on[i]; });
  if (ids.includes(focus)) document.getElementById(focus)?.focus();
}

// A private "pre-fill" link:  …/#addspend=<base64url JSON {budget?, items:[…]}>.
// Lets entries be handed to a device without ever putting amounts in this public code.
// Entries carry fixed ids, so opening the same link twice does not duplicate them.
function addFromLink() {
  const m = location.hash.match(/^#addspend=([A-Za-z0-9_-]+)$/);
  if (!m) return 0;
  history.replaceState(null, '', location.pathname + location.search);
  return addPrefill(m[1]);
}
// The same pre-fill, pasted as a bare code (handy in the iPhone home-screen app, which links can't open).
const prefillFrom = raw => (String(raw).match(/(?:#addspend=)?(eyJ[A-Za-z0-9_-]{20,})/) || [])[1] || '';
function addPrefill(code) {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    const have = new Set(items.map(x => x.id)), tombs = read(TOMB_KEY, {});
    const fresh = (Array.isArray(data.items) ? data.items : []).slice(0, 50)
      .map(x => clean({ ...x, createdAt: Date.now(), updatedAt: Date.now() })).filter(x => x && !have.has(x.id) && !(x.id in tombs));
    const setBudget = +data.budget > 0 && !budget;
    if (setBudget) { budget = Math.round(+data.budget); rateAt = Date.now(); }
    items = [...items, ...fresh];
    store();
    return fresh.length + (setBudget ? 1 : 0);
  } catch { return 0; }
}

function syncHTML() {
  if (!canSync()) return '';
  if (!getCode()) return `<div class="xsync">
    <span class="l">On my other devices</span>
    <p class="fine">See this log on your phone and laptop. It uses its own secret code, separate from the trip code, and entries are encrypted before they leave this device.</p>
    <div class="row"><button type="button" class="btn" data-xnewcode>Turn on private sync</button></div>
    <div class="xline xjoin"><input class="xin" id="x-code" type="text" placeholder="Or paste a spending code, link or pre-fill code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Spending code, link or pre-fill code"><button type="button" class="btn ghost" data-xjoin>Link</button></div>
  </div>`;
  return `<div class="xsync">
    <span class="l">On my other devices</span>
    <p class="xstline" id="x-syncst">${statusHTML()}</p>
    <p class="fine">To add your phone or laptop, open the private link there, or paste the code into its Spend panel. Keep both to yourself: anyone who has them can read this log. This is not your trip code.</p>
    <div class="row"><button type="button" class="btn" data-xcopy="link">Copy private link</button><button type="button" class="btn ghost" data-xcopy="code">Copy code</button><button type="button" class="btn ghost" data-xsyncnow>Sync now</button></div>
    <div class="row"><button type="button" class="btn ghost" data-xunlink>Stop syncing on this device</button></div>
  </div>`;
}
