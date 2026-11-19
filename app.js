// Basket: a budget meal planner for UK supermarkets.
// Runs entirely in the browser. Prices come from data/prices.json,
// which a GitHub Action refreshes once a month.

/* ================= constants ================= */
const STORES = {
  tesco: { name: 'Tesco', loyalty: 'Clubcard' },
  asda: { name: 'Asda', loyalty: null },
  aldi: { name: 'Aldi', loyalty: null },
  morrisons: { name: 'Morrisons', loyalty: 'More Card' },
  waitrose: { name: 'Waitrose', loyalty: 'myWaitrose' },
};
const APPLIANCES = [['hob', 'Hob'], ['oven', 'Oven'], ['airfryer', 'Air fryer'], ['microwave', 'Microwave'], ['slowcooker', 'Slow cooker'], ['grill', 'Grill']];
const AVOID = [['vegetarian', 'Vegetarian only'], ['pork', 'No pork'], ['beef', 'No beef'], ['lamb', 'No lamb'], ['fish', 'No fish or seafood'], ['mushrooms', 'No mushrooms'], ['spicy', 'Nothing spicy'], ['dairy', 'Dairy-free']];
const STYLES = [
  [0, 'Quick meals only', 'A different dinner every night'],
  [1, 'Some batch cooking', 'One dinner cooked once, eaten twice'],
  [2, 'More batch cooking', 'Two dinners cooked once, eaten twice'],
  [3, 'Mostly batch cooking', 'Cook on four nights a week'],
];
const CUPBOARD = ['beef-stock', 'chicken-stock', 'veg-stock', 'mixed-herbs', 'paprika', 'chilli-powder', 'cumin', 'curry-powder', 'garam-masala', 'oregano', 'plain-flour', 'soy-sauce', 'gravy-granules', 'tomato-puree', 'ketchup', 'mayonnaise', 'honey', 'rice', 'spaghetti', 'pasta'];
const QUICK_ADD = ['Milk', 'Bread', 'Eggs', 'Butter', 'Bananas', 'Tea bags', 'Coffee', 'Squash', 'Toilet roll', 'Kitchen roll', 'Washing-up liquid', 'Bin bags', 'Crisps', 'Yogurts'];
const REGULAR_GROUPS = [
  ['Food basics', ['Milk', 'Bread', 'Eggs', 'Butter', 'Cheese', 'Yogurts', 'Cereal', 'Porridge oats', 'Bananas', 'Apples', 'Grapes', 'Oranges', 'Strawberries', 'Tomatoes', 'Cucumber', 'Salad bag', 'Potatoes', 'Onions', 'Jam', 'Peanut butter', 'Ham', 'Sliced chicken', 'Baked beans', 'Tinned soup', 'Pasta sauce', 'Frozen chips', 'Frozen veg', 'Pizza', 'Ice cream', 'Wraps', 'Crumpets', 'Bagels']],
  ['Drinks', ['Tea bags', 'Coffee', 'Squash', 'Orange juice', 'Apple juice', 'Fizzy drinks', 'Sparkling water', 'Bottled water', 'Hot chocolate', 'Oat milk', 'Energy drinks']],
  ['Snacks and lunchbox', ['Crisps', 'Biscuits', 'Chocolate', 'Cereal bars', 'Popcorn', 'Nuts', 'Rice cakes', 'Fruit pots', 'Cheese strings', 'Yogurt tubes', 'Sweets', 'Crackers']],
  ['Cupboard top-ups', ['Sugar', 'Salt', 'Black pepper', 'Cooking oil', 'Olive oil', 'Ketchup', 'Brown sauce', 'Mayonnaise', 'Gravy granules', 'Stock cubes', 'Flour', 'Rice', 'Pasta', 'Noodles', 'Tinned tomatoes', 'Spices']],
  ['Household', ['Toilet roll', 'Kitchen roll', 'Washing-up liquid', 'Dishwasher tablets', 'Laundry detergent', 'Fabric conditioner', 'Bin bags', 'Food bags', 'Cling film', 'Foil', 'Baking paper', 'Sponges', 'Bleach', 'Surface spray', 'Glass cleaner', 'Air freshener', 'Light bulbs', 'Batteries']],
  ['Toiletries', ['Toothpaste', 'Toothbrushes', 'Shower gel', 'Shampoo', 'Conditioner', 'Deodorant', 'Hand soap', 'Tissues', 'Cotton pads', 'Razors', 'Sun cream', 'Plasters', 'Paracetamol']],
  ['Baby and pets', ['Nappies', 'Baby wipes', 'Baby food', 'Dog food', 'Cat food', 'Pet treats', 'Cat litter']],
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NIGHT_LIMIT = { chicken: 3, beef: 3, pork: 3, fish: 2, lamb: 2, veg: 3 };
const LUNCH_SPAN = [2, 2, 3];
const CHILD_PORTION = 0.6;
const PACK_SLACK = 1.08; // a recipe can come up to 8% short of a pack before another is bought

const DEFAULTS = {
  store: 'tesco', budget: 50, adults: 2, children: 0,
  appliances: ['hob', 'oven', 'microwave'], avoid: [], batch: 1, mode: 'save',
  loyalty: { tesco: false, morrisons: false, waitrose: false },
  meals: { breakfast: false, lunch: false },
  useFavourites: true,
};

/* ================= storage =================
   One small layer, so a family login can replace localStorage later. */
const Storage = {
  get(key, fallback) {
    try { const v = localStorage.getItem('basket.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('basket.' + key, JSON.stringify(value)); } catch { /* full or blocked */ }
  },
  remove(key) { try { localStorage.removeItem('basket.' + key); } catch { /* ignore */ } },
};
const KEYS = ['settings', 'plan', 'saved', 'hidden', 'cupboard', 'favourites', 'regulars', 'extras', 'spend'];

/* ================= state ================= */
const clone = (x) => JSON.parse(JSON.stringify(x));
const data = { ingredients: [], ing: {}, aisles: [], recipes: [], recipe: {}, prices: null, sample: null };
const state = {
  tab: 'today',
  sub: null,
  settings: normaliseSettings(Storage.get('settings', {})),
  plan: migratePlan(Storage.get('plan', null)),
  saved: (Storage.get('saved', []) || []).map(migratePlan).filter(Boolean),
  hidden: Storage.get('hidden', []),
  cupboard: Storage.get('cupboard', []),
  favourites: Storage.get('favourites', []),
  regulars: Storage.get('regulars', []),
  extras: Storage.get('extras', []),
  spend: Storage.get('spend', []),
  mealsFilter: { q: '', kind: 'all', fav: false },
  spendDraft: null,
};
const save = (key) => Storage.set(key, state[key]);

function normaliseSettings(s) {
  const out = { ...clone(DEFAULTS), ...(s || {}) };
  out.loyalty = { ...DEFAULTS.loyalty, ...(s?.loyalty || {}) };
  out.meals = { ...DEFAULTS.meals, ...(s?.meals || {}) };
  if (!STORES[out.store]) out.store = 'tesco';
  return out;
}
function migratePlan(p) {
  if (!p) return null;
  if (p.days && !p.dinners) { p.dinners = p.days; delete p.days; }
  if (!Array.isArray(p.dinners)) return null;
  if (!p.start) p.start = isoDate(new Date(p.created || Date.now()));
  p.breakfasts = p.breakfasts || null;
  p.lunches = p.lunches || null;
  p.checked = p.checked || {};
  p.settings = normaliseSettings(p.settings);
  return p;
}

/* ================= helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (n) => '£' + (Math.round((n || 0) * 100) / 100).toFixed(2);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const uid = () => Math.random().toString(36).slice(2, 10);
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const servingsOf = (s) => Math.max(1, s.adults + s.children * CHILD_PORTION);
const mealOf = (r) => r.meal || 'dinner';
const nightsOf = (r) => (mealOf(r) === 'dinner' && r.type === 'batch' ? 2 : 1);
const tileClass = (r) => (mealOf(r) === 'dinner' ? r.protein : mealOf(r));
const tile = (r, size = 'md') => `<span class="tile s-${size} t-${tileClass(r)}" aria-hidden="true">${r.emoji}</span>`;
const isFav = (id) => state.favourites.includes(id);
const peopleText = (s) => {
  const a = `${s.adults} ${s.adults === 1 ? 'adult' : 'adults'}`;
  return s.children ? `${a}, ${s.children} ${s.children === 1 ? 'child' : 'children'}` : a;
};
const timeText = (m) => (m >= 120 ? `${Math.round(m / 60)} hrs` : m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);

// dates
function isoDate(d) { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; }
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayISO = () => isoDate(new Date());
const planDate = (plan, i) => addDays(parseISO(plan.start), i);
const dayIndex = (plan) => Math.round((parseISO(todayISO()) - parseISO(plan.start)) / 86400000);
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('en-GB', o);
const mondayOf = (d) => { const x = parseISO(isoDate(d)); return addDays(x, -((x.getDay() + 6) % 7)); };

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function nice(n) { if (n < 1) return Math.max(0.25, Math.round(n * 4) / 4); if (n < 5) return Math.round(n * 2) / 2; return Math.round(n); }
function fmtNum(n) { const w = Math.floor(n), f = Math.round((n - w) * 100) / 100; if (FRACTIONS[f]) return (w || '') + FRACTIONS[f]; return String(Math.round(n * 100) / 100); }
const MEASURE_NOUNS = new Set(['tbsp', 'tsp', 'tin', 'tins', 'clove', 'cloves', 'slice', 'slices', 'rasher', 'rashers']);
function fmtAmount(ing, qty) {
  if (ing.show) {
    const [per, one, many] = ing.show;
    const n = nice(qty / per);
    const noun = n <= 1 ? one : many;
    return MEASURE_NOUNS.has(noun) ? `${fmtNum(n)} ${noun} ${ing.name.toLowerCase()}` : `${fmtNum(n)} ${noun}`;
  }
  if (ing.unit === 'each') return `${fmtNum(nice(qty))} × ${ing.name.toLowerCase()}`;
  const unit = ing.unit === 'ml' ? 'ml' : 'g';
  if (qty >= 1000) return `${Math.round(qty / 100) / 10}${unit === 'g' ? 'kg' : ' litres'} ${ing.name.toLowerCase()}`;
  const rounded = qty < 20 ? Math.max(1, Math.round(qty)) : Math.round(qty / 5) * 5;
  return `${rounded}${unit} ${ing.name.toLowerCase()}`;
}

/* ================= pricing ================= */
function productsFor(store, key) {
  const real = data.prices && !data.prices.sample ? data.prices.stores?.[store]?.[key] : null;
  if (real && real.length) return real.map((p) => ({ ...p, est: false }));
  const est = !!(data.prices && !data.prices.sample);
  return (data.sample?.stores?.[store]?.[key] || []).map((p) => ({ ...p, est }));
}

function makeCtx(settings) {
  const loyaltyOn = !!(STORES[settings.store].loyalty && settings.loyalty?.[settings.store]);
  const cupboard = new Set(state.cupboard);
  const cache = new Map(), products = new Map();
  const list = (key) => { if (!products.has(key)) products.set(key, productsFor(settings.store, key)); return products.get(key); };
  function buy(key, need) {
    if (cupboard.has(key)) return { key, need, have: true, cost: 0 };
    const ck = key + '|' + Math.round(need * 10);
    if (cache.has(ck)) return cache.get(ck);
    let best = null;
    for (const p of list(key)) {
      const unit = loyaltyOn && p.lp ? p.lp : p.p;
      const packs = Math.max(1, Math.ceil(need / (p.q * PACK_SLACK) - 1e-9));
      const cost = packs * unit;
      if (!best || cost < best.cost - 0.001 || (Math.abs(cost - best.cost) < 0.001 && p.q > best.p.q)) {
        best = { key, need, p, packs, unit, cost, bought: packs * p.q, loyalty: loyaltyOn && !!p.lp };
      }
    }
    if (!best) best = { key, need, missing: true, cost: 0 };
    cache.set(ck, best);
    return best;
  }
  return { settings, servings: servingsOf(settings), buy, loyaltyOn };
}

// entries: [{ r, n }] where n = how many days of that meal the household eats
function aggregate(ctx, entries) {
  const totals = new Map(), usedBy = new Map();
  for (const e of entries) {
    for (const [k, per] of e.r.ing) {
      totals.set(k, (totals.get(k) || 0) + per * ctx.servings * e.n);
      if (!usedBy.has(k)) usedBy.set(k, []);
      if (!usedBy.get(k).includes(e.r.name)) usedBy.get(k).push(e.r.name);
    }
  }
  return { totals, usedBy };
}
function costOf(ctx, entries) {
  let cost = 0, spare = 0, est = 0;
  for (const [k, q] of aggregate(ctx, entries).totals) {
    const b = ctx.buy(k, q);
    cost += b.cost;
    if (b.bought) spare += b.cost * Math.max(0, 1 - q / b.bought);
    if (b.p?.est) est++;
  }
  return { cost, spare, est };
}

/* ================= recipe rules ================= */
function eligible(settings, opts = {}) {
  const have = new Set(settings.appliances);
  const avoid = new Set(settings.avoid);
  const hidden = new Set(opts.ignoreHidden ? [] : state.hidden);
  return data.recipes.filter((r) => {
    if (hidden.has(r.id)) return false;
    if (!r.needs.every((group) => group.some((a) => have.has(a)))) return false;
    if (avoid.has('spicy') && r.spicy) return false;
    for (const [key] of r.ing) {
      const tags = data.ing[key]?.avoid || [];
      if (avoid.has('vegetarian') && (tags.includes('meat') || tags.includes('fish'))) return false;
      for (const t of ['pork', 'beef', 'lamb', 'fish', 'mushrooms', 'dairy']) if (avoid.has(t) && tags.includes(t)) return false;
      if (!productsFor(settings.store, key).length) return false;
    }
    return true;
  });
}

function makeScorer(settings, noise) {
  const B = settings.budget;
  const target = settings.mode === 'full' ? B : B * 0.88;
  const limits = settings.avoid.includes('vegetarian') ? { ...NIGHT_LIMIT, veg: 7 } : NIGHT_LIMIT;
  const favs = settings.useFavourites ? new Set(state.favourites) : new Set();
  return (cost, sel, spare = 0) => {
    let s = spare * 0.5;
    if (cost > B) s += (cost - B) * 40 + 15;
    if (cost > target) s += (cost - target) * 3;
    else s += (target - cost) * (settings.mode === 'full' ? 1 : 0.2);
    const nights = {}, fam = {};
    for (const r of sel) {
      if (favs.has(r.id)) s -= B * 0.05;
      s += (noise[r.id] || 0) * B * 0.03;
      if (mealOf(r) !== 'dinner') continue;
      nights[r.protein] = (nights[r.protein] || 0) + nightsOf(r);
      fam[r.family] = (fam[r.family] || 0) + 1;
    }
    for (const [p, n] of Object.entries(nights)) if (n > (limits[p] ?? 3)) s += (n - limits[p]) * B * 0.12;
    for (const n of Object.values(fam)) if (n > 1) s += (n - 1) * B * 0.18;
    return s;
  };
}

/* ================= the planner ================= */
function planSlots(settings) {
  const pool = eligible(settings);
  const dinners = pool.filter((r) => mealOf(r) === 'dinner');
  const batchPool = dinners.filter((r) => r.type === 'batch'), quickPool = dinners.filter((r) => r.type !== 'batch');
  let k = Math.min(settings.batch, batchPool.length);
  while (7 - 2 * k > quickPool.length && k < Math.min(3, batchPool.length)) k++;
  const q = 7 - 2 * k;
  if (q < 0 || q > quickPool.length) return { error: 'dinner', count: dinners.length };
  const slots = [];
  for (let i = 0; i < k; i++) slots.push({ kind: 'dinner', pool: batchPool, n: 2 });
  for (let i = 0; i < q; i++) slots.push({ kind: 'dinner', pool: quickPool, n: 1 });
  if (settings.meals.breakfast) {
    const all = pool.filter((r) => mealOf(r) === 'breakfast'), weekday = all.filter((r) => r.weekday !== false);
    if (!weekday.length || all.length < 2) return { error: 'breakfast' };
    slots.push({ kind: 'bw', pool: weekday, n: 5 }, { kind: 'be', pool: all, n: 2 });
  }
  if (settings.meals.lunch) {
    const lunch = pool.filter((r) => mealOf(r) === 'lunch');
    if (lunch.length < 3) return { error: 'lunch' };
    LUNCH_SPAN.forEach((n, i) => slots.push({ kind: 'l' + i, pool: lunch, n }));
  }
  return { slots, pool };
}

function generatePlan(settings) {
  const { slots, pool, error } = planSlots(settings);
  if (error) return { error };
  const ctx = makeCtx(settings);
  const noise = Object.fromEntries(pool.map((r) => [r.id, Math.random()]));
  const score = makeScorer(settings, noise);
  const evaluate = (sel) => { const { cost, spare } = costOf(ctx, sel.map((r, i) => ({ r, n: slots[i].n }))); return { sel, cost, score: score(cost, sel, spare) }; };
  const randomSel = () => {
    const used = new Set();
    return slots.map((s) => { const opts = s.pool.filter((r) => !used.has(r.id)); const r = opts[Math.floor(Math.random() * opts.length)]; used.add(r.id); return r; });
  };

  const seeds = [];
  for (let i = 0; i < 260; i++) seeds.push(evaluate(randomSel()));
  seeds.sort((a, b) => a.score - b.score);
  let best = seeds[0];
  for (const seed of seeds.slice(0, 4)) {
    let cur = seed;
    for (let pass = 0; pass < 6; pass++) {
      let improved = false;
      for (let i = 0; i < slots.length; i++) {
        for (const alt of slots[i].pool) {
          if (cur.sel.some((r) => r.id === alt.id)) continue;
          const sel = [...cur.sel]; sel[i] = alt;
          const ev = evaluate(sel);
          if (ev.score < cur.score - 0.0001) { cur = ev; improved = true; }
        }
      }
      if (!improved) break;
    }
    if (cur.score < best.score) best = cur;
  }

  const sel = best.sel;
  const start = todayISO();
  const plan = {
    id: uid(), created: new Date().toISOString(), start, settings: clone(settings),
    dinners: arrange(sel.filter((_, i) => slots[i].kind === 'dinner'), start),
    breakfasts: null, lunches: null, checked: {},
  };
  const bi = slots.findIndex((s) => s.kind === 'bw');
  if (bi > -1) plan.breakfasts = { weekday: sel[bi].id, weekend: sel[bi + 1].id };
  const li = slots.findIndex((s) => s.kind === 'l0');
  if (li > -1) plan.lunches = [sel[li].id, sel[li + 1].id, sel[li + 2].id];
  return plan;
}

// Batch dinners take two nights (cook, then leftovers). A Sunday roast goes on Sunday.
function arrange(sel, start) {
  const batches = shuffle(sel.filter((r) => r.type === 'batch'));
  const quicks = shuffle(sel.filter((r) => r.type !== 'batch'));
  const ri = quicks.findIndex((r) => r.sunday);
  const roast = ri > -1 ? quicks.splice(ri, 1)[0] : null;
  const days = Array(7).fill(null);
  if (roast) days[[0, 1, 2, 3, 4, 5, 6].find((i) => addDays(parseISO(start), i).getDay() === 0)] = { r: roast.id, left: false };
  const blocks = [];
  while (batches.length || quicks.length) {
    if (batches.length) { const b = batches.shift(); blocks.push({ r: b.id, left: false }, { r: b.id, left: true }); }
    if (quicks.length) blocks.push({ r: quicks.shift().id, left: false });
  }
  for (const d of blocks) { const i = days.findIndex((x) => !x); if (i > -1) days[i] = d; }
  return days;
}

function planEntries(plan) {
  const out = [], seen = new Set();
  for (const d of plan.dinners) {
    if (!d || d.left || seen.has(d.r)) continue;
    seen.add(d.r);
    const r = data.recipe[d.r];
    if (r) out.push({ key: 'd:' + r.id, kind: 'dinner', r, n: nightsOf(r) });
  }
  if (plan.breakfasts) {
    const a = data.recipe[plan.breakfasts.weekday], b = data.recipe[plan.breakfasts.weekend];
    if (a) out.push({ key: 'bw', kind: 'bw', r: a, n: 5 });
    if (b) out.push({ key: 'be', kind: 'be', r: b, n: 2 });
  }
  if (plan.lunches) plan.lunches.forEach((id, i) => { const r = data.recipe[id]; if (r) out.push({ key: 'l' + i, kind: 'l' + i, r, n: LUNCH_SPAN[i] }); });
  return out;
}
const breakfastFor = (plan, i) => plan.breakfasts ? data.recipe[isWeekend(planDate(plan, i)) ? plan.breakfasts.weekend : plan.breakfasts.weekday] : null;
const breakfastKind = (plan, i) => (isWeekend(planDate(plan, i)) ? 'be' : 'bw');
const lunchSlot = (i) => (i < 2 ? 0 : i < 4 ? 1 : 2);
const lunchFor = (plan, i) => plan.lunches ? data.recipe[plan.lunches[lunchSlot(i)]] : null;

function computePlan(plan) {
  const ctx = makeCtx(plan.settings);
  const entries = planEntries(plan);
  const { totals, usedBy } = aggregate(ctx, entries);
  const lines = [];
  let total = 0, estimated = false;
  for (const [k, need] of totals) {
    const line = { ...ctx.buy(k, need), ing: data.ing[k], usedIn: usedBy.get(k) || [] };
    total += line.cost;
    if (line.p?.est) estimated = true;
    lines.push(line);
  }
  const lineBy = Object.fromEntries(lines.map((l) => [l.key, l]));
  const mealCost = {};
  for (const e of entries) {
    let c = 0;
    for (const [k, per] of e.r.ing) { const l = lineBy[k]; if (l && !l.have && l.bought) c += ((per * ctx.servings * e.n) / l.bought) * l.cost; }
    mealCost[e.key] = c;
  }
  const used = Object.values(mealCost).reduce((a, b) => a + b, 0);
  return { ctx, entries, lines, lineBy, total, mealCost, spare: Math.max(0, total - used), estimated };
}

function fitsKind(r, kind, target) {
  if (kind === 'dinner') return mealOf(r) === 'dinner' && (r.type === 'batch') === (target.type === 'batch');
  if (kind === 'bw') return mealOf(r) === 'breakfast' && r.weekday !== false;
  if (kind === 'be') return mealOf(r) === 'breakfast';
  return mealOf(r) === 'lunch';
}
function swapOptions(plan, kind, id) {
  const s = plan.settings, ctx = makeCtx(s);
  const entries = planEntries(plan);
  const base = costOf(ctx, entries).cost;
  const target = data.recipe[id];
  const inPlan = new Set(entries.map((e) => e.r.id));
  const score = makeScorer(s, {});
  return eligible(s).filter((r) => !inPlan.has(r.id) && fitsKind(r, kind, target)).map((r) => {
    const sel = entries.map((e) => (e.kind === kind && e.r.id === id ? { ...e, r } : e));
    const { cost, spare } = costOf(ctx, sel);
    return { r, cost, delta: cost - base, score: score(cost, sel.map((e) => e.r), spare) };
  }).sort((a, b) => a.score - b.score).slice(0, 8);
}
function applySwap(plan, kind, from, to) {
  if (kind === 'dinner') plan.dinners = plan.dinners.map((d) => (d.r === from ? { ...d, r: to } : d));
  else if (kind === 'bw') plan.breakfasts.weekday = to;
  else if (kind === 'be') plan.breakfasts.weekend = to;
  else plan.lunches[+kind.slice(1)] = to;
}

function priceCheck(plan) {
  const entries = planEntries(plan);
  return Object.keys(STORES).map((store) => {
    const ctx = makeCtx({ ...plan.settings, store });
    const { cost, est } = costOf(ctx, entries);
    return { store, cost, est, loyaltyOn: ctx.loyaltyOn };
  }).sort((a, b) => a.cost - b.cost);
}

/* ================= spending ================= */
function spendSummary() {
  const now = new Date();
  const thisMon = mondayOf(now);
  const wkKey = (d) => isoDate(mondayOf(parseISO(d)));
  const byWeek = {};
  for (const e of state.spend) byWeek[wkKey(e.date)] = (byWeek[wkKey(e.date)] || 0) + e.amount;
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const m = addDays(thisMon, -7 * i); weeks.push({ start: m, total: byWeek[isoDate(m)] || 0 }); }
  const ym = isoDate(now).slice(0, 7);
  const month = state.spend.filter((e) => e.date.startsWith(ym)).reduce((a, e) => a + e.amount, 0);
  const last4 = weeks.slice(-4);
  const counted = last4.filter((w) => w.total > 0);
  return { week: weeks[weeks.length - 1].total, month, avg: counted.length ? counted.reduce((a, w) => a + w.total, 0) / counted.length : 0, weeks };
}

/* ================= rendering ================= */
const app = $('#app');
let computed = null;

function render() {
  if (!data.prices) { app.innerHTML = `<div class="loading">Loading prices…</div>`; renderTabbar(); return; }
  const v = currentView();
  app.innerHTML = `
    <header class="navbar">
      <div class="nav-left">${v.back ? `<button class="nav-btn" data-action="${v.back.action}">${icon('back')}${esc(v.back.label)}</button>` : ''}</div>
      <div class="nav-title">${esc(v.title)}</div>
      <div class="nav-right">${v.right ? `<button class="nav-btn ${v.right.strong ? 'strong' : ''}" data-action="${v.right.action}">${esc(v.right.label)}</button>` : ''}</div>
    </header>
    <div class="large-title"><h1>${esc(v.title)}</h1>${v.subtitle ? `<p>${v.subtitle}</p>` : ''}</div>
    ${v.html}`;
  renderTabbar();
  onScroll();
  if (v.after) v.after();
}

function currentView() {
  if (state.tab === 'today') return todayView();
  if (state.tab === 'week') return state.sub === 'setup' || !state.plan ? setupView() : weekView();
  if (state.tab === 'list') return listView();
  if (state.tab === 'meals') return mealsView();
  const subs = { saved: savedView, spend: spendView, regulars: regularsView, cupboard: cupboardView, hidden: hiddenView, prices: pricesView };
  return subs[state.sub] ? subs[state.sub]() : moreView();
}

const TABS = [['today', 'Today'], ['week', 'Week'], ['list', 'List'], ['meals', 'Meals'], ['more', 'More']];
function renderTabbar() {
  const left = computed ? computed.lines.filter((l) => !l.have && !l.missing && !state.plan.checked[l.key]).length : 0;
  const extrasLeft = state.extras.filter((x) => !x.done).length;
  const n = left + extrasLeft;
  $('#tabbar').innerHTML = `<div class="tabbar-inner">${TABS.map(([k, label]) => `
    <button class="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon('tab-' + k)}<span>${label}</span>${k === 'list' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</div>`;
}

/* ---------- Today ---------- */
function todayView() {
  const now = new Date();
  const title = 'Today';
  const subtitle = esc(fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' }));
  if (!state.plan) {
    return { title, subtitle, html: `
      <div class="card stack">
        <span class="kicker">Get started</span>
        <h2 class="tonight-name">Plan a week of meals that fits your budget</h2>
        <p class="muted">Choose your supermarket, budget and who's eating. Basket builds the meals and one shopping list with real prices.</p>
        <button class="btn btn-filled btn-block" data-action="go" data-tab="week">Plan my week</button>
      </div>${spendCard()}` };
  }
  const plan = state.plan, c = computed, i = dayIndex(plan);
  if (i < 0 || i > 6) {
    return { title, subtitle, html: `
      <div class="card stack">
        <span class="kicker">New week</span>
        <h2 class="tonight-name">Your last plan has finished</h2>
        <p class="muted">Plan the next seven days with the same settings, or change them first.</p>
        <div class="actions"><button class="btn btn-filled" data-action="shuffle">Plan next week</button><button class="btn btn-gray" data-action="edit">Change settings</button></div>
      </div>${spendCard()}` };
  }
  const d = plan.dinners[i], r = data.recipe[d.r];
  const bf = breakfastFor(plan, i), ln = lunchFor(plan, i);
  const tip = prepTip(plan, i);
  const next = [i + 1, i + 2].filter((j) => j < 7).map((j) => ({ j, d: plan.dinners[j], r: data.recipe[plan.dinners[j].r] }));
  const toBuy = c.lines.filter((l) => !l.have && !l.missing && !plan.checked[l.key]).length + state.extras.filter((x) => !x.done).length;
  return { title, subtitle, html: `
    <div class="card tonight">
      <span class="kicker">Tonight</span>
      <button class="tonight-top" data-action="open" data-recipe="${r.id}" data-kind="dinner" style="text-align:left">
        ${tile(r, 'xl')}
        <span class="row-main"><span class="tonight-name">${d.left ? 'Leftovers: ' : ''}${esc(r.name)}</span>
        <span class="row-sub">${d.left ? 'Already cooked, just reheat' : `${timeText(r.mins)} · ${gbp(c.mealCost['d:' + r.id] / (c.ctx.servings * nightsOf(r)))} a portion`}</span></span>
      </button>
      ${bf ? `<button class="mini-row" data-action="open" data-recipe="${bf.id}" data-kind="${breakfastKind(plan, i)}" style="text-align:left">${tile(bf, 'sm')}<span class="row-main"><span class="lbl">Breakfast</span>${esc(bf.name)}</span>${icon('chev')}</button>` : ''}
      ${ln ? `<button class="mini-row" data-action="open" data-recipe="${ln.id}" data-kind="l${lunchSlot(i)}" style="text-align:left">${tile(ln, 'sm')}<span class="row-main"><span class="lbl">Lunch</span>${esc(ln.name)}</span>${icon('chev')}</button>` : ''}
    </div>
    ${tip ? `<div class="spacer"></div><div class="card tip"><span class="icon-sq" style="background:var(--i-orange)">${icon('clock')}</span><p>${tip}</p></div>` : ''}
    <div class="spacer"></div>
    <div class="actions">
      <button class="btn btn-tinted" data-action="go" data-tab="list">${icon('cart')}List${toBuy ? ` (${toBuy})` : ''}</button>
      <button class="btn btn-tinted" data-action="price-check">${icon('tag')}Price check</button>
    </div>
    ${next.length ? `<div class="section-head"><h2>Coming up</h2><button class="link" data-action="go" data-tab="week">See week</button></div>
    <div class="group tiles">${next.map(({ j, d: dd, r: rr }) => `
      <button class="row" data-action="open" data-recipe="${rr.id}" data-kind="dinner">${tile(rr)}<span class="row-main"><span class="row-title">${dd.left ? 'Leftovers: ' : ''}${esc(rr.name)}</span><span class="row-sub">${esc(DAY_NAMES[planDate(plan, j).getDay()])}</span></span>${icon('chev')}</button>`).join('')}</div>` : ''}
    ${spendCard()}` };
}

function prepTip(plan, i) {
  if (i >= 6) return null;
  const d = plan.dinners[i + 1], r = data.recipe[d.r];
  if (d.left) return `Tomorrow is leftovers night (${esc(r.name)}), so there's nothing to cook.`;
  if (r.mins >= 120 && r.needs.some((g) => g.includes('slowcooker')) && plan.settings.appliances.includes('slowcooker')) return `Tomorrow's ${esc(r.name.toLowerCase())} takes ${timeText(r.mins)}. If you're using the slow cooker, start it in the morning.`;
  const meat = r.ing.map(([k]) => data.ing[k]).find((g) => g && (g.avoid.includes('meat') || g.avoid.includes('fish')) && g.aisle === 'Meat & fish');
  if (meat) return `If your ${esc(meat.name.toLowerCase())} for tomorrow's ${esc(r.name.toLowerCase())} is in the freezer, move it to the fridge tonight.`;
  return null;
}

function spendCard() {
  const s = spendSummary();
  const budget = (state.plan?.settings || state.settings).budget;
  const over = s.week > budget;
  return `<div class="section-head"><h2>Spending</h2><button class="link" data-action="sub" data-tab="more" data-sub="spend">Details</button></div>
    <div class="card stack">
      <div class="split"><div><span class="muted" style="font-size:15px">Spent this week</span><div class="big-num" style="font-size:30px">${gbp(s.week)}</div></div>
      <span class="pill ${over ? 'bad' : 'good'}">${over ? gbp(s.week - budget) + ' over' : gbp(budget - s.week) + ' left'}</span></div>
      <div class="meter ${over ? 'over' : ''}"><i style="width:${Math.min(100, (s.week / budget) * 100)}%"></i></div>
      <button class="btn btn-gray btn-block" data-action="log-shop">${icon('plus')}Log a shop</button>
    </div>`;
}

/* ---------- Week ---------- */
function weekView() {
  const plan = state.plan, c = computed, s = plan.settings, store = STORES[s.store];
  const over = c.total > s.budget + 0.005, diff = Math.abs(s.budget - c.total);
  const today = dayIndex(plan);
  const meals = 7 * (1 + (plan.breakfasts ? 1 : 0) + (plan.lunches ? 1 : 0));
  const notices = [
    data.prices.sample ? `<div class="notice"><strong>Sample prices</strong>Real ${esc(store.name)} prices appear after the first price update runs.</div>` : '',
    !data.prices.sample && c.estimated ? `<div class="notice"><strong>Some prices are estimates</strong>Items marked est. weren't found at ${esc(store.name)} on the last price update.</div>` : '',
    over ? `<div class="notice warn"><strong>${gbp(diff)} over budget</strong>This is the cheapest week Basket could find. Try a bigger budget, more batch cooking, fewer meals per day or fewer filters.</div>` : '',
  ].filter(Boolean).join('<div class="spacer"></div>');

  const days = plan.dinners.map((d, i) => {
    const date = planDate(plan, i), r = data.recipe[d.r];
    if (!r) return '';
    const bf = breakfastFor(plan, i), ln = lunchFor(plan, i);
    const per = c.mealCost['d:' + r.id] / (c.ctx.servings * nightsOf(r));
    const rows = [];
    if (bf) rows.push(mealRow(bf, breakfastKind(plan, i), 'Breakfast'));
    if (ln) rows.push(mealRow(ln, 'l' + lunchSlot(i), 'Lunch'));
    rows.push(`<button class="row" data-action="open" data-recipe="${r.id}" data-kind="dinner">${tile(r)}<span class="row-main"><span class="row-title">${d.left ? 'Leftovers: ' : ''}${esc(r.name)}</span><span class="row-sub">${d.left ? 'Dinner · reheat' : `Dinner · ${timeText(r.mins)}${r.type === 'batch' ? ' · cook once, eat twice' : ''}`}</span></span>${d.left ? '' : `<span class="row-value num">${gbp(per)}</span>`}${icon('chev')}</button>`);
    return `<div class="section-label">${i === today ? '<span class="today-pill">Today</span> · ' : ''}${esc(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
      <div class="group tiles">${rows.join('')}</div>`;
  }).join('');

  return {
    title: 'This week',
    subtitle: `${esc(store.name)} · ${esc(peopleText(s))}`,
    right: { label: 'Edit', action: 'edit' },
    html: `
    <div class="card stack">
      <div class="split">
        <div><span class="muted" style="font-size:15px">Shopping total</span><div class="big-num">${gbp(c.total)}</div></div>
        <span class="pill ${over ? 'bad' : 'good'}">${over ? gbp(diff) + ' over' : gbp(diff) + ' left'}</span>
      </div>
      <div class="meter ${over ? 'over' : ''}"><i style="width:${Math.min(100, (c.total / s.budget) * 100)}%"></i></div>
      <div class="pills"><span class="pill">Budget ${gbp(s.budget)}</span><span class="pill">${meals} meals</span><span class="pill">${gbp(c.total / (c.ctx.servings * meals))} a portion</span>${c.ctx.loyaltyOn ? `<span class="pill">${esc(store.loyalty)} prices</span>` : ''}</div>
    </div>
    <div class="spacer"></div>
    <div class="actions">
      <button class="btn btn-filled" data-action="go" data-tab="list">${icon('cart')}Shopping list</button>
      <button class="btn btn-tinted" data-action="price-check">${icon('tag')}Price check</button>
      <button class="btn btn-tinted" data-action="shuffle">${icon('shuffle')}New meals</button>
      <button class="btn btn-tinted" data-action="save-week">${icon('bookmark')}${state.saved.some((p) => p.id === plan.id) ? 'Saved' : 'Save week'}</button>
    </div>
    ${notices ? `<div class="spacer"></div>${notices}` : ''}
    ${days}` };
}

function mealRow(r, kind, label) {
  return `<button class="row" data-action="open" data-recipe="${r.id}" data-kind="${kind}">${tile(r, 'md')}<span class="row-main"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${label} · ${timeText(r.mins)}</span></span>${icon('chev')}</button>`;
}

/* ---------- Setup ---------- */
function setupView() {
  const s = state.settings, store = STORES[s.store];
  const res = planSlots(s);
  const problem = !s.appliances.length ? 'Choose at least one appliance.'
    : res.error === 'dinner' ? 'Not enough dinners match these choices. Turn on another appliance, remove a filter, or bring back hidden meals in More.'
    : res.error === 'breakfast' ? 'Not enough breakfasts match these choices. Turn off breakfasts or remove a filter.'
    : res.error === 'lunch' ? 'Not enough lunches match these choices. Turn off lunches or remove a filter.' : '';
  const checkRows = (items, act, isOn) => items.map(([k, label, sub]) => `<button class="row" data-action="${act}" data-value="${k}" aria-pressed="${isOn(k)}"><span class="row-main"><span class="row-title">${esc(label)}</span>${sub ? `<span class="row-sub">${esc(sub)}</span>` : ''}</span>${icon('check')}</button>`).join('');
  const switchRows = (items, act, isOn) => items.map(([k, label]) => `<button class="row" role="switch" data-action="${act}" data-value="${k}" aria-checked="${isOn(k)}"><span class="row-main">${esc(label)}</span><span class="switch"></span></button>`).join('');
  return {
    title: state.plan ? 'Edit plan' : 'Plan your week',
    back: state.plan ? { label: 'Week', action: 'cancel-edit' } : null,
    html: `
    <div class="section-label">Supermarket</div>
    <div class="group">${checkRows(Object.entries(STORES).map(([k, v]) => [k, v.name]), 'store', (k) => s.store === k)}</div>
    ${store.loyalty ? `<div class="spacer"></div><div class="group">${switchRows([[s.store, `I have a ${store.loyalty}`]], 'loyalty', () => !!s.loyalty[s.store])}</div><div class="section-foot">Uses member prices where ${esc(store.name)} has them.</div>` : ''}

    <div class="section-label">Weekly budget</div>
    <div class="group"><label class="row"><span class="row-main">Budget</span><span class="field" style="flex:none;width:auto"><span class="muted">£</span><input id="budget" class="money-input num" inputmode="decimal" type="number" min="10" max="500" step="1" value="${s.budget}" aria-label="Weekly budget in pounds"></span></label></div>
    <div class="spacer"></div>
    <div class="chips wrap">${[30, 40, 50, 60, 80, 100, 120].map((v) => `<button class="chip" aria-pressed="${+s.budget === v}" data-action="budget" data-value="${v}">£${v}</button>`).join('')}</div>

    <div class="section-label">Household</div>
    <div class="group">
      ${stepperRow('adults', 'Adults and teens', s.adults, 1, 14)}
      ${stepperRow('children', 'Children under 12', s.children, 0, 10)}
    </div>
    <div class="section-foot">Children count as about two-thirds of a portion.</div>

    <div class="section-label">Meals to plan</div>
    <div class="group">
      <div class="row"><span class="row-main">Dinner</span><span class="row-value">Always</span></div>
      ${switchRows([['breakfast', 'Breakfast'], ['lunch', 'Lunch']], 'meal-type', (k) => !!s.meals[k])}
    </div>
    <div class="section-foot">Breakfasts repeat on weekdays with something nicer at the weekend. Lunches change every two or three days.</div>

    <div class="section-label">Kitchen</div>
    <div class="group">${switchRows(APPLIANCES, 'appliance', (k) => s.appliances.includes(k))}</div>

    <div class="section-label">Dietary needs</div>
    <div class="group">${checkRows(AVOID, 'avoid', (k) => s.avoid.includes(k))}</div>
    <div class="section-foot">Don't like a planned meal? Open it, tap Swap, and choose not to see it again.</div>

    <div class="section-label">Cooking style</div>
    <div class="group">${checkRows(STYLES.map(([v, t, d]) => [String(v), t, d]), 'batch', (k) => s.batch === +k)}</div>

    <div class="section-label">Budget style</div>
    <div class="segmented" role="group" aria-label="Budget style">
      <button aria-pressed="${s.mode === 'save'}" data-action="mode" data-value="save">Save a bit</button>
      <button aria-pressed="${s.mode === 'full'}" data-action="mode" data-value="full">Use it all</button>
    </div>
    <div class="section-foot" id="mode-foot">${s.mode === 'save' ? `Aims for about £${Math.round(s.budget * 0.88)} so you keep some change.` : `Gets as close to £${s.budget} as it can, with nicer meals.`}</div>

    <div class="section-label">Favourites</div>
    <div class="group">${switchRows([['fav', 'Include my favourites']], 'use-favs', () => !!s.useFavourites)}</div>
    <div class="section-foot">${state.favourites.length ? `Basket picks from your ${state.favourites.length} favourite${state.favourites.length === 1 ? '' : 's'} first when they fit the budget.` : 'Tap the heart on any meal to add it to your favourites.'}</div>

    ${problem ? `<div class="spacer-lg"></div><div class="notice warn">${esc(problem)}</div>` : ''}
    <div class="spacer-lg"></div>
    <button class="btn btn-filled btn-block" data-action="generate" ${problem ? 'disabled' : ''}>${state.plan ? 'Plan a new week' : 'Plan my week'}</button>` };
}

function stepperRow(key, label, value, min, max) {
  return `<div class="row"><span class="row-main">${label}</span><span class="row-value num" style="color:var(--label)">${value}</span>
    <span class="stepper"><button data-action="step" data-key="${key}" data-delta="-1" ${value <= min ? 'disabled' : ''} aria-label="Fewer ${label.toLowerCase()}">−</button><button data-action="step" data-key="${key}" data-delta="1" ${value >= max ? 'disabled' : ''} aria-label="More ${label.toLowerCase()}">+</button></span></div>`;
}

/* ---------- List ---------- */
function listView() {
  const extras = state.extras;
  const plan = state.plan, c = computed;
  const addBox = `
    <form class="group" data-form="add-item"><div class="row add-row"><span class="plus">${icon('plus-sm')}</span><span class="field"><input id="add-item" placeholder="Add an item" autocomplete="off" enterkeyhint="done" maxlength="60"></span></div></form>
    <div class="spacer"></div>
    <div class="chips">${QUICK_ADD.filter((n) => !extras.some((x) => x.name.toLowerCase() === n.toLowerCase() && !x.done)).map((n) => `<button class="chip add" data-action="quick-add" data-value="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  const extrasGroup = extras.length ? `
    <div class="section-head"><h2>Your items</h2>${state.regulars.length ? `<button class="link" data-action="add-regulars">Add regulars</button>` : ''}</div>
    <div class="group">${extras.map((x) => `
      <label class="row item ${x.done ? 'done' : ''}"><input type="checkbox" data-action="tick-extra" data-id="${x.id}" ${x.done ? 'checked' : ''}><span class="row-main"><span class="row-title">${esc(x.name)}</span></span>
      <button class="icon-btn" data-action="remove-extra" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">${icon('x')}</button></label>`).join('')}</div>` : '';

  if (!plan) {
    return { title: 'Shopping list', html: `${addBox}${extrasGroup}
      <div class="empty"><span class="tile s-lg t-veg" aria-hidden="true">🧺</span><h2>No meals planned yet</h2><p>Plan your week and every ingredient appears here, grouped by aisle with prices.</p><button class="btn btn-filled" data-action="go" data-tab="week">Plan my week</button></div>` };
  }
  const s = plan.settings, store = STORES[s.store];
  const buy = c.lines.filter((l) => !l.have && !l.missing);
  const done = buy.filter((l) => plan.checked[l.key]).length;
  const groups = data.aisles.map((a) => [a, buy.filter((l) => l.ing.aisle === a)]).filter(([, ls]) => ls.length);
  const have = c.lines.filter((l) => l.have);
  return {
    title: 'Shopping list',
    subtitle: `${esc(store.name)} · ${buy.length} items · ${gbp(c.total)}`,
    right: done || extras.some((x) => x.done) ? { label: 'Untick all', action: 'untick' } : null,
    html: `${addBox}
    <div class="spacer"></div>
    <div class="card stack">
      <div class="split"><div><span class="muted" style="font-size:15px">${done} of ${buy.length} in the trolley</span><div class="big-num" style="font-size:30px">${gbp(c.total)}</div></div>
      <span class="pill">${esc(store.name)}${c.ctx.loyaltyOn ? ' · ' + esc(store.loyalty) : ''}</span></div>
      <div class="meter"><i id="list-progress" style="width:${buy.length ? (done / buy.length) * 100 : 0}%"></i></div>
      <div class="actions"><button class="btn btn-tinted" data-action="share">${icon('share')}Share</button><button class="btn btn-tinted" data-action="price-check">${icon('tag')}Price check</button></div>
      <button class="btn btn-gray btn-block" data-action="log-shop" data-prefill="1">${icon('plus')}Log this shop</button>
    </div>
    ${extrasGroup}
    ${groups.map(([aisle, ls]) => `
      <div class="section-head"><h2>${esc(aisle)}</h2><span class="aside num">${gbp(ls.reduce((a, l) => a + l.cost, 0))}</span></div>
      <div class="group">${ls.map((l) => {
        const on = !!plan.checked[l.key];
        return `<label class="row item ${on ? 'done' : ''}"><input type="checkbox" data-action="tick" data-key="${l.key}" ${on ? 'checked' : ''}>
          <span class="row-main"><span class="row-title">${esc(l.p.n)}${l.p.est ? '<span class="est">est.</span>' : ''}</span><span class="row-sub">${esc(l.usedIn.join(', '))}</span></span>
          <span class="row-value num strong">${gbp(l.cost)}${l.packs > 1 ? `<small class="muted">${l.packs} × ${gbp(l.unit)}</small>` : l.loyalty ? `<small class="muted">${esc(store.loyalty)}</small>` : ''}</span></label>`;
      }).join('')}</div>`).join('')}
    ${have.length ? `<div class="section-foot" style="padding-top:14px">Left off because they're in your cupboard: ${esc(have.map((l) => l.ing.name.toLowerCase()).join(', '))}.</div>` : ''}
    <div class="section-foot" style="padding-top:10px">You'll also need salt, pepper and cooking oil. About ${gbp(c.spare)} of this shop is left over in part-used packs for next week.</div>`,
    after: () => { if (state.focusAdd) { $('#add-item')?.focus(); state.focusAdd = false; } },
  };
}

/* ---------- Meals ---------- */
function mealsView() {
  const f = state.mealsFilter;
  const kinds = [['all', 'All'], ['fav', 'Favourites'], ['dinner', 'Dinners'], ['breakfast', 'Breakfasts'], ['lunch', 'Lunches'], ['quick', 'Under 30 min'], ['batch', 'Batch cook'], ['veg', 'Vegetarian']];
  return {
    title: 'Meals',
    subtitle: `${data.recipes.length} recipes · ${state.favourites.length} favourite${state.favourites.length === 1 ? '' : 's'}`,
    html: `
    <div class="search">${icon('search')}<input id="meal-search" type="search" placeholder="Search meals" value="${esc(f.q)}" autocomplete="off" aria-label="Search meals"></div>
    <div class="spacer"></div>
    <div class="chips">${kinds.map(([k, l]) => `<button class="chip" aria-pressed="${f.kind === k}" data-action="meal-kind" data-value="${k}">${l}</button>`).join('')}</div>
    <div class="spacer"></div>
    <div id="meal-results">${mealResults()}</div>` };
}
function mealResults() {
  const f = state.mealsFilter, q = f.q.trim().toLowerCase();
  const list = data.recipes.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.ing.some(([k]) => data.ing[k]?.name.toLowerCase().includes(q))) return false;
    if (f.kind === 'fav') return isFav(r.id);
    if (['dinner', 'breakfast', 'lunch'].includes(f.kind)) return mealOf(r) === f.kind;
    if (f.kind === 'quick') return r.mins <= 30;
    if (f.kind === 'batch') return r.type === 'batch';
    if (f.kind === 'veg') return r.protein === 'veg';
    return true;
  }).sort((a, b) => (isFav(b.id) - isFav(a.id)) || a.name.localeCompare(b.name));
  if (!list.length) {
    return f.kind === 'fav' && !q
      ? `<div class="empty"><span class="tile s-lg t-pork" aria-hidden="true">❤️</span><h2>No favourites yet</h2><p>Tap the heart on any meal. Favourites are picked first when Basket plans your week.</p></div>`
      : `<div class="empty"><h2>No meals found</h2><p>Try a different word or filter.</p></div>`;
  }
  return `<div class="group tiles">${list.map((r) => `
    <div class="row tap" data-action="open" data-recipe="${r.id}" data-kind="browse" role="button" tabindex="0">${tile(r)}
      <span class="row-main"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${capital(mealOf(r))} · ${timeText(r.mins)}${r.type === 'batch' ? ' · batch' : ''}${state.hidden.includes(r.id) ? ' · hidden' : ''}</span></span>
      <button class="heart" data-action="fav" data-id="${r.id}" aria-pressed="${isFav(r.id)}" aria-label="${isFav(r.id) ? 'Remove from' : 'Add to'} favourites">${icon(isFav(r.id) ? 'heart-fill' : 'heart')}</button>
    </div>`).join('')}</div>`;
}

