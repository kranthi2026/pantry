import { parse, normalize } from './parser.js';
import { COLORS, DEFAULT_SHOPS } from './defaults.js';
import { load, save } from './storage.js';
import * as speech from './speech.js';

// ---------------------------------------------------------------- state
let data = { shops: [], items: [] };
const ui = {
  picked: 'all',
  searching: false,
  query: '',
  editingId: null,
  formColor: 'blue',
  sheet: null // { phase, transcript, result, handle, error }
};

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shopById = (id) => data.shops.find((s) => s.id === id);
const color = (shop) => COLORS[shop && shop.color] || COLORS.grey;
const initial = (shop) => (shop.id === 'unsorted' ? '?' : shop.name.trim().charAt(0).toUpperCase());

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/></svg>'
};

function badge(shop) {
  const c = color(shop);
  return `<span class="shop-badge" style="background:${c.bg};color:${c.fg}" aria-hidden="true">${esc(initial(shop))}</span>`;
}

async function persist() {
  await save(data);
}

// ---------------------------------------------------------------- toast with undo
let toastTimer = null;
function toast(text, undo) {
  const el = $('toast');
  $('toast-text').textContent = text;
  const btn = $('toast-undo');
  btn.hidden = !undo;
  btn.onclick = () => { hideToast(); if (undo) undo(); };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5000 : 2500);
}
function hideToast() { $('toast').hidden = true; }

function snapshot() { return JSON.parse(JSON.stringify(data)); }
function restore(snap) { return async () => { data = snap; await persist(); render(); }; }

// ---------------------------------------------------------------- items
function query() { return ui.searching ? normalize(ui.query) : ''; }
function matches(text, q) { return !q || normalize(text).includes(q); }

function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

async function addItems(shopId, texts) {
  const now = Date.now();
  const added = texts.map((text) => ({ id: uid(), shopId, text, done: false, at: now }));
  data.items.push(...added);
  await persist();
  return added;
}

// ---------------------------------------------------------------- HOME render
function renderHome() {
  const q = query();
  const open = data.items.filter((i) => !i.done);
  const listsWithItems = new Set(open.map((i) => i.shopId)).size;
  $('summary').textContent = `${open.length} ${open.length === 1 ? 'item' : 'items'} across ${listsWithItems} ${listsWithItems === 1 ? 'list' : 'lists'}`;
  $('cart-count').textContent = open.length;
  $('btn-cart').setAttribute('aria-pressed', String(ui.picked === 'all'));
  $('btn-search').setAttribute('aria-pressed', String(ui.searching));
  $('search-row').hidden = !ui.searching;
  $('add-form').hidden = ui.searching;

  // picked shop may have been deleted
  if (ui.picked !== 'all' && !shopById(ui.picked)) ui.picked = 'all';
  const picked = ui.picked === 'all' ? null : shopById(ui.picked);
  const placeholder = picked ? `Add to ${picked.name}…` : 'Add an item…';
  $('add-input').placeholder = placeholder;
  $('add-label').textContent = placeholder;

  // rail
  const rail = data.shops
    .filter((s) => s.id !== 'unsorted' || data.items.some((i) => i.shopId === 'unsorted') || ui.picked === 'unsorted')
    .map((s) => {
      const count = open.filter((i) => i.shopId === s.id && matches(i.text, q)).length;
      const on = ui.picked === s.id;
      return `<button type="button" class="rail-btn${q && !count ? ' dim' : ''}" data-pick="${esc(s.id)}" aria-pressed="${on}">
        ${badge(s)}<span class="name">${esc(s.name)}</span><span class="count">${count}</span></button>`;
    })
    .join('');
  $('rail').innerHTML = rail;

  // items
  const shown = picked ? [picked] : data.shops;
  let html = '';
  let anyOpen = false;
  for (const shop of shown) {
    const items = open.filter((i) => i.shopId === shop.id && matches(i.text, q));
    if (!items.length) continue;
    anyOpen = true;
    html += `<section class="group"><h2 class="group-label">${esc(shop.name)} · ${items.length}</h2><ul class="item-list">` +
      items.map((i) => `<li class="item-row">
        <button type="button" class="check-btn" data-toggle="${i.id}" aria-label="Mark ${esc(i.text)} bought"><span class="box" aria-hidden="true"></span></button>
        <button type="button" class="text-btn" data-edit-item="${i.id}" aria-label="Edit ${esc(i.text)}"><span class="item-text">${highlight(i.text, q)}</span></button></li>`).join('') +
      '</ul></section>';
  }

  const shownIds = new Set(shown.map((s) => s.id));
  const done = data.items
    .filter((i) => i.done && shownIds.has(i.shopId) && matches(i.text, q))
    .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  if (!anyOpen && !done.length) {
    if (q) {
      const target = picked ? picked.name : 'Unsorted';
      html += `<p class="empty-note">Nothing matches “${esc(ui.query.trim())}”.</p>
        <button type="button" class="dashed-btn" data-action="add-query">+ Add “${esc(ui.query.trim())}” to ${esc(target)}</button>`;
    } else {
      html += `<p class="empty-note">${picked ? 'Nothing to buy here.' : 'Your lists are empty.'} Tap the mic and say something like “buy milk from Costco”, or type above.</p>`;
    }
  } else if (!anyOpen) {
    html += `<p class="empty-note">${q ? 'Only bought items match.' : 'All done here!'}</p>`;
  }

  if (anyOpen) html += '<p class="tip">Tick the box when bought · tap an item to edit</p>';

  if (done.length) {
    html += `<section class="done-section" aria-label="Done"><div class="done-head">
        <h2 class="done-label">Done · ${done.length}</h2>
        <button type="button" class="pill-btn" data-action="clear">Clear</button></div><ul class="done-list">` +
      done.map((i) => {
        const shop = shopById(i.shopId);
        return `<li class="item-row">
          <button type="button" class="check-btn" data-toggle="${i.id}" aria-label="Put ${esc(i.text)} back on the list"><span class="box" aria-hidden="true">${ICONS.check}</span></button>
          <button type="button" class="text-btn" data-edit-item="${i.id}" aria-label="Edit ${esc(i.text)}"><span class="item-text">${highlight(i.text, q)}</span>
          <span class="from">${esc(shop ? shop.name : '')}</span></button></li>`;
      }).join('') + '</ul></section>';
  }
  $('list').innerHTML = html;
}

