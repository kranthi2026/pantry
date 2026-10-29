// Turns a spoken sentence into { type, shopId, items } using the user's shops.
//   "I want to buy milk and eggs from Costco" -> Costco: [Milk, Eggs]
//   "Save charger under Amazon"               -> Amazon: [Charger]
//   "Remind me to call the dentist"           -> Reminder: [Call the dentist]
//   "Add shop Target"                         -> { type: 'newShop', name: 'Target' }

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9&\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words that introduce the shop name ("from Costco", "under Amazon", "at Target").
const SHOP_PREPS = ['from', 'at', 'under', 'in', 'to', 'on', 'for', 'into'];

// Phrases people say before the item. Longest first so they are removed whole.
const LEAD_FILLERS = [
  'i want to buy', 'i need to buy', 'i have to buy', 'i want to get', 'i need to get',
  'can you add', 'can you save', 'please add', 'please save',
  'i want', 'i need', 'we need', 'we want', 'need to buy', 'need to get',
  'pick up', 'buy', 'get', 'add', 'save', 'put', 'grab', 'order',
  'please', 'also', 'and', 'some', 'a few'
];

const TRAIL_FILLERS = ['please', 'list', 'store', 'shop', 'too', 'also'];

const REMINDER_LEADS = ['remind me to', 'remind me', 'remember to', 'remember', 'dont forget to', 'do not forget to'];

const NEW_SHOP_RE = /^(?:add|create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:shop|store)\s+(?:called\s+|named\s+)?(.+)$/;

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function stripLeading(text, phrases) {
  let t = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of phrases) {
      if (t === p) return '';
      if (t.startsWith(p + ' ')) {
        t = t.slice(p.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  return t;
}

function stripTrailing(text, words) {
  let t = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of words) {
      if (t.endsWith(' ' + w)) {
        t = t.slice(0, -(w.length + 1)).trim();
        changed = true;
      }
    }
  }
  return t;
}

// Finds which shop the sentence mentions. Exact name/alias match first,
// then a forgiving match so "wallmart" or "croger" still find the shop.
export function findShop(text, shops) {
  const norm = normalize(text);
  let best = null;

  for (const shop of shops) {
    const names = [shop.name, ...(shop.aliases || [])].map(normalize).filter(Boolean);
    for (const name of names) {
      const re = new RegExp('(^|\\s)' + escapeRe(name) + '(?=\\s|$|,)');
      const m = re.exec(norm);
      if (m && (!best || name.length > best.phrase.length)) {
        best = { shop, phrase: name, index: m.index + m[1].length };
      }
    }
  }
  if (best) return best;

  // Forgiving match: compare each word (or pair of words) with each shop name.
  const words = norm.replace(/,/g, ' ').split(' ').filter(Boolean);
  for (const shop of shops) {
    if (shop.system) continue;
    const names = [shop.name, ...(shop.aliases || [])].map(normalize).filter(Boolean);
    for (const name of names) {
      const size = name.split(' ').length;
      if (name.replace(/\s/g, '').length < 5) continue;
      for (let i = 0; i + size <= words.length; i++) {
        const chunk = words.slice(i, i + size).join(' ');
        const squashedChunk = chunk.replace(/\s/g, '');
        const squashedName = name.replace(/\s/g, '');
        const close = levenshtein(chunk, name) <= 1 || squashedChunk === squashedName || levenshtein(squashedChunk, squashedName) <= 1;
        if (close) {
          const index = norm.indexOf(chunk);
          return { shop, phrase: chunk, index };
        }
      }
      // "wal mart" said as two words for a one-word shop name.
      if (size === 1) {
        for (let i = 0; i + 2 <= words.length; i++) {
          const pair = words[i] + words[i + 1];
          if (levenshtein(pair, name) <= 1) {
            const chunk = words[i] + ' ' + words[i + 1];
            return { shop, phrase: chunk, index: norm.indexOf(chunk) };
          }
        }
      }
    }
  }
  return null;
}

function removeShopPhrase(norm, match) {
  const before = norm.slice(0, match.index).trim();
  const after = norm.slice(match.index + match.phrase.length).trim();
  let head = stripTrailing(' ' + before, ['my', 'the', 'our', 'a']).trim();
  for (const p of SHOP_PREPS) {
    if (head === p) { head = ''; break; }
    if (head.endsWith(' ' + p)) { head = head.slice(0, -(p.length + 1)).trim(); break; }
  }
  const tail = stripLeading(after, ['list', 'store', 'shop']);
  return [head, tail].filter(Boolean).join(' ').trim();
}

function splitItems(text) {
  return text
    .split(/\s*,\s*|\s+and\s+|\s+&\s+|\s+plus\s+|\s+also\s+/)
    .map((s) => stripTrailing(stripLeading(s.trim(), LEAD_FILLERS), TRAIL_FILLERS))
    .map((s) => s.trim())
    .filter(Boolean)
    .map(capitalize);
}

export function parse(sentence, shops) {
  const norm = normalize(sentence);
  if (!norm) return { type: 'empty', shopId: null, items: [] };

  const newShop = NEW_SHOP_RE.exec(norm);
  if (newShop) {
    const name = newShop[1].split(' ').map(capitalize).join(' ').trim();
    return { type: 'newShop', name, shopId: null, items: [] };
  }

  const reminder = shops.find((s) => s.id === 'reminder');
  const unsorted = shops.find((s) => s.id === 'unsorted');

  // Reminders: keep the whole sentence as one item.
  for (const lead of REMINDER_LEADS) {
    if (reminder && (norm === lead || norm.startsWith(lead + ' '))) {
      let rest = norm.slice(lead.length).trim();
      const m = findShop(rest, shops);
      if (m && m.shop.id === 'reminder') rest = removeShopPhrase(rest, m);
      rest = stripTrailing(rest, TRAIL_FILLERS);
      return { type: 'items', shopId: reminder.id, items: rest ? [capitalize(rest)] : [] };
    }
  }

  const match = findShop(norm, shops);
  let shopId = unsorted ? unsorted.id : null;
  let rest = norm;
  if (match) {
    shopId = match.shop.id;
    rest = removeShopPhrase(norm, match);
  }

  if (shopId === 'reminder') {
    rest = stripTrailing(stripLeading(rest, [...REMINDER_LEADS, ...LEAD_FILLERS]), TRAIL_FILLERS);
    return { type: 'items', shopId, items: rest ? [capitalize(rest)] : [] };
  }

  rest = stripLeading(rest, LEAD_FILLERS);
  return { type: 'items', shopId, items: splitItems(rest) };
}