/* ---------- More ---------- */
function moreView() {
  const s = spendSummary();
  const rows = [
    ['saved', 'Saved weeks', 'bookmark', 'var(--i-blue)', state.saved.length || ''],
    ['spend', 'Spending', 'chart', 'var(--i-green)', s.week ? gbp(s.week) + ' this week' : ''],
    ['regulars', 'Regular items', 'repeat', 'var(--i-orange)', state.regulars.length || ''],
    ['cupboard', 'In my cupboard', 'box', 'var(--i-indigo)', state.cupboard.length || ''],
    ['hidden', 'Hidden meals', 'eye-off', 'var(--i-gray)', state.hidden.length || ''],
    ['prices', 'Prices', 'tag', 'var(--i-teal)', data.prices.sample ? 'Sample' : 'Updated ' + fmtDate(data.prices.updated)],
  ];
  return {
    title: 'More',
    html: `
    <div class="group">${rows.slice(0, 3).map(moreRow).join('')}</div>
    <div class="spacer-lg"></div>
    <div class="group">${rows.slice(3).map(moreRow).join('')}</div>
    <div class="spacer-lg"></div>
    <div class="group"><button class="row destructive" data-action="reset">Clear all data</button></div>
    <div class="section-foot">Removes your settings, plans, lists and spending from this phone.</div>` };
}
function moreRow([sub, label, ic, color, value]) {
  return `<button class="row" data-action="sub" data-tab="more" data-sub="${sub}"><span class="icon-sq" style="background:${color}">${icon(ic)}</span><span class="row-main">${label}</span>${value !== '' ? `<span class="row-value num">${esc(String(value))}</span>` : ''}${icon('chev')}</button>`;
}
const backToMore = { label: 'More', action: 'back' };