// ---------------------------------------------------------------- SHOPS render
function renderShops() {
  $('shop-count').textContent = `${data.shops.length} shops`;
  $('shop-list').innerHTML = data.shops.map((s) => {
    const words = [s.name.toLowerCase(), ...(s.aliases || [])];
    const sub = s.id === 'unsorted' ? 'Items where no shop was heard' : 'Listens for: ' + words.join(', ');
    const edit = s.id === 'unsorted' ? '' :
      `<button type="button" class="icon-btn" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)}">${ICONS.edit}</button>`;
    return `<li>${badge(s)}<div class="info"><span class="name">${esc(s.name)}</span>
      <span class="aliases">${esc(sub)}</span></div>${edit}</li>`;
  }).join('');
  renderSwatches();
}

function renderSwatches() {
  $('swatches').innerHTML = Object.entries(COLORS)
    .filter(([k]) => k !== 'grey')
    .map(([k, c]) => `<button type="button" class="swatch" data-color="${k}" aria-label="${c.label}" aria-pressed="${ui.formColor === k}" style="background:${c.bg}"></button>`)
    .join('');
}

function render() {
  renderHome();
  if (!$('shops').hidden) renderShops();
}

// ---------------------------------------------------------------- navigation
function showShops(push = true) {
  $('home').hidden = true;
  $('shops').hidden = false;
  closeForm();
  renderShops();
  if (push) history.pushState({ view: 'shops' }, '');
}
function showHome() {
  $('shops').hidden = true;
  $('home').hidden = false;
  stopAliasMic();
  renderHome();
}
window.addEventListener('popstate', () => {
  if (ui.sheet) { closeSheet(false); return; }
  if (!$('shops').hidden) showHome();
});

// ---------------------------------------------------------------- HOME events
$('rail').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pick]');
  if (!btn) return;
  ui.picked = btn.dataset.pick;
  renderHome();
});

$('btn-cart').addEventListener('click', () => { ui.picked = 'all'; renderHome(); });

$('btn-search').addEventListener('click', () => {
  if (ui.searching) return closeSearch();
  ui.searching = true;
  ui.query = '';
  ui.picked = 'all';
  $('search-input').value = '';
  renderHome();
  $('search-input').focus();
});
function closeSearch() {
  ui.searching = false;
  ui.query = '';
  renderHome();
}
$('btn-search-close').addEventListener('click', closeSearch);
$('search-input').addEventListener('input', (e) => { ui.query = e.target.value; renderHome(); });

