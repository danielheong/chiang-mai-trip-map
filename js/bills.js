// Shared bills for the two people on the trip (a small "who owes who" ledger).
// One place to key in a bill: who paid and how it is split. From that it works out the
// balance between the two, and each person's own share, which the private Spending log
// (js/expenses.js) picks up through myShares().
//
// Each device remembers which of the two people uses it (the "profile").
// Sync: every bill is encrypted in the browser with a key derived from the trip code and
// stored under a separate, derived namespace. So devices with the trip code share the bills,
// the server can't read them, and view-only links never include them.
import { rpc, isConfigured, getCode } from './sync.js?v=202611120023';

const KEY = 'cm-trip-map-bills';
const SET_KEY = 'cm-trip-map-bills-set';       // { names: [a, b], rate, updatedAt }
const ME_KEY = 'cm-trip-map-bills-me';         // { i: 0|1, name } who uses this device
const TOMB_KEY = 'cm-trip-map-bills-deleted';  // { id: deletedAtMs }
const KNOWN_KEY = 'cm-trip-map-bills-known';   // { ns, map: { id: updatedAtMs the server has } }
const SET_ID = '__set';
const DEFAULT_RATE = 7.8;                      // Thai baht per 1 Malaysian ringgit, editable
const SPLITS = ['even', 'p0', 'p1', 'exact'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const r2 = n => Math.round(n * 100) / 100;
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseNum = s => +String(s).replace(/[,\s]/g, '').replace(/^(rm|฿)/i, '');
const num = (n, dp) => n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const baht = n => '฿' + num(n, Math.abs(n % 1) > 0.004 ? 2 : 0);
const rm = n => 'RM ' + num(n, 2);
const money = (v, cur) => (cur === 'MYR' ? rm(v) : baht(v));
const name = v => (typeof v === 'string' ? v.trim().slice(0, 24) : '');

let items = [];
let set = { names: ['', ''], rate: DEFAULT_RATE, updatedAt: 0 };
let me = null;          // 0 | 1 | null (not chosen on this device yet)
let lastCur = 'THB';

function clean(x) {
  const amount = r2(+x?.amount);
  if (!x || !isFinite(amount) || amount <= 0) return null;
  let split = SPLITS.includes(x.split) ? x.split : 'even';
  let share0 = split === 'even' ? amount / 2 : split === 'p0' ? amount : split === 'p1' ? 0 : r2(+x.share0);
  if (!isFinite(share0) || share0 < 0 || share0 > amount) { split = 'even'; share0 = amount / 2; }
  return {
    id: typeof x.id === 'string' && x.id ? x.id : newId(),
    kind: x.kind === 'settle' ? 'settle' : 'bill',   // settle = one person paying the other back
    amount, cur: x.cur === 'MYR' ? 'MYR' : 'THB',
    what: typeof x.what === 'string' ? x.what.trim().slice(0, 80) : '',
    cat: typeof x.cat === 'string' ? x.cat.slice(0, 20) : 'misc',
    date: DATE_RE.test(x.date) ? x.date : today(),
    payer: +x.payer === 1 ? 1 : 0,
    split, share0: r2(share0),                       // person 0's part, in the bill's currency
    createdAt: +x.createdAt || Date.now(),
    updatedAt: +x.updatedAt || +x.createdAt || Date.now(),
  };
}
function cleanSet(s) {
  const n = Array.isArray(s?.names) ? s.names : [];
  return { names: [name(n[0]), name(n[1])], rate: +s?.rate > 0.01 && +s?.rate < 1000 ? +s.rate : DEFAULT_RATE, updatedAt: +s?.updatedAt || 0 };
}
export function load() {
  const raw = read(KEY, []);
  items = (Array.isArray(raw) ? raw : []).map(clean).filter(Boolean);
  set = cleanSet(read(SET_KEY, null));
  const m = read(ME_KEY, null);
  me = m && (m.i === 0 || m.i === 1) ? m.i : null;
  const c = read(KEY + '-cur', ''); if (c === 'MYR' || c === 'THB') lastCur = c;
  fixMe();
}
function store() { write(KEY + '-cur', lastCur); write(SET_KEY, set); return write(KEY, items); }
function persist() { const ok = store(); schedule(); return ok; }
function setMe(i) { me = i; if (i == null) { try { localStorage.removeItem(ME_KEY); } catch {} } else write(ME_KEY, { i, name: set.names[i] }); }
// If the two names arrived from the other device in a different order, follow the name.
function fixMe() {
  if (me == null || !hasNames()) return;
  const saved = (read(ME_KEY, null)?.name || '').toLowerCase();
  if (!saved || saved === set.names[me].toLowerCase()) return;
  const other = 1 - me;
  if (saved === set.names[other].toLowerCase()) setMe(other); else setMe(me);   // else: the name was edited
}

const hasNames = () => !!(set.names[0] && set.names[1]);
const shareOf = (b, i) => (i === 0 ? b.share0 : r2(b.amount - b.share0));
const thb = (v, cur) => (cur === 'MYR' ? v * set.rate : v);
// Positive: person 1 owes person 0. Negative: the other way round.
function balance() {
  let bal = 0;
  for (const b of items) {
    const a = thb(b.amount, b.cur);
    if (b.kind === 'settle') bal += b.payer === 0 ? a : -a;
    else bal += b.payer === 0 ? thb(shareOf(b, 1), b.cur) : -thb(shareOf(b, 0), b.cur);
  }
  return bal;
}
export const count = () => items.filter(b => b.kind === 'bill').length;
export const profile = () => (me != null && hasNames() ? { i: me, name: set.names[me], other: set.names[1 - me] } : null);
// This device's person's part of each shared bill, for the private Spending log.
export function myShares() {
  if (me == null) return [];
  return items.filter(b => b.kind === 'bill' && shareOf(b, me) > 0).map(b => ({
    id: b.id, amount: shareOf(b, me), cur: b.cur, what: b.what, cat: b.cat, date: b.date, createdAt: b.createdAt,
    full: b.amount, whole: shareOf(b, me) >= b.amount, paidByMe: b.payer === me, other: set.names[1 - me] || 'the other person',
  }));
}
// Bills handed over from the private log's old "split in two" entries: paid by this device's person, split evenly.
export function addMine(list) {
  if (me == null) return 0;
  const fresh = list.map(x => clean({ amount: x.amount, cur: x.cur, what: x.what, cat: x.cat, date: x.date, payer: me, split: 'even', createdAt: x.createdAt, updatedAt: Date.now() })).filter(Boolean);
  items = [...items, ...fresh];
  persist();
  return fresh.length;
}

/* ---------- panel ---------- */
const who = i => `${esc(set.names[i])}${i === me ? ' <small>(you)</small>' : ''}`;
function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  return iso === today() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function splitText(b) {
  if (b.split === 'even') return 'split evenly';
  if (b.split === 'exact') return `${esc(set.names[0])} ${money(shareOf(b, 0), b.cur)} · ${esc(set.names[1])} ${money(shareOf(b, 1), b.cur)}`;
  return `all ${esc(set.names[b.split === 'p0' ? 0 : 1])}’s`;
}
function syncNote() {
  if (!isConfigured() || !getCode()) return 'Only on this device for now. Link your trip code under Sync devices so you both see the same bills.';
  if (!globalThis.crypto?.subtle) return 'Only on this device (this browser can’t encrypt bills for syncing).';
  const st = status.state === 'error' ? esc(status.msg) : status.state === 'syncing' ? 'Syncing…' : 'Up to date.';
  return `<span id="b-syncst">${st}</span> Encrypted and shared with devices on your trip code. Never on view-only links.`;
}

function setupHTML(view) {
  const first = !hasNames();
  return `<form class="form spend bills" data-bsetup novalidate autocomplete="off">
    <div class="tnote"><b>${first ? 'Who is splitting the bills?' : 'Change the names'}</b>
      <p>${first ? 'Just the two of you. Type both names once; every device on your trip code then knows them.' : 'Bills stay with the same person, only the name shown changes.'}</p></div>
    <div><label class="l" for="b-n0">${first ? 'Your name' : 'First person'}</label><input class="xin" id="b-n0" type="text" maxlength="24" value="${esc(set.names[0])}" autocapitalize="words"></div>
    <div><label class="l" for="b-n1">${first ? 'The other person' : 'Second person'}</label><input class="xin" id="b-n1" type="text" maxlength="24" value="${esc(set.names[1])}" autocapitalize="words"></div>
    <div class="row"><button type="submit" class="btn primary">Save</button>${first ? '' : '<button type="button" class="btn ghost" data-bcancel>Cancel</button>'}</div>
    ${first ? `<p class="fine">${syncNote()}</p>` : ''}
  </form>`;
}
function pickHTML() {
  const switching = me != null;
  return `<div class="form spend bills">
    <div class="tnote"><b>Who’s using this device?</b>
      <p>${switching
        ? 'Only change this if it was set wrong. Your private Spending on this device counts the shares of whoever is picked, so each of you should use your own devices.'
        : 'Pick once. This device then knows whose share to count in your private Spending, and who “you” is.'}</p></div>
    <div class="bpick">${[0, 1].map(i => `<button type="button" class="btn${i === me ? ' primary' : ''}" data-bme="${i}">I’m ${esc(set.names[i])}</button>`).join('')}</div>
    ${switching ? '<div class="row"><button type="button" class="btn ghost" data-bcancel>Cancel</button></div>' : ''}
  </div>`;
}

function rowHTML(b, view, cats) {
  const cat = cats[b.cat] || cats.misc;
  if (b.kind === 'settle') {
    return `<div class="xrow"><div class="xitem bsettle"><span class="xdot"></span>
      <span class="xw"><b>${esc(set.names[b.payer])} paid ${esc(set.names[1 - b.payer])} back</b><small>settled up</small></span>
      <span class="xamt">${money(b.amount, b.cur)}</span></div>
      <button type="button" class="xdel" data-bdel="${esc(b.id)}" aria-label="Delete this payback">×</button></div>`;
  }
  const label = b.what || cat.label, mineAmt = shareOf(b, me);
  return `<div class="xrow${view.edit === b.id ? ' sel' : ''}"><button type="button" class="xitem" data-bedit="${esc(b.id)}" aria-label="Edit ${esc(label)}">
    <span class="xdot" style="background:var(--c-${cat.c})"></span>
    <span class="xw"><b>${esc(label)}</b><small>${b.payer === me ? 'You' : esc(set.names[b.payer])} paid · ${splitText(b)}</small></span>
    <span class="xamt">${money(b.amount, b.cur)}<small>your share ${money(mineAmt, b.cur)}</small></span>
  </button><button type="button" class="xdel" data-bdel="${esc(b.id)}" aria-label="Delete ${esc(label)}">×</button></div>`;
}

export function render(head, body, view, ctx) {
  const cats = ctx.cats;
  head.innerHTML = `<button type="button" class="back" data-back>‹ My places</button>
    <div class="ptitle" style="margin-top:6px"><h2>Shared bills</h2>${me != null && hasNames() ? `<button type="button" class="bwho" data-bwho aria-label="You are ${esc(set.names[me])}. Change who uses this device">You: ${esc(set.names[me])}</button>` : ''}</div>`;
  if (!hasNames() || view.names) { body.innerHTML = setupHTML(view); return; }
  if (me == null || view.pick) { body.innerHTML = pickHTML(); return; }

  const other = 1 - me, bal = balance(), mineBal = me === 0 ? bal : -bal, square = Math.abs(mineBal) < 0.5;
  const bills = items.filter(b => b.kind === 'bill');
  const paid = i => bills.filter(b => b.payer === i).reduce((t, b) => t + thb(b.amount, b.cur), 0);
  const shareSum = i => bills.reduce((t, b) => t + thb(shareOf(b, i), b.cur), 0);
  const editing = view.edit ? bills.find(b => b.id === view.edit) : null;
  const f = editing || { amount: '', cur: lastCur, what: '', cat: 'food', date: today(), payer: me, split: 'even', share0: '' };
  const dates = [...new Set(items.map(b => b.date))].sort().reverse();

  body.innerHTML = `<div class="form spend bills">
    <div class="xtotal${square ? '' : mineBal < 0 ? ' owe' : ''}">
      <span>${square ? 'All square' : mineBal > 0 ? `${esc(set.names[other])} owes you` : `You owe ${esc(set.names[other])}`}</span>
      <b><i>฿</i>${square ? '0' : num(Math.round(Math.abs(mineBal)), 0)}</b>
      ${square ? '' : `<small>about ${rm(Math.abs(mineBal) / set.rate)}</small>`}
      ${bills.length ? `<small>You paid ${baht(Math.round(paid(me)))} · ${esc(set.names[other])} paid ${baht(Math.round(paid(other)))}</small>` : '<small>No bills yet. Add the first one below.</small>'}
      ${square ? '' : view.settle
        ? `<div class="row bsettlerow"><span>Record that ${mineBal > 0 ? `${esc(set.names[other])} paid you` : `you paid ${esc(set.names[other])}`} ${baht(r2(Math.abs(mineBal)))}?</span><button type="button" class="btn primary" data-bsettleyes>Yes, settled</button><button type="button" class="btn ghost" data-bcancel>Not yet</button></div>`
        : '<div class="row"><button type="button" class="btn" data-bsettle>Settle up</button></div>'}
    </div>

    <form class="xadd" data-bform novalidate>
      <span class="l">${editing ? 'Edit bill' : 'Add a bill'}</span>
      <div class="xline">
        <input class="xin" id="b-amount" type="text" inputmode="decimal" placeholder="Full amount" value="${esc(f.amount)}" aria-label="Full amount of the bill" autocomplete="off">
        <select class="xin" id="b-cur" aria-label="Currency"><option value="THB"${f.cur === 'THB' ? ' selected' : ''}>฿ Baht</option><option value="MYR"${f.cur === 'MYR' ? ' selected' : ''}>RM Ringgit</option></select>
      </div>
      <input class="xin" id="b-what" type="text" placeholder="What was it? e.g. dinner at Huen Phen" value="${esc(f.what)}" maxlength="80" aria-label="What was it">
      <fieldset class="bseg"><legend class="l">Who paid?</legend>
        ${[me, other].map(i => `<label><input type="radio" name="b-payer" value="${i}"${f.payer === i ? ' checked' : ''}><span>${who(i)}</span></label>`).join('')}
      </fieldset>
      <div><label class="l" for="b-split">How is it split?</label>
        <select class="xin" id="b-split">
          <option value="even"${f.split === 'even' ? ' selected' : ''}>Split evenly</option>
          <option value="p${me}"${f.split === 'p' + me ? ' selected' : ''}>All mine (${esc(set.names[me])})</option>
          <option value="p${other}"${f.split === 'p' + other ? ' selected' : ''}>All ${esc(set.names[other])}’s</option>
          <option value="exact"${f.split === 'exact' ? ' selected' : ''}>Exact amounts</option>
        </select></div>
      <div class="bexact" id="b-exact"${f.split === 'exact' ? '' : ' hidden'}><label class="l" for="b-share">My part (${esc(set.names[me])}) <small class="opt">${esc(set.names[other])} gets the rest</small></label>
        <input class="xin" id="b-share" type="text" inputmode="decimal" placeholder="e.g. 180" value="${f.split === 'exact' ? esc(shareOf(f, me)) : ''}" autocomplete="off"></div>
      <div class="xline">
        <select class="xin" id="b-cat" aria-label="Category">${Object.keys(cats).map(k => `<option value="${k}"${f.cat === k ? ' selected' : ''}>${cats[k].label}</option>`).join('')}</select>
        <input class="xin" id="b-date" type="date" value="${esc(f.date)}" aria-label="Date">
      </div>
      <div class="row"><button type="submit" class="btn primary">${editing ? 'Save changes' : 'Add bill'}</button>${editing ? '<button type="button" class="btn ghost" data-bcancel>Cancel</button>' : ''}</div>
    </form>

    ${dates.map(d => {
      const rows = items.filter(b => b.date === d).sort((a, b) => b.createdAt - a.createdAt);
      const tot = rows.filter(b => b.kind === 'bill').reduce((t, b) => t + thb(b.amount, b.cur), 0);
      return `<div class="group"><h3>${dayLabel(d)} <span>${tot ? baht(Math.round(tot)) : ''}</span></h3>${rows.map(b => rowHTML(b, view, cats)).join('')}</div>`;
    }).join('')}

    ${bills.length ? `<div class="bsum"><span class="eyebrow">Each person’s share so far</span>
      <p><b>${esc(set.names[me])} (you)</b> ${baht(Math.round(shareSum(me)))} <small>about ${rm(shareSum(me) / set.rate)}</small></p>
      <p><b>${esc(set.names[other])}</b> ${baht(Math.round(shareSum(other)))} <small>about ${rm(shareSum(other) / set.rate)}</small></p>
      <p class="fine">Your share is added to your private Spending on this device automatically.</p></div>` : ''}

    <div class="xset">
      <label class="xrate"><span>฿ per RM 1</span><input class="xin" id="b-rate" type="text" inputmode="decimal" value="${num(set.rate, 2)}" aria-label="Baht per ringgit, for the rough conversion"></label>
      <button type="button" class="linkbtn" data-bnames>Change names</button>
    </div>
    <p class="fine">${syncNote()}</p>
  </div>`;
}

/* ---------- events ---------- */
export function onSubmit(form, ctx) {
  const $ = id => form.querySelector(id);
  if (form.matches('[data-bsetup]')) {
    const a = name($('#b-n0').value), b = name($('#b-n1').value);
    if (!a || !b) { ctx.toast('Type both names'); $(a ? '#b-n1' : '#b-n0').focus(); return; }
    if (a.toLowerCase() === b.toLowerCase()) { ctx.toast('The two names need to be different'); $('#b-n1').focus(); return; }
    const first = !hasNames();
    set = { ...set, names: [a, b], updatedAt: Date.now() };
    setMe(first ? 0 : me);
    ctx.view.names = false; persist(); ctx.rerender(); ctx.toast(first ? `Ready. This device is ${a}’s` : 'Names saved');
    return;
  }
  const amount = parseNum($('#b-amount').value);
  if (!isFinite(amount) || amount <= 0) { ctx.toast('Type the full amount first'); $('#b-amount').focus(); return; }
  const split = $('#b-split').value;
  let share0 = 0;
  if (split === 'exact') {
    const mineAmt = parseNum($('#b-share').value);
    if (!$('#b-share').value.trim() || !isFinite(mineAmt) || mineAmt < 0 || mineAmt > amount) { ctx.toast('Your part should be between 0 and the full amount'); $('#b-share').focus(); return; }
    share0 = me === 0 ? mineAmt : amount - mineAmt;
  }
  const prev = ctx.view.edit ? items.find(b => b.id === ctx.view.edit) : null;
  const b = clean({ id: prev?.id, createdAt: prev?.createdAt, amount, cur: $('#b-cur').value, what: $('#b-what').value, cat: $('#b-cat').value, date: $('#b-date').value,
    payer: +(form.querySelector('[name="b-payer"]:checked')?.value ?? me), split, share0, updatedAt: Date.now() });
  if (!b) return;
  items = prev ? items.map(y => (y.id === prev.id ? b : y)) : [...items, b];
  lastCur = b.cur; ctx.view.edit = null; ctx.view.settle = false;
  ctx.toast(persist() ? (prev ? 'Saved' : `Added ${money(b.amount, b.cur)}`) : 'Couldn’t save in this browser');
  ctx.rerender();
}

// Returns true when the click was for this panel.
export function onClick(t, ctx) {
  const v = ctx.view;
  if (t.closest('[data-bwho]')) { v.pick = true; v.names = false; ctx.rerender(); return true; }
  if (t.closest('[data-bnames]')) { v.names = true; ctx.rerender(); return true; }
  const pick = t.closest('[data-bme]');
  if (pick) { setMe(+pick.dataset.bme); v.pick = false; ctx.rerender(); ctx.toast(`This device is ${set.names[me]}’s`); hooks?.onChange?.(); return true; }
  if (t.closest('[data-bcancel]')) { v.edit = null; v.pick = false; v.names = false; v.settle = false; ctx.rerender(); return true; }
  const ed = t.closest('[data-bedit]');
  if (ed) { v.edit = ed.dataset.bedit; v.settle = false; ctx.rerender(); document.querySelector('#pbody').scrollTop = 0; document.querySelector('#b-amount')?.focus(); return true; }
  const del = t.closest('[data-bdel]');
  if (del) {
    const b = items.find(y => y.id === del.dataset.bdel); if (!b) return true;
    items = items.filter(y => y !== b); const tb = read(TOMB_KEY, {}); tb[b.id] = Date.now(); write(TOMB_KEY, tb); persist();
    if (v.edit === b.id) v.edit = null;
    ctx.rerender();
    ctx.toastAction(`Deleted ${money(b.amount, b.cur)}`, 'Undo', () => { const t2 = read(TOMB_KEY, {}); delete t2[b.id]; write(TOMB_KEY, t2); items = [...items, { ...b, updatedAt: Date.now() }]; persist(); ctx.rerender(); });
    return true;
  }
  if (t.closest('[data-bsettle]')) { v.settle = true; ctx.rerender(); return true; }
  if (t.closest('[data-bsettleyes]')) {
    const bal = balance(), amt = r2(Math.abs(bal));
    if (amt >= 0.5) {
      // bal > 0 means person 1 owes person 0, so person 1 is the one paying back.
      items = [...items, clean({ kind: 'settle', amount: amt, cur: 'THB', payer: bal > 0 ? 1 : 0, date: today(), updatedAt: Date.now() })];
      persist(); ctx.toast('Settled up. All square.');
    }
    v.settle = false; ctx.rerender();
    if (amt >= 0.5) { countDown(document.querySelector('.bills .xtotal b'), Math.round(amt)); ctx.celebrate?.(); }
    return true;
  }
  return false;
}

// The balance runs down to zero when you settle up.
function countDown(el, from) {
  const txt = el?.lastChild;
  if (!txt || txt.nodeType !== 3 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 700;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    txt.textContent = num(Math.round(from * (1 - k) ** 2), 0);
    if (k < 1 && txt.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function onChange(t, ctx) {
  if (t.id === 'b-split') { const ex = document.querySelector('#b-exact'); if (ex) { ex.hidden = t.value !== 'exact'; if (!ex.hidden) document.querySelector('#b-share')?.focus(); } return true; }
  if (t.id !== 'b-rate') return false;
  const r = parseNum(t.value);
  if (isFinite(r) && r > 0.01 && r < 1000) { set = { ...set, rate: Math.round(r * 1000) / 1000, updatedAt: Date.now() }; persist(); ctx.toast(`Rough conversion now ${num(set.rate, 2)} baht per RM, for both of you`); }
  else ctx.toast('That rate doesn’t look right');
  keepForm(ctx.rerender);
  return true;
}

// Re-render without losing what is being typed in the add form.
export function keepForm(rerender) {
  const ids = ['b-amount', 'b-cur', 'b-what', 'b-split', 'b-share', 'b-cat', 'b-date', 'b-n0', 'b-n1'];
  const vals = ids.map(id => document.getElementById(id)?.value), payer = document.querySelector('[name="b-payer"]:checked')?.value, focus = document.activeElement?.id;
  rerender();
  ids.forEach((id, i) => { const el = document.getElementById(id); if (el && vals[i] != null) el.value = vals[i]; });
  if (payer != null) { const el = document.querySelector(`[name="b-payer"][value="${payer}"]`); if (el) el.checked = true; }
  const ex = document.getElementById('b-exact'), sp = document.getElementById('b-split'); if (ex && sp) ex.hidden = sp.value !== 'exact';
  if (ids.includes(focus)) document.getElementById(focus)?.focus();
}

/* ---------- encrypted sync between devices that share the trip code ---------- */
let hooks = null, timer = null, poll = null, running = false, again = false;
let status = { state: 'off', msg: '' };
function setStatus(state, msg = '') {
  status = { state, msg };
  const el = document.querySelector('#b-syncst'); if (el) el.textContent = state === 'error' ? msg : state === 'syncing' ? 'Syncing…' : 'Up to date.';
}
const canSync = () => isConfigured() && !!getCode() && !!globalThis.crypto?.subtle;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyCache = null;
async function keysFor(code) {
  if (keyCache?.code === code) return keyCache;
  const raw = await crypto.subtle.importKey('raw', te.encode(code), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = te.encode('cm-trip-map-bills-v1');
  const nsBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('namespace') }, raw, 160);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('aes-gcm') }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ns = 'b' + [...new Uint8Array(nsBits)].map(b => b.toString(16).padStart(2, '0')).join('');
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
  if (!canSync()) return;
  if (running) { again = true; return; }
  running = true; setStatus('syncing');
  const code = getCode();
  try {
    const { ns, key } = await keysFor(code);
    const rows = await rpc('trip_get', { p_trip: ns });
    const local = new Map(items.map(x => [x.id, x]));
    if (set.updatedAt) local.set(SET_ID, { ...set, id: SET_ID });
    const tombs = read(TOMB_KEY, {}), k0 = read(KNOWN_KEY, null);
    const known = k0 && k0.ns === ns && k0.map ? k0.map : {};   // a different trip code starts from scratch
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
    write(TOMB_KEY, tombs); write(KNOWN_KEY, { ns, map: known });
    if (getCode() !== code) return;   // the trip code changed while this was running
    if (changed) {
      const s = local.get(SET_ID);
      if (s) set = cleanSet(s);
      local.delete(SET_ID);
      items = [...local.values()].map(clean).filter(Boolean);
      fixMe(); store(); hooks?.onChange?.();
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
function schedule(ms = 800) { hooks?.onChange?.(true); if (!canSync()) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); }

// h.onChange(local): bills changed (local = by this device, so only other panels need a refresh).
export function startSync(h) {
  hooks = h;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  clearInterval(poll); poll = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000);
  syncNow();
}