function savedView() {
  return {
    title: 'Saved weeks', back: backToMore,
    html: state.saved.length ? `<div class="group tiles">${state.saved.map((p) => {
      const rs = planEntries(p).filter((e) => e.kind === 'dinner').map((e) => e.r);
      return `<div class="row"><span class="tile s-md t-${rs[0] ? tileClass(rs[0]) : 'veg'}" aria-hidden="true">${rs[0]?.emoji || '🧺'}</span>
        <span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(rs.map((r) => r.name).slice(0, 3).join(', '))}${rs.length > 3 ? '…' : ''}</span>
        <span style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-tinted btn-sm" data-action="open-saved" data-id="${p.id}">Use this week</button><button class="btn btn-gray btn-sm" data-action="delete-saved" data-id="${p.id}">Delete</button></span></span></div>`;
    }).join('')}</div><div class="section-foot">Prices are worked out again when you use a saved week.</div>`
      : `<div class="empty"><span class="tile s-lg t-fish" aria-hidden="true">📌</span><h2>No saved weeks</h2><p>When you like a week, tap Save week on the Week tab to keep it here.</p></div>` };
}

function spendView() {
  const s = spendSummary();
  const budget = (state.plan?.settings || state.settings).budget;
  const max = Math.max(budget * 1.15, ...s.weeks.map((w) => w.total));
  const draft = state.spendDraft || { amount: '', store: (state.plan?.settings || state.settings).store, date: todayISO() };
  const entries = [...state.spend].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 30);
  return {
    title: 'Spending', back: backToMore,
    html: `
    <div class="stat-grid">
      <div class="stat"><span>This week</span><strong>${gbp(s.week)}</strong></div>
      <div class="stat"><span>This month</span><strong>${gbp(s.month)}</strong></div>
      <div class="stat"><span>Avg a week</span><strong>${gbp(s.avg)}</strong></div>
    </div>
    <div class="section-label">Last 8 weeks · dashed line is your ${gbp(budget)} budget</div>
    <div class="card"><div class="bars">
      <div class="line" style="bottom:${(budget / max) * 100}%"></div>
      ${s.weeks.map((w) => `<div class="bar ${w.total > budget ? 'over' : ''} ${w.total ? '' : 'empty'}"><i style="height:${Math.max(2, (w.total / max) * 96)}px" title="${gbp(w.total)}"></i><span>${w.start.getDate()}/${w.start.getMonth() + 1}</span></div>`).join('')}
    </div></div>

    <div class="section-label">Log a shop</div>
    <form class="group" data-form="log-spend">
      <label class="row"><span class="row-main">Amount</span><span class="field" style="flex:none;width:auto"><span class="muted">£</span><input id="spend-amount" class="money-input num" type="number" inputmode="decimal" step="0.01" min="0.01" max="2000" placeholder="0.00" value="${esc(draft.amount)}" required></span></label>
      <label class="row"><span class="row-main">Shop</span><span class="field" style="flex:none;width:auto"><select id="spend-store" style="text-align:right">${[...Object.entries(STORES).map(([k, v]) => [k, v.name]), ['other', 'Other']].map(([k, n]) => `<option value="${k}" ${draft.store === k ? 'selected' : ''}>${n}</option>`).join('')}</select></span></label>
      <label class="row"><span class="row-main">Date</span><span class="field" style="flex:none;width:auto"><input id="spend-date" type="date" value="${esc(draft.date)}" max="${todayISO()}" style="text-align:right"></span></label>
      <button class="row accent" type="submit" style="justify-content:center;font-weight:600">Add to spending</button>
    </form>

    ${entries.length ? `<div class="section-label">History</div><div class="group">${entries.map((e) => `
      <div class="row"><span class="row-main"><span class="row-title">${esc(STORES[e.store]?.name || 'Other')}</span><span class="row-sub">${esc(fmtDate(parseISO(e.date), { weekday: 'short', day: 'numeric', month: 'short' }))}</span></span>
      <span class="row-value num strong">${gbp(e.amount)}</span><button class="icon-btn" data-action="delete-spend" data-id="${e.id}" aria-label="Delete">${icon('x')}</button></div>`).join('')}</div>` : '<div class="section-foot" style="padding-top:12px">Add what you pay at the till to see how your real spending compares with your budget.</div>'}`,
    after: () => { if (state.spendDraft?.focus) { $('#spend-amount')?.focus(); state.spendDraft.focus = false; } },
  };
}

function regularsView() {
  return {
    title: 'Regular items', back: backToMore,
    html: `
    <form class="group" data-form="add-regular"><div class="row add-row"><span class="plus">${icon('plus-sm')}</span><span class="field"><input id="add-regular" placeholder="Add a regular item" autocomplete="off" enterkeyhint="done" maxlength="60"></span></div></form>
    <div class="section-foot">Regular items go on your shopping list automatically every time you plan a new week.</div>
    ${state.regulars.length ? `<div class="section-label">Your regulars · ${state.regulars.length}</div><div class="group">${state.regulars.map((n, i) => `<div class="row"><span class="row-main">${esc(n)}</span><button class="icon-btn" data-action="remove-regular" data-index="${i}" aria-label="Remove ${esc(n)}">${icon('x')}</button></div>`).join('')}</div>
    <div class="spacer"></div><button class="btn btn-tinted btn-block" data-action="add-regulars">Add all to this week's list</button>` : ''}
    ${REGULAR_GROUPS.map(([title, items]) => {
      const left = items.filter((n) => !state.regulars.some((r) => r.toLowerCase() === n.toLowerCase()));
      return left.length ? `<div class="section-label">${esc(title)}</div><div class="chips wrap">${left.map((n) => `<button class="chip add" data-action="quick-regular" data-value="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '';
    }).join('')}
    <div class="section-foot" style="padding-top:14px">Tap an item to add it to your regulars. Tap the cross to remove one.</div>`,
    after: () => { if (state.focusAdd) { $('#add-regular')?.focus(); state.focusAdd = false; } },
  };
}

function cupboardView() {
  return {
    title: 'In my cupboard', back: backToMore,
    html: `<div class="section-foot" style="padding:0 16px 10px">Turn on anything you already have. It stays off your shopping list. Salt, pepper and cooking oil are always assumed.</div>
    <div class="group">${CUPBOARD.map((k) => `<button class="row" role="switch" data-action="cupboard" data-value="${k}" aria-checked="${state.cupboard.includes(k)}"><span class="row-main">${esc(data.ing[k].name)}</span><span class="switch"></span></button>`).join('')}</div>` };
}

function hiddenView() {
  const hidden = state.hidden.map((id) => data.recipe[id]).filter(Boolean);
  return {
    title: 'Hidden meals', back: backToMore,
    html: hidden.length ? `<div class="group tiles">${hidden.map((r) => `<div class="row">${tile(r)}<span class="row-main">${esc(r.name)}</span><button class="btn btn-tinted btn-sm" data-action="unhide" data-id="${r.id}">Bring back</button></div>`).join('')}</div>`
      : `<div class="empty"><h2>No hidden meals</h2><p>Meals you hide when swapping appear here, so you can bring them back.</p></div>` };
}

function pricesView() {
  const p = data.prices;
  return {
    title: 'Prices', back: backToMore,
    html: `${p.sample ? '<div class="notice">Basket is using sample prices until the first price update runs.</div>' : `
    <div class="group">${Object.entries(STORES).map(([k, v]) => {
      const st = p.status?.[k];
      return `<div class="row"><span class="row-main"><span class="row-title">${esc(v.name)}</span><span class="row-sub">${st ? `Updated ${fmtDate(st.updated)}${st.kept ? ', last good update' : ''}` : 'No data'}</span></span><span class="row-value num">${st ? `${st.ingredients} of ${data.ingredients.length}` : '–'}</span></div>`;
    }).join('')}</div>`}
    <div class="section-foot">Basket prices the ${data.ingredients.length} ingredients its recipes use, not a supermarket's whole range. Anything not found uses an estimate, marked est. Prices are each supermarket's standard online price, so your local store may differ a little. They update once a month.</div>` };
}

/* ---------- sheets ---------- */
const sheet = $('#sheet'), backdrop = $('#backdrop');
let lastFocus = null;
function openSheet(title, html) {
  lastFocus = document.activeElement;
  sheet.innerHTML = `<div class="sheet-bar"><span class="grab"></span><span></span><span class="ttl">${esc(title)}</span><button class="done" data-action="close">Done</button></div><div class="sheet-scroll">${html}</div>`;
  sheet.hidden = false; backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); $('.done', sheet).focus({ preventScroll: true }); });
}
function closeSheet() {
  sheet.classList.remove('open'); backdrop.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { if (!sheet.classList.contains('open')) { sheet.hidden = true; backdrop.hidden = true; sheet.innerHTML = ''; } }, 320);
  lastFocus?.focus?.({ preventScroll: true });
}

function recipeSheet(id, kind) {
  const r = data.recipe[id];
  const plan = state.plan;
  const entry = plan && kind !== 'browse' ? computed.entries.find((e) => e.r.id === id && e.kind === kind) : null;
  let rows, cost, servings, n;
  if (entry) {
    const c = computed; servings = c.ctx.servings; n = entry.n;
    rows = r.ing.map(([k, per]) => {
      const q = per * servings * n, ing = data.ing[k], l = c.lineBy[k];
      const share = l && l.bought ? (q / l.bought) * l.cost : 0;
      return { ing, q, l, share, shared: l && l.usedIn.length > 1 };
    });
    cost = c.mealCost[entry.key];
  } else {
    const ctx = makeCtx(plan ? plan.settings : state.settings); servings = ctx.servings;
    n = mealOf(r) === 'dinner' ? nightsOf(r) : 1;
    rows = r.ing.map(([k, per]) => { const q = per * servings * n, l = ctx.buy(k, q); return { ing: data.ing[k], q, l, share: l.bought ? (q / l.bought) * l.cost : 0 }; });
    cost = rows.reduce((a, x) => a + (x.l.cost || 0), 0);
  }
  const portions = servings * n;
  const serveText = mealOf(r) === 'dinner' ? (n > 1 ? `Serves ${fmtNum(nice(servings))}, two nights` : `Serves ${fmtNum(nice(servings))}`) : `${fmtNum(nice(servings))} × ${n} day${n === 1 ? '' : 's'}`;
  const ingRows = rows.map(({ ing, q, l, share, shared }) => {
    const from = l?.have ? 'From your cupboard' : l?.p ? l.p.n + (l.packs > 1 ? ` · ${l.packs} packs` : '') : '';
    return `<div class="row"><span class="row-main"><span class="row-title">${esc(capital(fmtAmount(ing, q)))}</span><span class="row-sub">${esc(from)}${l?.p?.est ? '<span class="est">est.</span>' : ''}</span></span>${l?.p ? `<span class="row-value num">${gbp(share)}${shared ? '<small class="muted" style="display:block;font-size:12px;text-align:right">shared</small>' : ''}</span>` : ''}</div>`;
  }).join('');
  const steps = r.steps.map((t) => `<li><span>${esc(t)}</span></li>`).join('')
    + (mealOf(r) === 'dinner' && r.type === 'batch' ? `<li class="tip-step"><span>Leftovers: cool within 2 hours, keep covered in the fridge and reheat until piping hot the next day.</span></li>` : '');
  const costLine = entry ? `${gbp(cost)} · ${gbp(cost / portions)} a portion` : `About ${gbp(cost)} in whole packs`;
  openSheet(capital(mealOf(r)), `
    <div class="recipe-head">
      <div class="top">${tile(r, 'xl')}<button class="heart" data-action="fav" data-id="${r.id}" aria-pressed="${isFav(r.id)}" aria-label="Favourite" style="width:44px;height:44px;background:var(--card)">${icon(isFav(r.id) ? 'heart-fill' : 'heart')}</button></div>
      <h2>${esc(r.name)}</h2>
      <div class="pills"><span class="pill">${timeText(r.mins)}</span><span class="pill">${serveText}</span><span class="pill good">${costLine}</span></div>
    </div>
    <div class="section-label">Ingredients</div>
    <div class="group">${ingRows}</div>
    <div class="section-foot">Plus salt, pepper and cooking oil.${n > 1 ? ` Amounts cover ${mealOf(r) === 'dinner' ? 'both nights' : `all ${n} days`}.` : ''}</div>
    <div class="section-label">Method</div>
    <div class="group"><ol class="steps">${steps}</ol></div>
    <div class="spacer-lg"></div>
    ${entry ? `<button class="btn btn-tinted btn-block" data-action="swap" data-recipe="${r.id}" data-kind="${kind}">${icon('swap')}Swap this meal</button>` : ''}
    ${state.hidden.includes(r.id) ? `<div class="spacer"></div><button class="btn btn-gray btn-block" data-action="unhide" data-id="${r.id}">Bring back into plans</button>` : ''}`);
}

function swapSheet(id, kind) {
  const r = data.recipe[id];
  const opts = swapOptions(state.plan, kind, id);
  const budget = state.plan.settings.budget;
  const list = opts.length ? `<div class="group tiles">${opts.map((o) => {
    const d = Math.round(o.delta * 100) / 100;
    return `<button class="row" data-action="do-swap" data-from="${id}" data-to="${o.r.id}" data-kind="${kind}">${tile(o.r)}
      <span class="row-main"><span class="row-title">${esc(o.r.name)}${isFav(o.r.id) ? ' <span style="color:var(--red)">♥</span>' : ''}</span><span class="row-sub">${timeText(o.r.mins)}${o.cost > budget + 0.005 ? ' · over budget' : ''}</span></span>
      <span class="row-value num" style="color:${d > 0 ? 'var(--red)' : d < 0 ? 'var(--accent)' : 'var(--label-2)'};font-weight:600">${d === 0 ? 'Same' : (d > 0 ? '+' : '−') + gbp(Math.abs(d))}</span></button>`;
  }).join('')}</div>` : `<div class="notice">No other meals of this type fit your settings.</div>`;
  openSheet('Swap meal', `
    <div class="recipe-head"><h2 style="font-size:24px">Instead of ${esc(r.name)}</h2><p class="muted">Your week costs ${gbp(computed.total)}. Each option shows how the total changes.</p></div>
    <div class="spacer"></div>${list}
    <div class="spacer"></div>
    <div class="group"><button class="row" role="switch" id="hide-meal" aria-checked="false" data-action="toggle-hide"><span class="row-main">Don't suggest ${esc(r.name)} again</span><span class="switch"></span></button></div>`);
}