$('btn-manage').addEventListener('click', () => showShops());

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('add-input');
  const text = input.value.trim();
  if (!text) return;
  const shopId = ui.picked === 'all' ? 'unsorted' : ui.picked;
  const snap = snapshot();
  await addItems(shopId, [text.charAt(0).toUpperCase() + text.slice(1)]);
  input.value = '';
  renderHome();
  toast(`Added ${text} to ${shopById(shopId).name}`, restore(snap));
});

// ---------------------------------------------------------------- edit an item (tap its name)
let editingItemId = null;
function openEdit(id) {
  hideToast();
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  editingItemId = id;
  $('edit-text').value = item.text;
  $('edit-shop').innerHTML = data.shops.map((s) => `<option value="${esc(s.id)}"${s.id === item.shopId ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  $('edit-sheet').hidden = false;
  $('edit-text').focus();
}
function closeEdit() { editingItemId = null; $('edit-sheet').hidden = true; }
$('edit-cancel').addEventListener('click', closeEdit);
$('edit-sheet').addEventListener('click', (e) => { if (e.target === $('edit-sheet')) closeEdit(); });
$('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const item = data.items.find((i) => i.id === editingItemId);
  const text = $('edit-text').value.trim();
  if (!item || !text) return;
  const snap = snapshot();
  item.text = text.charAt(0).toUpperCase() + text.slice(1);
  item.shopId = $('edit-shop').value;
  await persist();
  closeEdit();
  renderHome();
  toast(`Saved ${item.text} in ${shopById(item.shopId).name}`, restore(snap));
});
$('edit-delete').addEventListener('click', async () => {
  const item = data.items.find((i) => i.id === editingItemId);
  if (!item) return;
  const snap = snapshot();
  data.items = data.items.filter((i) => i.id !== item.id);
  await persist();
  closeEdit();
  renderHome();
  toast(`${item.text} deleted`, restore(snap));
});

$('list').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-item]');
  if (editBtn) { openEdit(editBtn.dataset.editItem); return; }
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const item = data.items.find((i) => i.id === toggle.dataset.toggle);
    if (!item) return;
    item.done = !item.done;
    item.doneAt = item.done ? Date.now() : undefined;
    await persist();
    renderHome();
    if (item.done) {
      toast(`${item.text} bought`, async () => {
        item.done = false; item.doneAt = undefined; await persist(); renderHome();
      });
    }
    return;
  }
  const action = e.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'clear') {
    const q = query();
    const scope = ui.picked === 'all' ? null : ui.picked;
    const toRemove = data.items.filter((i) => i.done && (!scope || i.shopId === scope) && matches(i.text, q));
    if (!toRemove.length) return;
    const snap = snapshot();
    const ids = new Set(toRemove.map((i) => i.id));
    data.items = data.items.filter((i) => !ids.has(i.id));
    await persist();
    renderHome();
    toast(`${toRemove.length} ${toRemove.length === 1 ? 'item' : 'items'} cleared`, restore(snap));
  }
  if (action.dataset.action === 'add-query') {
    const text = ui.query.trim();
    if (!text) return;
    const shopId = ui.picked === 'all' ? 'unsorted' : ui.picked;
    const snap = snapshot();
    await addItems(shopId, [text.charAt(0).toUpperCase() + text.slice(1)]);
    closeSearch();
    toast(`Added ${text} to ${shopById(shopId).name}`, restore(snap));
  }
});

// ---------------------------------------------------------------- LISTENING sheet
function bars(still) {
  // A calm glowing mic with soft rings rippling out while listening.
  const el = $('sheet-bars');
  if (!el.dataset.ready) {
    el.innerHTML = '<span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>' +
      '<span class="orb"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></span>';
    el.dataset.ready = '1';
  }
  el.classList.toggle('still', !!still);
}

function setStatus(text, live) {
  $('sheet-status').textContent = text;
  $('sheet-title').classList.toggle('idle', !live);
}

function openSheet() {
  ui.sheet = { phase: 'listening', transcript: '', result: null, handle: null };
  $('sheet').hidden = false;
  $('sheet-result').hidden = true;
  $('type-form').hidden = true;
  $('sheet-actions').hidden = false;
  $('btn-stop').hidden = false;
  $('btn-type-instead').hidden = false;
  $('sheet-transcript').textContent = '…';
  history.pushState({ view: 'sheet' }, '');
  if (!speech.isSupported()) return showTyping('Voice isn’t available here. Type what you would say:');
  startListening();
}

function startListening() {
  const s = ui.sheet;
  if (!s) return;
  $('btn-edit-said').hidden = true;
  s.phase = 'listening';
  $('sheet-result').hidden = true;
  $('type-form').hidden = true;
  $('sheet-actions').hidden = false;
  $('btn-stop').hidden = false;
  $('sheet-transcript').textContent = '…';
  setStatus('Listening…', true);
  bars(false);
  const handle = speech.listen({
    onPartial: (text) => { if (ui.sheet === s) $('sheet-transcript').textContent = `“${text}”`; }
  });
  s.handle = handle;
  // Ignore results from a listen that the user already left (typed instead, closed, etc.).
  const stillCurrent = () => ui.sheet === s && s.handle === handle && s.phase === 'listening';
  handle.promise
    .then((text) => {
      if (!stillCurrent()) return;
      s.handle = null;
      if (!text) return showTyping('I didn’t catch that. Try again, or type it:');
      showResult(text);
    })
    .catch((err) => {
      if (!stillCurrent()) return;
      s.handle = null;
      const msg = err && /not-allowed|denied|permission/i.test(err.message)
        ? 'Microphone access is off. Allow it in your phone settings, or type it:'
        : 'Voice didn’t work this time. Type what you would say:';
      showTyping(msg);
    });
}

function showTyping(message) {
  const s = ui.sheet;
  if (!s) return;
  $('btn-edit-said').hidden = true;
  if (s.handle) { s.handle.stop(); s.handle = null; }
  s.phase = 'typing';
  setStatus(message ? 'Type it' : 'Type it', false);
  bars(true);
  $('sheet-transcript').textContent = message || 'Type what you would say:';
  $('sheet-result').hidden = true;
  $('type-form').hidden = false;
  $('btn-stop').hidden = true;
  $('btn-type-instead').hidden = true;
  const input = $('type-input');
  input.value = '';
  input.focus();
}

function showResult(text) {
  const s = ui.sheet;
  s.phase = 'result';
  s.transcript = text;
  s.result = parse(text, data.shops);
  setStatus('Got it', false);
  bars(true);
  // What was heard is editable: fix a misheard word and the shop/items update as you type.
  $('sheet-transcript').innerHTML = `<div class="said-edit">
      <label for="said-input" class="sr-only">What you said</label>
      <textarea id="said-input" rows="2" enterkeyhint="done">${esc(text)}</textarea>
      <p class="said-hint">Heard something wrong? Tap <strong>Edit</strong> and fix the words.</p></div>`;
  $('btn-edit-said').hidden = false;
  $('type-form').hidden = true;
  $('sheet-actions').hidden = true;
  renderResult();
}

$('btn-edit-said').addEventListener('click', () => {
  const t = $('said-input');
  if (!t) return;
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
});

$('sheet-transcript').addEventListener('input', (e) => {
  if (e.target.id !== 'said-input' || !ui.sheet || ui.sheet.phase !== 'result') return;
  ui.sheet.transcript = e.target.value;
  ui.sheet.result = parse(e.target.value, data.shops);
  renderResult();
});
$('sheet-transcript').addEventListener('keydown', (e) => {
  if (e.target.id === 'said-input' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});

function renderResult() {
  const s = ui.sheet;
  const r = s.result;
  const box = $('sheet-result');
  box.hidden = false;

  if (r.type === 'newShop') {
    box.innerHTML = `<p class="label">New shop</p>
      <div class="result-shop">${badge({ id: 'new', name: r.name, color: 'blue' })}<strong style="font-size:18px">${esc(r.name)}</strong></div>
      <div class="result-buttons">
        <button type="button" class="ghost-btn" data-r="again">${ICONS.mic} Say again</button>
        <button type="button" class="primary-btn small" data-r="create">Create shop</button>
      </div>`;
    return;
  }

  const shop = shopById(r.shopId) || shopById('unsorted');
  const options = data.shops.map((sh) => `<option value="${esc(sh.id)}"${sh.id === shop.id ? ' selected' : ''}>${esc(sh.name)}</option>`).join('');
  const chips = r.items.length
    ? r.items.map((t, i) => `<span class="chip"><span class="chip-label">${esc(t)}</span><button type="button" data-r="edit-chip" data-i="${i}" aria-label="Edit ${esc(t)}">${ICONS.edit}</button><button type="button" data-r="remove" data-i="${i}" aria-label="Remove ${esc(t)}">${ICONS.close}</button></span>`).join('')
    : '<span class="hint">No item heard. Say again or type it.</span>';
  box.innerHTML = `<p class="label">Will save as</p>
    <div class="result-shop">${badge(shop)}
      <label for="result-shop" class="sr-only">Shop</label>
      <select id="result-shop">${options}</select></div>
    <div><p class="label" style="margin-bottom:8px">Items</p><div class="chips">${chips}</div></div>
    <div class="result-buttons">
      <button type="button" class="ghost-btn" data-r="again">${ICONS.mic} Say again</button>
      <button type="button" class="primary-btn small" data-r="save"${r.items.length ? '' : ' disabled'}>Save</button>
    </div>`;
}

$('sheet-result').addEventListener('change', (e) => {
  if (e.target.id === 'result-shop' && ui.sheet) {
    ui.sheet.result.shopId = e.target.value;
    renderResult();
  }
});

$('sheet-result').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-r]');
  if (!btn || !ui.sheet) return;
  const r = ui.sheet.result;
  const act = btn.dataset.r;
  if (act === 'remove') {
    r.items.splice(Number(btn.dataset.i), 1);
    renderResult();
  } else if (act === 'edit-chip') {
    const i = Number(btn.dataset.i);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = r.items[i];
    input.setAttribute('aria-label', 'Item name');
    input.enterKeyHint = 'done';
    const chip = btn.closest('.chip');
    chip.classList.add('editing');
    chip.querySelector('.chip-label').replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) r.items[i] = v.charAt(0).toUpperCase() + v.slice(1);
      else r.items.splice(i, 1);
      renderResult();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
    input.addEventListener('blur', commit, { once: true });
  } else if (act === 'again') {
    startListening();
  } else if (act === 'save') {
    const snap = snapshot();
    await addItems(r.shopId, r.items);
    const shop = shopById(r.shopId);
    closeSheet();
    ui.picked = ui.picked === 'all' ? 'all' : r.shopId;
    renderHome();
    toast(`Added ${r.items.join(', ')} to ${shop.name}`, restore(snap));
  } else if (act === 'create') {
    const snap = snapshot();
    const created = createShop({ name: r.name, aliases: [], color: 'blue' });
    await persist();
    closeSheet();
    renderHome();
    toast(created ? `${r.name} added` : `${r.name} already exists`, created ? restore(snap) : null);
  }
});

$('type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('type-input').value.trim();
  if (text) showResult(text);
});
$('btn-type-instead').addEventListener('click', () => showTyping('Type what you would say:'));
$('btn-stop').addEventListener('click', () => { if (ui.sheet && ui.sheet.handle) ui.sheet.handle.stop(); });
$('btn-sheet-close').addEventListener('click', () => closeSheet());
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
$('btn-mic').addEventListener('click', openSheet);

function closeSheet(goBack = true) {
  if (!ui.sheet) return;
  const s = ui.sheet;
  ui.sheet = null;
  if (s.handle) s.handle.stop();
  $('sheet').hidden = true;
  if (goBack && history.state && history.state.view === 'sheet') history.back();
}

// ---------------------------------------------------------------- MANAGE SHOPS
function slug(name) { return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop'; }
function parseAliases(text) {
  return String(text || '').split(',').map((a) => normalize(a)).filter(Boolean);
}

function createShop({ name, aliases, color: c }) {
  const clean = name.trim();
  if (!clean) return null;
  if (data.shops.some((s) => normalize(s.name) === normalize(clean))) return null;
  let id = slug(clean);
  if (shopById(id)) id = id + '-' + uid().slice(-4);
  const shop = { id, name: clean, color: c || 'blue', aliases };
  // new shops go above Reminder / Unsorted
  const firstSystem = data.shops.findIndex((s) => s.system);
  data.shops.splice(firstSystem < 0 ? data.shops.length : firstSystem, 0, shop);
  return shop;
}

function openForm(shop) {
  ui.editingId = shop ? shop.id : null;
  ui.formColor = shop ? shop.color : 'blue';
  $('form-title').textContent = shop ? `Edit ${shop.name}` : 'New shop';
  $('shop-name').value = shop ? shop.name : '';
  $('shop-alias').value = shop ? (shop.aliases || []).join(', ') : '';
  $('btn-form-delete').hidden = !shop || !!shop.system;
  $('shop-form').hidden = false;
  $('add-shop-wrap').hidden = true;
  renderSwatches();
  $('shop-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('shop-name').focus();
}
function closeForm() {
  stopAliasMic();
  ui.editingId = null;
  $('shop-form').hidden = true;
  $('add-shop-wrap').hidden = false;
}

$('btn-back').addEventListener('click', () => {
  if (history.state && history.state.view === 'shops') history.back();
  else showHome();
});
$('btn-add-shop').addEventListener('click', () => openForm(null));
$('btn-form-cancel').addEventListener('click', closeForm);
$('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  ui.formColor = b.dataset.color;
  renderSwatches();
});
$('shop-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) openForm(shopById(b.dataset.edit));
});

$('shop-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('shop-name').value.trim();
  if (!name) { $('shop-name').focus(); return; }
  const aliases = parseAliases($('shop-alias').value);
  const snap = snapshot();
  if (ui.editingId) {
    const shop = shopById(ui.editingId);
    const clash = data.shops.some((s) => s.id !== shop.id && normalize(s.name) === normalize(name));
    if (clash) { toast(`You already have ${name}`); return; }
    shop.name = name;
    shop.aliases = aliases;
    shop.color = ui.formColor;
    await persist();
    closeForm();
    renderShops();
    renderHome();
    toast(`${name} saved`, restore(snap));
  } else {
    const created = createShop({ name, aliases, color: ui.formColor });
    if (!created) { toast(`You already have ${name}`); return; }
    await persist();
    closeForm();
    renderShops();
    renderHome();
    toast(`${name} added`, restore(snap));
  }
});

$('btn-form-delete').addEventListener('click', async () => {
  const shop = shopById(ui.editingId);
  if (!shop || shop.system) return;
  const snap = snapshot();
  // keep its items: move them to Unsorted
  data.items.forEach((i) => { if (i.shopId === shop.id) i.shopId = 'unsorted'; });
  data.shops = data.shops.filter((s) => s.id !== shop.id);
  await persist();
  closeForm();
  renderShops();
  renderHome();
  toast(`${shop.name} deleted`, restore(snap));
});

// Alias mic: say the shop name; whatever the phone hears is added as a spelling.
let aliasHandle = null;
function stopAliasMic() {
  if (aliasHandle) { aliasHandle.stop(); aliasHandle = null; }
  $('btn-alias-mic').classList.remove('listening');
}
$('btn-alias-mic').addEventListener('click', () => {
  if (aliasHandle) return stopAliasMic();
  if (!speech.isSupported()) { toast('Voice isn’t available here — type the spellings instead'); return; }
  const btn = $('btn-alias-mic');
  btn.classList.add('listening');
  $('alias-hint').textContent = 'Listening… say the shop name';
  aliasHandle = speech.listen({});
  aliasHandle.promise
    .then((text) => {
      const heard = normalize(text);
      if (!heard) return;
      const input = $('shop-alias');
      const list = parseAliases(input.value);
      const name = normalize($('shop-name').value);
      if (heard !== name && !list.includes(heard)) list.push(heard);
      input.value = list.join(', ');
      $('alias-hint').textContent = `Heard “${heard}”. Tap the mic again to add another way.`;
    })
    .catch(() => { $('alias-hint').textContent = 'Couldn’t hear that. Try again or type it.'; })
    .finally(() => { aliasHandle = null; btn.classList.remove('listening'); });
});

// ---------------------------------------------------------------- start
async function init() {
  const saved = await load();
  if (saved && Array.isArray(saved.shops) && Array.isArray(saved.items)) {
    data = saved;
    // make sure the system shops exist even in older saves
    for (const def of DEFAULT_SHOPS.filter((s) => s.system)) {
      if (!shopById(def.id)) data.shops.push({ ...def });
    }
  } else {
    data = { shops: DEFAULT_SHOPS.map((s) => ({ ...s, aliases: [...s.aliases] })), items: [] };
    await persist();
  }
  history.replaceState({ view: 'home' }, '');
  renderHome();
}

init();

// Offline support when used as a website / installed PWA (not needed inside the native app).
// New versions are picked up on the next open: the page reloads once when an update arrives.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
    })
    .catch(() => {});
}
