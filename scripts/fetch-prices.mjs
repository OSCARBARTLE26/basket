// Basket price update.
// Runs the Apify actor "griffie/uk-supermarket-prices" once, matches the results
// to the ingredients in data/ingredients.json and writes data/prices.json.
//
// Run by the GitHub Action (.github/workflows/update-prices.yml).
// Needs the APIFY_TOKEN secret. Never put the token in this file.
//
// Local test without spending credit:  node scripts/fetch-prices.mjs --from items.json

import { readFile, writeFile } from 'node:fs/promises';

const ACTOR = 'griffie~uk-supermarket-prices';
const STORES = ['tesco', 'asda', 'aldi', 'morrisons', 'waitrose'];
const PRODUCTS_PER_SEARCH = 5;   // per supermarket, per ingredient
const MAX_SPEND_USD = 2.5;       // hard cap for one run
const KEEP_PER_INGREDIENT = 6;   // products kept per store per ingredient
const API = 'https://api.apify.com/v2';

const root = new URL('../', import.meta.url);
const pathOf = (p) => new URL(p, root);

// ---------- matching ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ');
const startsWord = (text, term) => new RegExp(`(?<![a-z0-9])${esc(term.trim().toLowerCase())}`).test(text);
const wholeWord = (text, term) => new RegExp(`(?<![a-z0-9])${esc(term.trim().toLowerCase())}(?:s|es)?(?![a-z0-9])`).test(text);

export function matches(ing, name) {
  const text = norm(name);
  if ((ing.inc || []).some((t) => !startsWord(text, t))) return false;
  if ((ing.any || []).length && !ing.any.some((t) => startsWord(text, t))) return false;
  if ((ing.exc || []).some((t) => wholeWord(text, t))) return false;
  return true;
}

// ---------- pack size parsing ----------
const UNIT = { kg: ['g', 1000], g: ['g', 1], ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], ltr: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000], liter: ['ml', 1000] };

const COUNT_WORDS = 'wraps|tortillas|buns|eggs|cubes|pittas?|naans?|rolls|lemons|bulbs|peppers|fillets|steaks|pots';

function parseCount(s) {
  const m = s.match(/pack of (\d+)/)
    || s.match(/(\d+)\s*(?:pack|pk|per pack|count|ct)(?![a-z])/)
    || s.match(new RegExp(`(?:^|\\s)(\\d+)\\s+(?:[a-z'&]+\\s+){0,4}(?:${COUNT_WORDS})(?![a-z])`));
  if (m && +m[1] > 0 && +m[1] < 100) return { q: +m[1], u: 'each' };
  if (/(^|\s)(each|single|loose)(\s|$)/.test(s)) return { q: 1, u: 'each' };
  return null;
}

function parseWeight(s) {
  let m = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|ltr|litres|litre|liter|l)(?![a-z])/);
  if (m) { const [u, f] = UNIT[m[3]]; return { q: +m[1] * +m[2] * f, u }; }
  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|ltr|litres|litre|liter|l)(?![a-z])/);
  if (m) { const [u, f] = UNIT[m[2]]; return { q: +m[1] * f, u }; }
  m = s.match(/(\d+(?:\.\d+)?)\s*pints?(?![a-z])/);
  if (m) return { q: +m[1] * 568, u: 'ml' };
  return null;
}

// Items counted in units (eggs, wraps, stock cubes) prefer a count; everything else prefers a weight.
function parseText(raw, preferCount) {
  const s = norm(raw).replace(/,/g, '');
  if (!s) return null;
  return preferCount ? (parseCount(s) || parseWeight(s)) : (parseWeight(s) || parseCount(s));
}

export function parseQty(item, ing) {
  const preferCount = ing?.unit === 'each';
  const fromSize = parseText(item.size, preferCount);
  if (fromSize) return fromSize;
  const fromName = parseText(item.name, preferCount);
  if (fromName) return fromName;
  const cup = Number(item.comparableUnitPrice), price = Number(item.price);
  if (cup > 0 && price > 0) {
    const unit = norm(item.comparableUnit);
    if (unit === 'kg') return { q: Math.round((price / cup) * 1000), u: 'g' };
    if (unit === 'litre' || unit === 'l') return { q: Math.round((price / cup) * 1000), u: 'ml' };
    if (unit === 'each') return { q: Math.max(1, Math.round(price / cup)), u: 'each' };
  }
  return null;
}

// Convert a parsed pack size into the ingredient's own unit.
export function toIngredientUnit(ing, parsed) {
  if (!parsed || !(parsed.q > 0)) return null;
  const { q, u } = parsed;
  if (u === ing.unit) return q;
  const weightLike = (x) => x === 'g' || x === 'ml';
  if (weightLike(u) && weightLike(ing.unit)) return q;                       // treat ml and g as equal
  if (u === 'each' && weightLike(ing.unit) && ing.each) return q * ing.each;
  if (weightLike(u) && ing.unit === 'each' && ing.each) return Math.max(1, Math.round(q / ing.each));
  return null;
}

const money = (x) => Math.round(Number(x) * 100) / 100;