function priceSheet() {
  const res = priceCheck(state.plan);
  const current = state.plan.settings.store;
  const cheapest = res[0];
  openSheet('Price check', `
    <div class="recipe-head"><h2 style="font-size:24px">This week's shop at each supermarket</h2><p class="muted">Same meals, same amounts, each supermarket's best-value products.</p></div>
    <div class="spacer"></div>
    <div class="group">${res.map((x) => `
      <button class="row" data-action="switch-store" data-value="${x.store}" ${x.store === current ? 'aria-pressed="true"' : ''}>
        <span class="row-main"><span class="row-title">${esc(STORES[x.store].name)}${x === cheapest ? ' <span class="pill good" style="height:22px;margin-left:6px">Cheapest</span>' : ''}</span>
        <span class="row-sub">${x.store === current ? 'Your current shop' : `${x.cost < computed.total ? 'Save ' + gbp(computed.total - x.cost) : gbp(x.cost - computed.total) + ' more'}`}${x.loyaltyOn ? ' · member prices' : ''}${x.est ? ` · ${x.est} estimated` : ''}</span></span>
        <span class="row-value num strong">${gbp(x.cost)}</span>${x.store === current ? icon('check') : icon('chev')}</button>`).join('')}</div>
    <div class="section-foot">Tap a supermarket to switch your list to it. Your meals stay the same.</div>`);
}

