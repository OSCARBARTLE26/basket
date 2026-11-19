// Basket: a budget meal planner for UK supermarkets.
// Everything runs in the browser. Prices come from data/prices.json,
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
const AVOID = [['vegetarian', 'Vegetarian'], ['pork', 'No pork'], ['beef', 'No beef'], ['lamb', 'No lamb'], ['fish', 'No fish or seafood'], ['mushrooms', 'No mushrooms'], ['spicy', 'Nothing spicy'], ['dairy', 'Dairy-free']];
const BATCH = [
  [0, 'All quick meals', 'Something different every night'],
  [1, 'A bit of both', 'One big batch meal that covers two nights'],
  [2, 'Lots of batch cooking', 'Two batch meals, each covering two nights'],
  [3, 'Mostly batch cooking', 'Three batch meals, so you cook four nights a week'],
];
const CUPBOARD = ['beef-stock', 'chicken-stock', 'veg-stock', 'mixed-herbs', 'paprika', 'chilli-powder', 'cumin', 'curry-powder', 'plain-flour', 'soy-sauce', 'gravy-granules', 'tomato-puree', 'rice', 'spaghetti', 'pasta'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TINT = { chicken: 'var(--t-chicken)', beef: 'var(--t-beef)', pork: 'var(--t-pork)', fish: 'var(--t-fish)', lamb: 'var(--t-lamb)', veg: 'var(--t-veg)' };
const NIGHT_LIMIT = { chicken: 3, beef: 3, pork: 3, fish: 2, lamb: 2, veg: 3 };
const CHILD_PORTION = 0.6;
const PACK_SLACK = 1.08; // a recipe can come up to 8% short of a pack before we buy another

const DEFAULTS = {
  store: 'tesco', budget: 50, adults: 2, children: 0,
  appliances: ['hob', 'oven', 'microwave'], avoid: [], batch: 1, mode: 'save',
  loyalty: { tesco: false, morrisons: false, waitrose: false },
};

/* ================= storage =================
   One small layer so a family login can replace localStorage later
   without touching the rest of the app. */
const Storage = {
  get(key, fallback) {
    try { const v = localStorage.getItem('basket.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('basket.' + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

/* ================= state ================= */
const data = { ingredients: [], ing: {}, aisles: [], recipes: [], recipe: {}, prices: null, sample: null };
const state = {
  tab: 'plan',
  settings: { ...DEFAULTS, ...Storage.get('settings', {}) },
  plan: Storage.get('plan', null),
  saved: Storage.get('saved', []),
  hidden: Storage.get('hidden', []),
  cupboard: Storage.get('cupboard', []),
  editing: false,
};
state.settings.loyalty = { ...DEFAULTS.loyalty, ...(state.settings.loyalty || {}) };

const persist = {
  settings: () => Storage.set('settings', state.settings),
  plan: () => Storage.set('plan', state.plan),
  saved: () => Storage.set('saved', state.saved),
  hidden: () => Storage.set('hidden', state.hidden),
  cupboard: () => Storage.set('cupboard', state.cupboard),
};

/* ================= helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (n) => '£' + (Math.round(n * 100) / 100).toFixed(2);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const uid = () => Math.random().toString(36).slice(2, 10);
const servingsOf = (s) => Math.max(1, s.adults + s.children * CHILD_PORTION);
const nightsOf = (r) => (r.type === 'batch' ? 2 : 1);
const peopleText = (s) => {
  const a = `${s.adults} ${s.adults === 1 ? 'adult or teen' : 'adults and teens'}`;
  return s.children ? `${a}, ${s.children} ${s.children === 1 ? 'child' : 'children'}` : a;
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function nice(n) {
  if (n < 1) return Math.max(0.25, Math.round(n * 4) / 4);
  if (n < 5) return Math.round(n * 2) / 2;
  return Math.round(n);
}
function fmtNum(n) {
  const whole = Math.floor(n), frac = Math.round((n - whole) * 100) / 100;
  if (FRACTIONS[frac]) return (whole ? whole : '') + FRACTIONS[frac];
  return String(Math.round(n * 100) / 100);
}
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
  const big = unit === 'ml' ? 'litres' : 'kg';
  if (qty >= 1000) return `${Math.round(qty / 100) / 10}${big === 'kg' ? 'kg' : ' litres'} ${ing.name.toLowerCase()}`;
  const rounded = qty < 20 ? Math.max(1, Math.round(qty)) : Math.round(qty / 5) * 5;
  return `${rounded}${unit} ${ing.name.toLowerCase()}`;
}

/* ================= pricing ================= */
function productsFor(store, key) {
  const real = data.prices && !data.prices.sample ? data.prices.stores?.[store]?.[key] : null;
  if (real && real.length) return real.map((p) => ({ ...p, est: false }));
  const fallback = data.sample?.stores?.[store]?.[key] || [];
  // "est." only matters once real prices exist; while everything is sample data a banner says so instead.
  const est = !!(data.prices && !data.prices.sample);
  return fallback.map((p) => ({ ...p, est }));
}

function makeCtx(settings) {
  const loyaltyOn = !!(STORES[settings.store].loyalty && settings.loyalty?.[settings.store]);
  const cupboard = new Set(state.cupboard);
  const cache = new Map();
  const products = new Map();
  const productList = (key) => {
    if (!products.has(key)) products.set(key, productsFor(settings.store, key));
    return products.get(key);
  };
  function buy(key, need) {
    if (cupboard.has(key)) return { key, need, have: true, cost: 0 };
    const ck = key + '|' + Math.round(need * 10);
    if (cache.has(ck)) return cache.get(ck);
    let best = null;
    for (const p of productList(key)) {
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
  return { settings, servings: servingsOf(settings), buy, productList, loyaltyOn };
}

function recipeNeeds(ctx, r) {
  const mult = ctx.servings * nightsOf(r);
  return r.ing.map(([key, per]) => [key, per * mult]);
}

function aggregate(ctx, recipes) {
  const totals = new Map();
  for (const r of recipes) for (const [k, q] of recipeNeeds(ctx, r)) totals.set(k, (totals.get(k) || 0) + q);
  return totals;
}

// Total cost, plus how much of it is food left over in part-used packs.
function costOf(ctx, recipes) {
  let cost = 0, spare = 0;
  for (const [k, q] of aggregate(ctx, recipes)) {
    const b = ctx.buy(k, q);
    cost += b.cost;
    if (b.bought) spare += b.cost * Math.max(0, 1 - q / b.bought);
  }
  return { cost, spare };
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
  return (cost, sel, spare = 0) => {
    let s = spare * 0.5; // prefer weeks that use packs up across meals
    if (cost > B) s += (cost - B) * 40 + 15;
    if (cost > target) s += (cost - target) * 3;
    else s += (target - cost) * (settings.mode === 'full' ? 1 : 0.2);
    const nights = {}, fam = {};
    for (const r of sel) {
      nights[r.protein] = (nights[r.protein] || 0) + nightsOf(r);
      fam[r.family] = (fam[r.family] || 0) + 1;
    }
    for (const [p, n] of Object.entries(nights)) if (n > (limits[p] ?? 3)) s += (n - limits[p]) * B * 0.12;
    for (const n of Object.values(fam)) if (n > 1) s += (n - 1) * B * 0.18;
    for (const r of sel) s += (noise[r.id] || 0) * B * 0.03;
    return s;
  };
}

/* ================= the planner ================= */
function generatePlan(settings) {
  const ctx = makeCtx(settings);
  const pool = eligible(settings);
  const batchPool = pool.filter((r) => r.type === 'batch');
  const quickPool = pool.filter((r) => r.type === 'quick');

  let k = Math.min(settings.batch, batchPool.length);
  while (7 - 2 * k > quickPool.length && k < Math.min(3, batchPool.length)) k++;
  const q = 7 - 2 * k;
  if (q > quickPool.length || q < 0) return { error: 'not-enough', count: pool.length };

  const noise = Object.fromEntries(pool.map((r) => [r.id, Math.random()]));
  const score = makeScorer(settings, noise);
  const evaluate = (sel) => { const { cost, spare } = costOf(ctx, sel); return { sel, cost, score: score(cost, sel, spare) }; };
  const pick = (arr, n) => shuffle(arr).slice(0, n);

  const seeds = [];
  for (let i = 0; i < 500; i++) seeds.push(evaluate([...pick(batchPool, k), ...pick(quickPool, q)]));
  seeds.sort((a, b) => a.score - b.score);

  let best = seeds[0];
  for (const seed of seeds.slice(0, 6)) {
    let cur = seed;
    for (let pass = 0; pass < 8; pass++) {
      let improved = false;
      for (let i = 0; i < cur.sel.length; i++) {
        const sameType = cur.sel[i].type === 'batch' ? batchPool : quickPool;
        for (const alt of sameType) {
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

  return {
    id: uid(),
    created: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(settings)),
    days: arrange(best.sel),
    checked: {},
  };
}

// Batch meals take two nights in a row (cook, then leftovers). A Sunday roast goes on Sunday.
function arrange(sel) {
  const batches = shuffle(sel.filter((r) => r.type === 'batch'));
  const quicks = shuffle(sel.filter((r) => r.type === 'quick'));
  const roastIdx = quicks.findIndex((r) => r.sunday);
  const roast = roastIdx > -1 ? quicks.splice(roastIdx, 1)[0] : null;
  const days = [];
  while (batches.length || quicks.length) {
    if (batches.length) { const b = batches.shift(); days.push({ r: b.id, left: false }, { r: b.id, left: true }); }
    if (quicks.length) days.push({ r: quicks.shift().id, left: false });
  }
  if (roast) days.push({ r: roast.id, left: false });
  return days.slice(0, 7);
}

function planRecipes(plan) {
  const seen = new Set();
  return plan.days.filter((d) => !d.left && !seen.has(d.r) && seen.add(d.r)).map((d) => data.recipe[d.r]).filter(Boolean);
}

// Everything the screens need: shopping lines, totals, cost of each meal.
function computePlan(plan) {
  const ctx = makeCtx(plan.settings);
  const recipes = planRecipes(plan);
  const usedBy = new Map();
  for (const r of recipes) for (const [k] of r.ing) { if (!usedBy.has(k)) usedBy.set(k, []); if (!usedBy.get(k).includes(r.name)) usedBy.get(k).push(r.name); }
  const lines = [];
  let total = 0, estimated = false;
  for (const [k, need] of aggregate(ctx, recipes)) {
    const line = { ...ctx.buy(k, need), ing: data.ing[k], usedIn: usedBy.get(k) || [] };
    total += line.cost;
    if (line.p?.est) estimated = true;
    lines.push(line);
  }
  const lineBy = Object.fromEntries(lines.map((l) => [l.key, l]));
  const mealCost = {};
  for (const r of recipes) {
    let c = 0;
    for (const [k, q] of recipeNeeds(ctx, r)) { const l = lineBy[k]; if (l && !l.have && l.bought) c += (q / l.bought) * l.cost; }
    mealCost[r.id] = c;
  }
  const used = Object.values(mealCost).reduce((a, b) => a + b, 0);
  return { ctx, recipes, lines, lineBy, total, mealCost, spare: Math.max(0, total - used), estimated };
}

function swapOptions(plan, recipeId) {
  const settings = plan.settings;
  const ctx = makeCtx(settings);
  const current = planRecipes(plan);
  const target = data.recipe[recipeId];
  const baseCost = costOf(ctx, current).cost;
  const score = makeScorer(settings, {});
  const pool = eligible(settings).filter((r) => r.type === target.type && !current.some((c) => c.id === r.id));
  return pool.map((r) => {
    const sel = current.map((c) => (c.id === recipeId ? r : c));
    const { cost, spare } = costOf(ctx, sel);
    return { r, cost, delta: cost - baseCost, score: score(cost, sel, spare) };
  }).sort((a, b) => a.score - b.score).slice(0, 8);
}

/* ================= rendering ================= */
const app = $('#app');
let lastComputed = null;

function render() {
  document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  const badge = $('#list-badge');
  if (state.plan && lastComputed) {
    const left = lastComputed.lines.filter((l) => !l.have && !state.plan.checked[l.key]).length;
    badge.textContent = left; badge.hidden = left === 0;
  } else badge.hidden = true;

  if (!data.prices) { app.innerHTML = loadingView(); return; }
  let html = '';
  if (state.tab === 'plan') html = state.plan && !state.editing ? weekView() : setupView();
  if (state.tab === 'list') html = listView();
  if (state.tab === 'saved') html = savedView();
  if (state.tab === 'settings') html = settingsView();
  app.innerHTML = topbar() + html;
}

function topbar() {
  const store = state.plan && !state.editing && state.tab !== 'settings' ? STORES[state.plan.settings.store].name : null;
  return `<header class="topbar">
    <div class="brand">${logo()}<span>Basket</span></div>
    ${store ? `<button class="store-pill" data-action="edit">${esc(store)}, ${gbp(state.plan.settings.budget)}</button>` : ''}
  </header>`;
}

function loadingView() {
  return `<div class="loading"><div><div class="basket-bob">🧺</div><p>Getting this week's prices…</p></div></div>`;
}

function setupView() {
  const s = state.settings;
  const store = STORES[s.store];
  const loyaltyRow = store.loyalty ? `
    <div class="toggle-row"><span>I have a ${esc(store.loyalty)}</span>
      <button class="switch" role="switch" aria-checked="${!!s.loyalty[s.store]}" aria-label="Use ${esc(store.loyalty)} prices" data-action="loyalty"></button></div>` : '';
  const pool = eligible(s);
  const tooFew = pool.filter((r) => r.type === 'quick').length + pool.filter((r) => r.type === 'batch').length * 2 < 7;
  return `
  <h1 class="screen-title">${state.plan ? 'Change your week' : "Plan this week's dinners"}</h1>
  <p class="screen-sub">Tell Basket how you shop and cook. It builds seven dinners and one shopping list that fits your budget.</p>

  <section class="section">
    <h2>Where are you shopping?</h2>
    <div class="store-grid">
      ${Object.entries(STORES).map(([k, v]) => `<button class="store" aria-pressed="${s.store === k}" data-action="store" data-value="${k}">${esc(v.name)}<small>${v.loyalty ? esc(v.loyalty) + ' prices' : 'Shelf prices'}</small></button>`).join('')}
    </div>
    ${loyaltyRow}
  </section>

  <section class="section">
    <h2>Weekly budget</h2>
    <div class="budget-input"><span>£</span><input id="budget" inputmode="decimal" type="number" min="10" max="500" step="1" value="${s.budget}" aria-label="Weekly budget in pounds"></div>
    <div class="chips">${[30, 40, 50, 60, 80, 100].map((v) => `<button class="chip" aria-pressed="${+s.budget === v}" data-action="budget" data-value="${v}">£${v}</button>`).join('')}</div>
  </section>

  <section class="section">
    <h2>Who's eating?</h2>
    ${stepper('adults', 'Adults and teens', 'A full portion each', s.adults, 1, 14)}
    ${stepper('children', 'Children under 12', 'About two-thirds of a portion', s.children, 0, 10)}
  </section>

  <section class="section">
    <h2>What can you cook with?</h2>
    <p class="hint">Meals only use what you tick.</p>
    <div class="chips">${APPLIANCES.map(([k, v]) => `<button class="chip" aria-pressed="${s.appliances.includes(k)}" data-action="appliance" data-value="${k}">${v}</button>`).join('')}</div>
  </section>

  <section class="section">
    <h2>Anything to avoid?</h2>
    <p class="hint">Don't like a meal once it's planned? Tap Swap and choose never to see it again.</p>
    <div class="chips">${AVOID.map(([k, v]) => `<button class="chip" aria-pressed="${s.avoid.includes(k)}" data-action="avoid" data-value="${k}">${v}</button>`).join('')}</div>
  </section>

  <section class="section">
    <h2>How do you like to cook?</h2>
    <p class="hint">Batch meals are cooked once and eaten on two nights.</p>
    <div class="segment">${BATCH.map(([v, t, d]) => `<button aria-pressed="${s.batch === v}" data-action="batch" data-value="${v}"><strong>${t}</strong><small>${d}</small></button>`).join('')}</div>
  </section>

  <section class="section">
    <h2>Budget style</h2>
    <div class="segment two">
      <button aria-pressed="${s.mode === 'save'}" data-action="mode" data-value="save"><strong>Save a bit</strong><small>Spend about £${Math.round(s.budget * 0.88)} and keep the change</small></button>
      <button aria-pressed="${s.mode === 'full'}" data-action="mode" data-value="full"><strong>Use it all</strong><small>Nicer meals, as close to £${esc(s.budget)} as it can get</small></button>
    </div>
  </section>

  ${tooFew ? `<div class="notice warn"><strong>Not enough meals match</strong>Only ${pool.length} meals fit these choices. Tick another appliance, remove a filter, or bring back hidden meals in Settings.</div>` : ''}
  ${!s.appliances.length ? `<div class="notice warn"><strong>Tick at least one appliance</strong>Basket needs to know what you can cook with.</div>` : ''}

  <div class="cta-bar">
    <button class="btn btn-primary btn-big" data-action="generate" ${tooFew || !s.appliances.length ? 'disabled' : ''}>${state.plan ? 'Plan a new week' : 'Plan my week'}</button>
    ${state.plan ? `<button class="btn btn-ghost btn-big" style="margin-top:10px;background:var(--bg)" data-action="cancel-edit">Keep my current week</button>` : ''}
  </div>`;
}

function stepper(key, label, sub, value, min, max) {
  return `<div class="stepper-row"><div class="label"><strong>${label}</strong><small>${sub}</small></div>
    <div class="stepper">
      <button data-action="step" data-key="${key}" data-delta="-1" ${value <= min ? 'disabled' : ''} aria-label="Fewer ${label.toLowerCase()}">−</button>
      <output aria-live="polite">${value}</output>
      <button data-action="step" data-key="${key}" data-delta="1" ${value >= max ? 'disabled' : ''} aria-label="More ${label.toLowerCase()}">+</button>
    </div></div>`;
}

function weekView() {
  const plan = state.plan;
  const c = lastComputed;
  const s = plan.settings;
  const store = STORES[s.store];
  const over = c.total > s.budget + 0.005;
  const pct = Math.min(100, (c.total / s.budget) * 100);
  const diff = Math.abs(s.budget - c.total);
  const sampleNote = data.prices.sample
    ? `<div class="notice"><strong>These are sample prices</strong>Real ${esc(store.name)} prices appear after the first price update runs on GitHub.</div>`
    : c.estimated ? `<div class="notice"><strong>A few prices are estimates</strong>Items marked "est." weren't found at ${esc(store.name)} on the last price update.</div>` : '';
  const overNote = over ? `<div class="notice warn"><strong>This is the cheapest week Basket could find</strong>It's ${gbp(diff)} over your budget. Try a bigger budget, more batch cooking or fewer filters.</div>` : '';

  const cards = plan.days.map((d, i) => {
    const r = data.recipe[d.r];
    if (!r) return '';
    const per = c.mealCost[r.id] / (c.ctx.servings * nightsOf(r));
    if (d.left) {
      return `<article class="meal leftover"><button class="meal-main" data-action="open" data-recipe="${r.id}">
        <span class="meal-emoji" aria-hidden="true">${r.emoji}</span>
        <span class="meal-text"><span class="meal-day">${DAYS[i]}</span><span class="meal-name">Leftovers: ${esc(r.name)}</span>
        <span class="meal-meta"><span class="pill">Just reheat</span><span class="pill">Already bought</span></span></span>
        <span></span></button></article>`;
    }
    return `<article class="meal" style="--tint:${TINT[r.protein]}">
      <button class="meal-main" data-action="open" data-recipe="${r.id}">
        <span class="meal-emoji" aria-hidden="true">${r.emoji}</span>
        <span class="meal-text"><span class="meal-day">${DAYS[i]}</span><span class="meal-name">${esc(r.name)}</span>
        <span class="meal-meta"><span class="pill">${timeText(r.mins)}</span>${r.type === 'batch' ? '<span class="pill">Cook once, eat twice</span>' : ''}${r.sunday ? '<span class="pill">Sunday roast</span>' : ''}</span></span>
        <span class="meal-cost">${gbp(per)}<small>a portion</small></span>
      </button>
      <button class="swap" data-action="swap" data-recipe="${r.id}" aria-label="Swap ${esc(r.name)}">${icon('swap')}Swap</button>
    </article>`;
  }).join('');

  return `
  <div class="receipt">
    <div class="receipt-top"><span>${esc(store.name)}${c.ctx.loyaltyOn ? ' with ' + esc(store.loyalty) : ''}</span><span>${esc(peopleText(s))}</span></div>
    <div class="receipt-total">${gbp(c.total)}</div>
    <p class="receipt-of">of your ${gbp(s.budget)} budget for 7 dinners</p>
    <div class="meter ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="receipt-foot">
      <span class="tag ${over ? 'over' : ''}">${over ? gbp(diff) + ' over' : gbp(diff) + ' left'}</span>
      <span class="tag soft">${gbp(c.total / (c.ctx.servings * 7))} a portion</span>
    </div>
  </div>
  ${overNote}${sampleNote}
  <div class="actions">
    <button class="btn btn-primary" data-action="tab" data-value="list">${icon('list')}Shopping list</button>
    <button class="btn btn-soft" data-action="save">${icon('save')}${isSaved(plan) ? 'Saved' : 'Save week'}</button>
    <button class="btn btn-soft" data-action="shuffle">${icon('shuffle')}New meals</button>
    <button class="btn btn-soft" data-action="edit">${icon('sliders')}Change</button>
  </div>
  <div class="week">${cards}</div>`;
}

const timeText = (m) => (m >= 120 ? `${Math.round(m / 60)} hrs, mostly hands-off` : m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);
const isSaved = (plan) => state.saved.some((p) => p.id === plan.id);

function listView() {
  if (!state.plan) return emptyView('📝', 'No shopping list yet', 'Plan your week first and your list appears here, grouped by aisle.', 'Plan my week', 'go-plan');
  const c = lastComputed;
  const s = state.plan.settings;
  const store = STORES[s.store];
  const buyLines = c.lines.filter((l) => !l.have && !l.missing);
  const done = buyLines.filter((l) => state.plan.checked[l.key]).length;
  const groups = data.aisles.map((a) => [a, buyLines.filter((l) => l.ing.aisle === a)]).filter(([, ls]) => ls.length);
  const have = c.lines.filter((l) => l.have);
  return `
  <div class="list-head">
    <div class="total">${gbp(c.total)}</div>
    <p>${buyLines.length} items at ${esc(store.name)}${c.ctx.loyaltyOn ? ', ' + esc(store.loyalty) + ' prices' : ''}</p>
    <div class="progress"><i style="width:${buyLines.length ? (done / buyLines.length) * 100 : 0}%"></i></div>
    <div class="row">
      <button class="btn" data-action="share">${icon('share')}Share list</button>
      ${done ? `<button class="btn" data-action="untick">Untick all</button>` : ''}
    </div>
  </div>
  ${groups.map(([aisle, ls]) => `
    <section class="aisle">
      <h3>${esc(aisle)}<span>${gbp(ls.reduce((a, l) => a + l.cost, 0))}</span></h3>
      <div class="items">${ls.map((l) => {
        const on = !!state.plan.checked[l.key];
        return `<label class="item ${on ? 'done' : ''}">
          <input type="checkbox" data-action="tick" data-key="${l.key}" ${on ? 'checked' : ''}>
          <span><span class="name">${esc(l.p.n)}${l.p.est ? '<span class="est" title="Estimated price">est.</span>' : ''}</span>
            <span class="for">For ${esc(l.usedIn.join(', '))}</span></span>
          <span class="cost">${gbp(l.cost)}${l.packs > 1 ? `<small>${l.packs} × ${gbp(l.unit)}</small>` : l.loyalty ? `<small>${esc(store.loyalty)}</small>` : ''}</span>
        </label>`;
      }).join('')}</div>
    </section>`).join('')}
  ${have.length ? `<p class="foot-note">Not on the list because you said you have them: ${esc(have.map((l) => l.ing.name.toLowerCase()).join(', '))}.</p>` : ''}
  <p class="foot-note">You also need salt, pepper and cooking oil. Around ${gbp(c.spare)} of this shop is food left over in part-used packs, which stays in your cupboard for next week.</p>`;
}

function savedView() {
  if (!state.saved.length) return emptyView('📌', 'No saved weeks yet', 'When you like a week, tap Save week and it lands here so you can use it again.', state.plan ? 'Back to my week' : 'Plan my week', 'go-plan');
  return `<h1 class="screen-title">Saved weeks</h1><p class="screen-sub">Prices update when you open a saved week.</p>
  ${state.saved.map((p) => {
    const recipes = planRecipes(p);
    return `<article class="saved-card">
      <h2>${esc(p.name)}</h2>
      <p class="meta">${esc(STORES[p.settings.store].name)}, ${esc(peopleText(p.settings))}, ${gbp(p.savedTotal || 0)} when saved</p>
      <div class="emojis" aria-hidden="true">${recipes.map((r) => r.emoji).join('')}</div>
      <div class="row"><button class="btn btn-primary" data-action="open-saved" data-id="${p.id}">Use this week</button>
      <button class="btn btn-ghost" data-action="delete-saved" data-id="${p.id}">Delete</button></div>
    </article>`;
  }).join('')}`;
}

function settingsView() {
  const p = data.prices;
  const statusRows = p.sample
    ? '<p class="hint" style="margin:0">Basket is using sample prices. Run the price update in GitHub to load real ones.</p>'
    : `<div class="data-status">${Object.entries(STORES).map(([k, v]) => {
      const st = p.status?.[k];
      return `<div><span>${esc(v.name)}</span><span>${st ? `${st.ingredients} of ${data.ingredients.length} ingredients, ${fmtDate(st.updated)}${st.kept ? ' (last good update)' : ''}` : 'No data'}</span></div>`;
    }).join('')}</div>`;
  const hidden = state.hidden.map((id) => data.recipe[id]).filter(Boolean);
  return `<h1 class="screen-title">Settings</h1><p class="screen-sub">These apply to every week you plan.</p>
  <section class="section">
    <h2>Already in your cupboard</h2>
    <p class="hint">Ticked items stay off your shopping list. Salt, pepper and cooking oil are always assumed.</p>
    <div class="chips">${CUPBOARD.map((k) => `<button class="chip" aria-pressed="${state.cupboard.includes(k)}" data-action="cupboard" data-value="${k}">${esc(data.ing[k].name)}</button>`).join('')}</div>
  </section>
  <section class="section">
    <h2>Hidden meals</h2>
    ${hidden.length ? hidden.map((r) => `<div class="hidden-row"><span>${r.emoji} ${esc(r.name)}</span><button class="btn btn-soft" data-action="unhide" data-id="${r.id}">Bring back</button></div>`).join('')
      : '<p class="hint" style="margin:0">None yet. Meals you hide from the Swap screen appear here.</p>'}
  </section>
  <section class="section">
    <h2>Prices</h2>
    <p class="hint">${p.sample ? '' : `Last updated ${fmtDate(p.updated)}. `}Basket prices the ingredients its recipes use, not a supermarket's whole range. Anything not found uses an estimate, marked "est.". Prices are the standard online price, so your local store may differ slightly.</p>
    ${statusRows}
  </section>
  <section class="section">
    <h2>Start again</h2>
    <p class="hint">Clears your settings, current week, saved weeks and hidden meals from this device.</p>
    <button class="btn btn-danger" data-action="reset">Clear everything</button>
  </section>`;
}

function emptyView(emoji, title, text, cta, action) {
  return `<div class="empty"><div class="big-emoji">${emoji}</div><h2>${title}</h2><p>${text}</p><button class="btn btn-primary" data-action="${action}">${cta}</button></div>`;
}

/* ---------- sheets ---------- */
const sheet = $('#sheet'), backdrop = $('#backdrop');
let lastFocus = null;
function openSheet(html, tint) {
  lastFocus = document.activeElement;
  sheet.style.setProperty('--tint', tint || 'var(--butter-soft)');
  sheet.innerHTML = `<div class="grab"></div><button class="sheet-close" data-action="close" aria-label="Close">${icon('close')}</button><div class="sheet-scroll">${html}</div>`;
  sheet.hidden = false; backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); $('.sheet-close', sheet).focus({ preventScroll: true }); });
}
function closeSheet() {
  sheet.classList.remove('open'); backdrop.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; sheet.innerHTML = ''; }, 280);
  lastFocus?.focus?.({ preventScroll: true });
}

function recipeSheet(id) {
  const r = data.recipe[id];
  const c = lastComputed;
  const s = state.plan.settings;
  const nights = nightsOf(r);
  const portions = c.ctx.servings * nights;
  const rows = recipeNeeds(c.ctx, r).map(([k, q]) => {
    const ing = data.ing[k], l = c.lineBy[k];
    let right = '', from = '';
    if (l?.have) from = 'From your cupboard';
    else if (l?.p) {
      from = `${l.p.n}${l.packs > 1 ? `, ${l.packs} packs` : ''}`;
      const share = (q / l.bought) * l.cost;
      right = `<span class="price">${gbp(share)}${l.usedIn.length > 1 ? `<small>shared pack</small>` : ''}</span>`;
    }
    return `<li><span class="what">${esc(capital(fmtAmount(ing, q)))}<span class="from">${esc(from)}${l?.p?.est ? ' <span class="est">est.</span>' : ''}</span></span>${right}</li>`;
  }).join('');
  const steps = r.steps.map((t) => `<li>${esc(t)}</li>`).join('')
    + (nights > 1 ? `<li class="tip">Leftovers night: cool the rest within 2 hours, keep it covered in the fridge and reheat until piping hot the next day.</li>` : '');
  const per = c.mealCost[r.id] / portions;
  openSheet(`
    <div class="sheet-hero">
      <div class="big-emoji" aria-hidden="true">${r.emoji}</div>
      <h2>${esc(r.name)}</h2>
      <div class="meal-meta"><span class="pill">${timeText(r.mins)}</span><span class="pill">${nights > 1 ? `Serves ${fmtNum(nice(c.ctx.servings))}, for 2 nights` : `Serves ${fmtNum(nice(c.ctx.servings))}`}</span><span class="pill">About ${gbp(c.mealCost[r.id])}, ${gbp(per)} a portion</span></div>
    </div>
    <h3>What you need</h3>
    <ul class="ing-list">${rows}</ul>
    <p class="cupboard-note">Plus salt, pepper and cooking oil from your cupboard.${nights > 1 ? ' Amounts cover both nights.' : ''}</p>
    <h3>How to make it</h3>
    <ol class="steps">${steps}</ol>
    <div class="sheet-actions"><button class="btn btn-soft btn-big" data-action="swap" data-recipe="${r.id}">${icon('swap')}Swap this meal</button></div>
  `, TINT[r.protein]);
}
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function swapSheet(id) {
  const r = data.recipe[id];
  const opts = swapOptions(state.plan, id);
  const budget = state.plan.settings.budget;
  const base = lastComputed.total;
  const list = opts.length ? opts.map((o) => {
    const over = o.cost > budget + 0.005;
    const d = Math.round(o.delta * 100) / 100;
    return `<button class="alt" style="--tint:${TINT[o.r.protein]}" data-action="do-swap" data-from="${id}" data-to="${o.r.id}">
      <span class="meal-emoji" aria-hidden="true">${o.r.emoji}</span>
      <span><strong>${esc(o.r.name)}</strong><small>${timeText(o.r.mins)}${over ? ', goes over budget' : ''}</small></span>
      <span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d === 0 ? 'Same' : (d > 0 ? '+' : '−') + gbp(Math.abs(d))}</span>
    </button>`;
  }).join('') : `<p class="hint">No other ${r.type === 'batch' ? 'batch' : 'quick'} meals fit your settings.</p>`;
  openSheet(`
    <div class="sheet-hero" style="padding-bottom:18px">
      <div class="big-emoji" aria-hidden="true">${r.emoji}</div>
      <h2>Swap ${esc(r.name)}</h2>
      <p style="color:var(--ink-2)">Your week is ${gbp(base)}. Each option shows how the total changes.</p>
    </div>
    <div class="alt-list">${list}</div>
    <label class="check-row"><input type="checkbox" id="hide-meal"> Don't suggest ${esc(r.name)} again</label>
  `, TINT[r.protein]);
}

/* ---------- icons ---------- */
function logo() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#2b1740"/><path d="M15 20c0-5 4-9 9-9s9 4 9 9" fill="none" stroke="#ffd95a" stroke-width="3.5" stroke-linecap="round"/><path d="M9 20h30l-3.2 15.2A3 3 0 0 1 32.9 38H15.1a3 3 0 0 1-2.9-2.8z" fill="#ffd95a"/><path d="M19 25v8M24 25v8M29 25v8" stroke="#2b1740" stroke-width="2.6" stroke-linecap="round"/></svg>`;
}
function icon(name) {
  const p = {
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    save: '<path d="M6 4h12v16l-6-4-6 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M15 7h5m0 0-2.5-2.5M20 7l-2.5 2.5M20 17l-2.5-2.5M20 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    share: '<path d="M12 4v11M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  }[name];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= actions ================= */
// Two-tap confirm instead of a pop-up (pop-ups are blocked in some app views).
function confirmTap(el, label) {
  if (el.dataset.armed === '1') return true;
  const original = el.textContent;
  el.dataset.armed = '1'; el.textContent = label; el.classList.add('confirming');
  setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = original; el.classList.remove('confirming'); } }, 3000);
  return false;
}
function refresh() { lastComputed = state.plan ? computePlan(state.plan) : null; render(); }
function setSetting(key, value) { state.settings[key] = value; persist.settings(); render(); }
function toggleIn(list, value) { const i = list.indexOf(value); if (i > -1) list.splice(i, 1); else list.push(value); }

function doGenerate() {
  state.settings.budget = clampBudget(state.settings.budget); persist.settings();
  const btn = $('[data-action="generate"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Planning your week…'; }
  setTimeout(() => {
    const result = generatePlan(state.settings);
    if (result.error) { toast('Not enough meals fit those choices'); render(); return; }
    state.plan = result; state.editing = false; persist.plan();
    refresh(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 30);
}

function shareText() {
  const c = lastComputed, s = state.plan.settings;
  const lines = [`Basket shopping list: ${STORES[s.store].name}, ${gbp(c.total)}`];
  for (const a of data.aisles) {
    const ls = c.lines.filter((l) => !l.have && !l.missing && l.ing.aisle === a);
    if (!ls.length) continue;
    lines.push('', a);
    for (const l of ls) lines.push(`${state.plan.checked[l.key] ? '✓' : '•'} ${l.p.n}${l.packs > 1 ? ` (×${l.packs})` : ''}, ${gbp(l.cost)}`);
  }
  lines.push('', 'Dinners:');
  state.plan.days.forEach((d, i) => lines.push(`${DAYS[i]}: ${d.left ? 'Leftovers, ' : ''}${data.recipe[d.r].name}`));
  return lines.join('\n');
}

const actions = {
  tab: (el) => { state.tab = el.dataset.value; if (state.tab !== 'plan') state.editing = false; render(); window.scrollTo(0, 0); },
  'go-plan': () => { state.tab = 'plan'; render(); },
  store: (el) => setSetting('store', el.dataset.value),
  loyalty: () => { state.settings.loyalty[state.settings.store] = !state.settings.loyalty[state.settings.store]; persist.settings(); render(); },
  budget: (el) => setSetting('budget', +el.dataset.value),
  step: (el) => { const k = el.dataset.key; setSetting(k, Math.max(0, state.settings[k] + +el.dataset.delta)); },
  appliance: (el) => { toggleIn(state.settings.appliances, el.dataset.value); persist.settings(); render(); },
  avoid: (el) => { toggleIn(state.settings.avoid, el.dataset.value); persist.settings(); render(); },
  batch: (el) => setSetting('batch', +el.dataset.value),
  mode: (el) => setSetting('mode', el.dataset.value),
  generate: doGenerate,
  shuffle: () => { state.plan = generatePlan(state.plan.settings); persist.plan(); refresh(); toast('Fresh meals for your week'); },
  edit: () => { state.settings = JSON.parse(JSON.stringify(state.plan.settings)); persist.settings(); state.editing = true; state.tab = 'plan'; render(); window.scrollTo(0, 0); },
  'cancel-edit': () => { state.editing = false; render(); },
  open: (el) => recipeSheet(el.dataset.recipe),
  swap: (el) => swapSheet(el.dataset.recipe),
  'do-swap': (el) => {
    const from = el.dataset.from, to = el.dataset.to;
    if ($('#hide-meal')?.checked && !state.hidden.includes(from)) { state.hidden.push(from); persist.hidden(); }
    state.plan.days = state.plan.days.map((d) => (d.r === from ? { ...d, r: to } : d));
    persist.plan(); closeSheet(); refresh(); toast(`Swapped in ${data.recipe[to].name}`);
  },
  close: closeSheet,
  save: () => {
    const c = lastComputed;
    const existing = state.saved.findIndex((p) => p.id === state.plan.id);
    const copy = { ...JSON.parse(JSON.stringify(state.plan)), name: `Week of ${fmtDate(state.plan.created)}, ${STORES[state.plan.settings.store].name}`, savedTotal: c.total, savedAt: new Date().toISOString() };
    if (existing > -1) state.saved[existing] = copy; else state.saved.unshift(copy);
    persist.saved(); render(); toast(existing > -1 ? 'Saved week updated' : 'Week saved');
  },
  'open-saved': (el) => {
    const p = state.saved.find((x) => x.id === el.dataset.id);
    state.plan = { ...JSON.parse(JSON.stringify(p)), checked: {} };
    state.settings = JSON.parse(JSON.stringify(p.settings));
    persist.plan(); persist.settings(); state.tab = 'plan'; state.editing = false; refresh(); window.scrollTo(0, 0);
  },
  'delete-saved': (el) => {
    if (!confirmTap(el, 'Tap again to delete')) return;
    state.saved = state.saved.filter((x) => x.id !== el.dataset.id); persist.saved(); render();
  },
  share: async () => {
    const text = shareText();
    if (navigator.share) {
      try { await navigator.share({ title: 'Shopping list', text }); return; }
      catch (e) { if (e?.name === 'AbortError') return; /* sharing blocked here, copy instead */ }
    }
    try { await navigator.clipboard.writeText(text); toast('List copied, paste it into WhatsApp'); }
    catch { toast('Could not copy the list on this device'); }
  },
  untick: () => { state.plan.checked = {}; persist.plan(); render(); },
  cupboard: (el) => { toggleIn(state.cupboard, el.dataset.value); persist.cupboard(); refresh(); },
  unhide: (el) => { state.hidden = state.hidden.filter((x) => x !== el.dataset.id); persist.hidden(); render(); },
  reset: (el) => {
    if (!confirmTap(el, 'Tap again to clear everything')) return;
    ['settings', 'plan', 'saved', 'hidden', 'cupboard'].forEach((k) => { try { localStorage.removeItem('basket.' + k); } catch { /* ignore */ } });
    state.settings = JSON.parse(JSON.stringify(DEFAULTS)); state.plan = null; state.saved = []; state.hidden = []; state.cupboard = [];
    state.tab = 'plan'; refresh(); toast('Everything cleared');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.dataset.action === 'tick') return; // handled by change
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.action === 'tick') {
    state.plan.checked[el.dataset.key] = el.checked; persist.plan();
    el.closest('.item').classList.toggle('done', el.checked);
    const c = lastComputed, buy = c.lines.filter((l) => !l.have && !l.missing);
    const done = buy.filter((l) => state.plan.checked[l.key]).length;
    $('.list-head .progress i').style.width = (done / buy.length) * 100 + '%';
    const badge = $('#list-badge'); badge.textContent = buy.length - done; badge.hidden = buy.length === done;
  }
  if (el.id === 'budget') {
    const v = clampBudget(el.value);
    el.value = v; state.settings.budget = v; persist.settings(); syncBudgetUI();
  }
});
// Typing a budget updates it straight away without redrawing the page,
// so tapping "Plan my week" straight after still works.
document.addEventListener('input', (e) => {
  if (e.target.id !== 'budget') return;
  const v = +e.target.value;
  if (v >= 1) { state.settings.budget = Math.min(500, Math.round(v)); persist.settings(); syncBudgetUI(); }
});
const clampBudget = (v) => Math.max(10, Math.min(500, Math.round(+v || DEFAULTS.budget)));
function syncBudgetUI() {
  const b = state.settings.budget;
  document.querySelectorAll('[data-action="budget"]').forEach((c) => c.setAttribute('aria-pressed', +c.dataset.value === b));
  const save = $('[data-action="mode"][data-value="save"] small'), full = $('[data-action="mode"][data-value="full"] small');
  if (save) save.textContent = `Spend about £${Math.round(b * 0.88)} and keep the change`;
  if (full) full.textContent = `Nicer meals, as close to £${b} as it can get`;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
backdrop.addEventListener('click', closeSheet);
document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => actions.tab({ dataset: { value: b.dataset.tab } })));

/* ================= boot ================= */
async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' ' + res.status);
  return res.json();
}

async function boot() {
  render();
  try {
    const [ing, recipes, sample] = await Promise.all([loadJSON('data/ingredients.json'), loadJSON('data/recipes.json'), loadJSON('data/sample-prices.json')]);
    let prices;
    try { prices = await loadJSON('data/prices.json'); } catch { prices = sample; }
    data.ingredients = ing.items; data.aisles = ing.aisles;
    data.ing = Object.fromEntries(ing.items.map((i) => [i.key, i]));
    data.recipes = recipes; data.recipe = Object.fromEntries(recipes.map((r) => [r.id, r]));
    data.sample = sample; data.prices = prices;
    if (state.plan && !planRecipes(state.plan).length) state.plan = null;
    refresh();
  } catch (err) {
    app.innerHTML = topbar() + emptyView('📡', "Basket couldn't load", 'Check your connection and try again.', 'Try again', 'reload');
    actions.reload = () => location.reload();
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for testing in the browser console.
window.Basket = { state, data, generatePlan, computePlan, eligible };
boot();