export function buildPrices(items, ingredients, previous) {
  const byTerm = new Map(ingredients.map((i) => [norm(i.search), i]));
  const stores = Object.fromEntries(STORES.map((s) => [s, {}]));
  const seen = Object.fromEntries(STORES.map((s) => [s, 0]));

  for (const it of items) {
    if (it.recordType && it.recordType !== 'product') continue;
    const store = norm(it.chain);
    if (!stores[store]) continue;
    seen[store]++;
    const ing = byTerm.get(norm(it.searchQuery));
    if (!ing) continue;
    if (it.available === false) continue;
    const price = Number(it.price);
    if (!(price > 0)) continue;
    if (!matches(ing, it.name)) continue;
    const q = toIngredientUnit(ing, parseQty(it, ing));
    if (!q || q > 20000) continue;
    const lp = Number(it.loyaltyPrice) > 0 && Number(it.loyaltyPrice) < price ? money(it.loyaltyPrice) : null;
    (stores[store][ing.key] ||= []).push({ n: String(it.name).trim(), p: money(price), lp, q: Math.round(q * 10) / 10, url: it.url || null });
  }

  // Keep the best-value few per ingredient, drop duplicates.
  for (const s of STORES) {
    for (const [key, list] of Object.entries(stores[s])) {
      const unique = [...new Map(list.map((p) => [p.n + p.p, p])).values()];
      unique.sort((a, b) => a.p / a.q - b.p / b.q);
      stores[s][key] = unique.slice(0, KEEP_PER_INGREDIENT);
    }
  }

  // If a supermarket returned nothing this time (blocked, outage), keep its last real prices.
  const status = {};
  for (const s of STORES) {
    const found = Object.keys(stores[s]).length;
    const prevStore = previous && !previous.sample ? previous.stores?.[s] : null;
    if (found === 0 && prevStore && Object.keys(prevStore).length) {
      stores[s] = prevStore;
      status[s] = { products: 0, ingredients: Object.keys(prevStore).length, kept: true, updated: previous.status?.[s]?.updated || previous.updated };
    } else {
      // Fill individual gaps from last time so one bad search doesn't remove an ingredient.
      if (prevStore) for (const [k, v] of Object.entries(prevStore)) if (!stores[s][k]) stores[s][k] = v;
      status[s] = { products: seen[s], ingredients: Object.keys(stores[s]).length, kept: false, updated: new Date().toISOString() };
    }
  }
  return { updated: new Date().toISOString(), sample: false, source: 'Apify: griffie/uk-supermarket-prices', status, stores };
}

// ---------- Apify ----------
async function api(path, opts = {}) {
  const token = process.env.APIFY_TOKEN;
  const res = await fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runActor(terms) {
  const maxItems = terms.length * STORES.length * PRODUCTS_PER_SEARCH;
  const input = {
    searchTerms: terms,
    chains: STORES,
    maxProductsPerChain: PRODUCTS_PER_SEARCH,
    maxItems,
    includeSponsored: false,
    compareMode: false,
    onlyOffers: false,
    monitorMode: false,
  };
  console.log(`Searching ${terms.length} ingredients at ${STORES.length} supermarkets (up to ${maxItems} products, spend capped at $${MAX_SPEND_USD}).`);
  const started = await api(`/acts/${ACTOR}/runs?maxItems=${maxItems}&maxTotalChargeUsd=${MAX_SPEND_USD}`, { method: 'POST', body: JSON.stringify(input) });
  let run = started.data;
  const deadline = Date.now() + 40 * 60 * 1000;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (Date.now() > deadline) throw new Error('Price run took longer than 40 minutes.');
    run = (await api(`/actor-runs/${run.id}?waitForFinish=60`)).data;
    console.log(`Run status: ${run.status}`);
  }
  if (run.status !== 'SUCCEEDED') console.warn(`Run ended as ${run.status}. Using whatever prices it collected.`);
  const items = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json&offset=${offset}&limit=1000`, { headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } });
    if (!res.ok) throw new Error(`Could not read results: ${res.status}`);
    const page = await res.json();
    items.push(...page);
    if (page.length < 1000) break;
  }
  return items;
}

// ---------- main ----------
async function main() {
  const { items: ingredients } = JSON.parse(await readFile(pathOf('data/ingredients.json'), 'utf8'));
  let previous = null;
  try { previous = JSON.parse(await readFile(pathOf('data/prices.json'), 'utf8')); } catch { /* first run */ }

  const fromIdx = process.argv.indexOf('--from');
  let items;
  if (fromIdx > -1) {
    items = JSON.parse(await readFile(process.argv[fromIdx + 1], 'utf8'));
  } else {
    if (!process.env.APIFY_TOKEN) throw new Error('APIFY_TOKEN is not set. Add it as a repository secret.');
    items = await runActor([...new Set(ingredients.map((i) => i.search))]);
  }

  const prices = buildPrices(items, ingredients, previous);
  const found = Object.values(prices.status).reduce((n, s) => n + s.ingredients, 0);
  if (found === 0) throw new Error('No usable prices came back, so prices.json was left as it was.');
  await writeFile(pathOf('data/prices.json'), JSON.stringify(prices));
  for (const [s, st] of Object.entries(prices.status)) {
    console.log(`${s.padEnd(10)} ${String(st.ingredients).padStart(3)} of ${ingredients.length} ingredients priced${st.kept ? ' (kept last prices, nothing came back)' : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