/* ---------- icons ---------- */
function icon(name) {
  const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const F = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
  switch (name) {
    case 'tab-today': return S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4"/>');
    case 'tab-week': return S('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
    case 'tab-list': return S('<path d="M4 9h16l-1.6 9.2A2 2 0 0 1 16.4 20H7.6a2 2 0 0 1-2-1.8z"/><path d="M8 9c0-2.8 1.8-5 4-5s4 2.2 4 5"/>');
    case 'tab-meals': return S('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3.5 3.5-3.5 7v3H17"/>');
    case 'tab-more': return S('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>');
    case 'back': return `<svg viewBox="0 0 13 22" aria-hidden="true"><path d="M11 2 2 11l9 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'chev': return `<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="m1 1 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'check': return `<svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'heart': return S('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>');
    case 'heart-fill': return F('<path d="M12 20.5s-8-4.8-8-10.7a4.7 4.7 0 0 1 8-3.2 4.7 4.7 0 0 1 8 3.2c0 5.9-8 10.7-8 10.7z"/>');
    case 'cart': return S('<path d="M4 9h16l-1.6 9.2A2 2 0 0 1 16.4 20H7.6a2 2 0 0 1-2-1.8z"/><path d="M8 9c0-2.8 1.8-5 4-5s4 2.2 4 5"/>');
    case 'tag': return S('<path d="M3 12.6V4a1 1 0 0 1 1-1h8.6L21 11.4 12.4 20z"/><circle cx="8" cy="8" r="1.5"/>');
    case 'shuffle': return S('<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M15 7h5m0 0-2.5-2.5M20 7l-2.5 2.5M20 17l-2.5-2.5M20 17l-2.5 2.5"/>');
    case 'bookmark': return S('<path d="M6 4h12v16l-6-4-6 4z"/>');
    case 'share': return S('<path d="M12 4v11M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>');
    case 'swap': return S('<path d="M7 7h11l-3-3M17 17H6l3 3"/>');
    case 'plus': return S('<path d="M12 5v14M5 12h14"/>');
    case 'plus-sm': return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
    case 'x': return S('<path d="M6 6l12 12M18 6 6 18"/>');
    case 'search': return S('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>');
    case 'chart': return S('<path d="M5 20V11M12 20V5M19 20v-7"/>', 'stroke-width="2.6"');
    case 'repeat': return S('<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>');
    case 'box': return S('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>');
    case 'eye-off': return S('<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.4 3M6.4 7.6C4.2 9.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 3.6-.8M9.9 10a3 3 0 0 0 4.2 4.1"/>');
    case 'clock': return S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');
    default: return '';
  }
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= actions ================= */
function refresh() { computed = state.plan ? computePlan(state.plan) : null; render(); }
const setSetting = (k, v) => { state.settings[k] = v; save('settings'); render(); };
const toggleIn = (list, v) => { const i = list.indexOf(v); if (i > -1) list.splice(i, 1); else list.push(v); };
const clampBudget = (v) => Math.max(10, Math.min(500, Math.round(+v || DEFAULTS.budget)));
const goTab = (tab, sub = null) => { state.tab = tab; state.sub = sub; render(); window.scrollTo(0, 0); };

function confirmTap(el, label) {
  if (el.dataset.armed === '1') return true;
  const original = el.innerHTML;
  el.dataset.armed = '1'; el.textContent = label; el.classList.add('confirming');
  setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.innerHTML = original; el.classList.remove('confirming'); } }, 3000);
  return false;
}

function addExtra(name) {
  const n = name.trim();
  if (!n) return false;
  if (state.extras.some((x) => x.name.toLowerCase() === n.toLowerCase() && !x.done)) return false;
  state.extras.push({ id: uid(), name: n, done: false });
  return true;
}
function addRegularsToList() {
  let added = 0;
  for (const n of state.regulars) if (addExtra(n)) added++;
  save('extras');
  return added;
}
function startNewPlan(plan) {
  state.plan = plan;
  state.extras = state.extras.filter((x) => !x.done);
  addRegularsToList();
  save('plan'); save('extras');
}

function doGenerate() {
  state.settings.budget = clampBudget(state.settings.budget); save('settings');
  const btn = $('[data-action="generate"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Planning your week…'; }
  setTimeout(() => {
    const result = generatePlan(state.settings);
    if (result.error) { toast('Not enough meals fit those choices'); render(); return; }
    startNewPlan(result); state.sub = null;
    refresh(); window.scrollTo(0, 0);
  }, 30);
}

function shareText() {
  const c = computed, plan = state.plan, s = plan.settings;
  const out = [`Shopping list · ${STORES[s.store].name} · ${gbp(c.total)}`];
  const extras = state.extras.filter((x) => !x.done);
  if (extras.length) { out.push('', 'Extras'); extras.forEach((x) => out.push(`• ${x.name}`)); }
  for (const a of data.aisles) {
    const ls = c.lines.filter((l) => !l.have && !l.missing && l.ing.aisle === a);
    if (!ls.length) continue;
    out.push('', a);
    for (const l of ls) out.push(`${plan.checked[l.key] ? '✓' : '•'} ${l.p.n}${l.packs > 1 ? ` (×${l.packs})` : ''} ${gbp(l.cost)}`);
  }
  out.push('', 'Meals');
  plan.dinners.forEach((d, i) => out.push(`${DAY_NAMES[planDate(plan, i).getDay()]}: ${d.left ? 'Leftovers, ' : ''}${data.recipe[d.r].name}`));
  return out.join('\n');
}

const actions = {
  go: (el) => goTab(el.dataset.tab),
  sub: (el) => goTab(el.dataset.tab, el.dataset.sub),
  back: () => goTab('more'),
  store: (el) => setSetting('store', el.dataset.value),
  loyalty: () => { state.settings.loyalty[state.settings.store] = !state.settings.loyalty[state.settings.store]; save('settings'); render(); },
  budget: (el) => setSetting('budget', +el.dataset.value),
  step: (el) => { const k = el.dataset.key; setSetting(k, Math.max(0, state.settings[k] + +el.dataset.delta)); },
  'meal-type': (el) => { state.settings.meals[el.dataset.value] = !state.settings.meals[el.dataset.value]; save('settings'); render(); },
  appliance: (el) => { toggleIn(state.settings.appliances, el.dataset.value); save('settings'); render(); },
  avoid: (el) => { toggleIn(state.settings.avoid, el.dataset.value); save('settings'); render(); },
  batch: (el) => setSetting('batch', +el.dataset.value),
  mode: (el) => setSetting('mode', el.dataset.value),
  'use-favs': () => setSetting('useFavourites', !state.settings.useFavourites),
  generate: doGenerate,
  shuffle: () => {
    const settings = state.plan ? state.plan.settings : state.settings;
    const p = generatePlan(settings);
    if (p.error) { toast('Not enough meals fit those choices'); return; }
    startNewPlan(p); refresh(); toast('New meals planned');
  },
  edit: () => { state.settings = normaliseSettings(clone(state.plan.settings)); save('settings'); state.tab = 'week'; state.sub = 'setup'; render(); window.scrollTo(0, 0); },
  'cancel-edit': () => { state.sub = null; render(); window.scrollTo(0, 0); },
  open: (el) => recipeSheet(el.dataset.recipe, el.dataset.kind),
  swap: (el) => swapSheet(el.dataset.recipe, el.dataset.kind),
  'toggle-hide': (el) => el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'),
  'do-swap': (el) => {
    const { from, to, kind } = el.dataset;
    if ($('#hide-meal')?.getAttribute('aria-checked') === 'true' && !state.hidden.includes(from)) { state.hidden.push(from); save('hidden'); }
    applySwap(state.plan, kind, from, to);
    save('plan'); closeSheet(); refresh(); toast(`Swapped in ${data.recipe[to].name}`);
  },
  fav: (el) => {
    const id = el.dataset.id; toggleIn(state.favourites, id); save('favourites');
    const on = isFav(id);
    document.querySelectorAll(`[data-action="fav"][data-id="${id}"]`).forEach((b) => { b.setAttribute('aria-pressed', on); b.innerHTML = icon(on ? 'heart-fill' : 'heart'); });
    toast(on ? 'Added to favourites' : 'Removed from favourites');
    if (state.tab === 'meals' && state.mealsFilter.kind === 'fav') $('#meal-results').innerHTML = mealResults();
  },
  close: closeSheet,
  'price-check': () => { if (state.plan) priceSheet(); },
  'switch-store': (el) => {
    const store = el.dataset.value;
    if (store !== state.plan.settings.store) { state.plan.settings.store = store; state.settings.store = store; save('plan'); save('settings'); refresh(); toast(`List switched to ${STORES[store].name}`); }
    closeSheet();
  },
  'save-week': () => {
    const plan = state.plan;
    const i = state.saved.findIndex((p) => p.id === plan.id);
    const copy = { ...clone(plan), name: `Week of ${fmtDate(parseISO(plan.start))} · ${STORES[plan.settings.store].name}`, savedTotal: computed.total };
    if (i > -1) state.saved[i] = copy; else state.saved.unshift(copy);
    save('saved'); render(); toast(i > -1 ? 'Saved week updated' : 'Week saved');
  },
  'open-saved': (el) => {
    const p = state.saved.find((x) => x.id === el.dataset.id);
    const plan = { ...clone(p), id: uid(), start: todayISO(), created: new Date().toISOString(), checked: {} };
    delete plan.name; delete plan.savedTotal;
    plan.dinners = arrange(planEntries(p).filter((e) => e.kind === 'dinner').map((e) => e.r), plan.start);
    state.settings = normaliseSettings(clone(p.settings)); save('settings');
    startNewPlan(plan); state.tab = 'week'; state.sub = null; refresh(); window.scrollTo(0, 0); toast('Saved week loaded');
  },
  'delete-saved': (el) => { if (!confirmTap(el, 'Tap to delete')) return; state.saved = state.saved.filter((x) => x.id !== el.dataset.id); save('saved'); render(); },
  share: async () => {
    const text = shareText();
    if (navigator.share) {
      try { await navigator.share({ title: 'Shopping list', text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('List copied'); } catch { toast("Couldn't copy the list on this device"); }
  },
  untick: () => { if (state.plan) { state.plan.checked = {}; save('plan'); } state.extras.forEach((x) => { x.done = false; }); save('extras'); render(); },
  'quick-add': (el) => { if (addExtra(el.dataset.value)) { save('extras'); render(); toast(`${el.dataset.value} added`); } },
  'remove-extra': (el) => { state.extras = state.extras.filter((x) => x.id !== el.dataset.id); save('extras'); render(); },
  'add-regulars': () => { const n = addRegularsToList(); render(); toast(n ? `${n} regular item${n === 1 ? '' : 's'} added` : 'Your regulars are already on the list'); },
  'quick-regular': (el) => { if (!state.regulars.some((r) => r.toLowerCase() === el.dataset.value.toLowerCase())) { state.regulars.push(el.dataset.value); save('regulars'); render(); toast(`${el.dataset.value} added`); } },
  'remove-regular': (el) => { state.regulars.splice(+el.dataset.index, 1); save('regulars'); render(); },
  cupboard: (el) => { toggleIn(state.cupboard, el.dataset.value); save('cupboard'); refresh(); },
  unhide: (el) => { state.hidden = state.hidden.filter((x) => x !== el.dataset.id); save('hidden'); if (!sheet.hidden) closeSheet(); render(); toast('Meal brought back'); },
  'meal-kind': (el) => { state.mealsFilter.kind = el.dataset.value; render(); },
  'log-shop': (el) => {
    const prefill = el.dataset.prefill && computed;
    state.spendDraft = { amount: prefill ? computed.total.toFixed(2) : '', store: (state.plan?.settings || state.settings).store, date: todayISO(), focus: !prefill };
    goTab('more', 'spend');
    setTimeout(() => { const f = $('[data-form="log-spend"]'); f?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
  },
  'delete-spend': (el) => { state.spend = state.spend.filter((x) => x.id !== el.dataset.id); save('spend'); render(); },
  reset: (el) => {
    if (!confirmTap(el, 'Tap again to clear everything')) return;
    KEYS.forEach((k) => Storage.remove(k));
    Object.assign(state, { settings: clone(DEFAULTS), plan: null, saved: [], hidden: [], cupboard: [], favourites: [], regulars: [], extras: [], spend: [], tab: 'today', sub: null });
    refresh(); toast('All data cleared');
  },
  reload: () => location.reload(),
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) { goTab(tab.dataset.tab); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  if (a === 'tick' || a === 'tick-extra') return; // handled by change
  const fn = actions[a];
  if (fn) { e.preventDefault(); e.stopPropagation(); fn(el); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.row.tap[data-action]')) { e.preventDefault(); actions[e.target.dataset.action]?.(e.target); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.action === 'tick') {
    state.plan.checked[el.dataset.key] = el.checked; save('plan');
    el.closest('.item').classList.toggle('done', el.checked);
    updateListProgress();
  }
  if (el.dataset?.action === 'tick-extra') {
    const x = state.extras.find((i) => i.id === el.dataset.id); if (x) x.done = el.checked; save('extras');
    el.closest('.item').classList.toggle('done', el.checked);
    renderTabbar();
  }
  if (el.id === 'budget') { const v = clampBudget(el.value); el.value = v; state.settings.budget = v; save('settings'); syncBudgetUI(); }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'budget') { const v = +el.value; if (v >= 1) { state.settings.budget = Math.min(500, Math.round(v)); save('settings'); syncBudgetUI(); } }
  if (el.id === 'meal-search') { state.mealsFilter.q = el.value; $('#meal-results').innerHTML = mealResults(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.dataset.form;
  if (!f) return;
  e.preventDefault();
  if (f === 'add-item') { const i = $('#add-item'); if (addExtra(i.value)) { save('extras'); state.focusAdd = true; render(); } else i.value = ''; }
  if (f === 'add-regular') {
    const v = $('#add-regular').value.trim();
    if (v && !state.regulars.some((r) => r.toLowerCase() === v.toLowerCase())) { state.regulars.push(v); save('regulars'); }
    state.focusAdd = true; render();
  }
  if (f === 'log-spend') {
    const amount = Math.round(parseFloat($('#spend-amount').value) * 100) / 100;
    if (!(amount > 0)) { toast('Enter an amount'); return; }
    const date = $('#spend-date').value || todayISO();
    state.spend.push({ id: uid(), date, amount, store: $('#spend-store').value });
    save('spend'); state.spendDraft = null; render(); toast(`${gbp(amount)} added`);
  }
});
function updateListProgress() {
  const buy = computed.lines.filter((l) => !l.have && !l.missing);
  const done = buy.filter((l) => state.plan.checked[l.key]).length;
  const bar = $('#list-progress'); if (bar) bar.style.width = (done / buy.length) * 100 + '%';
  const lbl = bar?.closest('.card')?.querySelector('.muted'); if (lbl) lbl.textContent = `${done} of ${buy.length} in the trolley`;
  renderTabbar();
}
function syncBudgetUI() {
  const b = state.settings.budget;
  document.querySelectorAll('[data-action="budget"]').forEach((c) => c.setAttribute('aria-pressed', +c.dataset.value === b));
  const foot = $('#mode-foot');
  if (foot) foot.textContent = state.settings.mode === 'save' ? `Aims for about £${Math.round(b * 0.88)} so you keep some change.` : `Gets as close to £${b} as it can, with nicer meals.`;
}
function onScroll() { document.body.classList.toggle('scrolled', window.scrollY > 30); }
window.addEventListener('scroll', onScroll, { passive: true });
backdrop.addEventListener('click', closeSheet);

/* ================= boot ================= */
async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' ' + res.status);
  return res.json();
}
async function boot() {
  renderTabbar();
  render();
  try {
    const [ing, recipes, sample] = await Promise.all([loadJSON('data/ingredients.json'), loadJSON('data/recipes.json'), loadJSON('data/sample-prices.json')]);
    let prices;
    try { prices = await loadJSON('data/prices.json'); } catch { prices = sample; }
    data.ingredients = ing.items; data.aisles = ing.aisles;
    data.ing = Object.fromEntries(ing.items.map((i) => [i.key, i]));
    data.recipes = recipes; data.recipe = Object.fromEntries(recipes.map((r) => [r.id, r]));
    data.sample = sample; data.prices = prices;
    if (state.plan && !planEntries(state.plan).length) state.plan = null;
    if (!state.plan) state.tab = state.tab === 'today' ? 'today' : state.tab;
    refresh();
  } catch (err) {
    app.innerHTML = `<div class="empty" style="padding-top:80px"><h2>Basket couldn't load</h2><p>Check your connection and try again.</p><button class="btn btn-filled" data-action="reload">Try again</button></div>`;
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname.endsWith('github.io')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.Basket = { state, data, generatePlan, computePlan, priceCheck, eligible };
boot();
