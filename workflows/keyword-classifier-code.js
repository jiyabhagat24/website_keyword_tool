// Intent classification for beauty / skincare / grooming keywords. Rule based, no AI cost.
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => norm(s).replace(/\band\b/g, '').replace(/[^a-z0-9]/g, '');
const has = (text, list) => list.some(w => new RegExp('(^| )' + w + '( |$)').test(text));

const COMPARISON = ['vs', 'versus', 'compare', 'comparison', 'alternative', 'alternatives', 'better than', 'or'];
const PRICE = ['price', 'prices', 'cost', 'cheap', 'cheapest', 'buy', 'online', 'offer', 'offers', 'discount', 'coupon', 'sale', 'deal', 'deals', 'under', 'below', 'budget', 'affordable', 'amazon', 'flipkart', 'nykaa', 'myntra', 'order', 'shop'];
const LOCAL = ['near me', 'nearby', 'near', 'in delhi', 'in mumbai', 'in bangalore', 'in india'];
const BEST = ['best', 'top', 'top rated', 'recommended', 'review', 'reviews', 'rated', 'popular'];
const QUESTION = ['is', 'are', 'can', 'does', 'do', 'will', 'should', 'what', 'which', 'why', 'when', 'who', 'safe', 'healthy', 'worth it', 'side effects', 'side effect', 'good for', 'benefits', 'disadvantages'];
const HOWTO = ['how to', 'how long', 'how much', 'how often', 'steps', 'routine', 'tutorial', 'method', 'apply', 'use', 'using', 'guide', 'tips', 'remove', 'get rid of', 'treat', 'cure'];
const CONCERN = ['acne', 'pimple', 'pimples', 'blackhead', 'blackheads', 'whitehead', 'dark spot', 'dark spots', 'pigmentation', 'dark circle', 'dark circles', 'tan', 'tanning', 'sunburn', 'wrinkle', 'wrinkles', 'fine lines', 'aging', 'ageing', 'dry skin', 'oily skin', 'sensitive skin', 'combination skin', 'dandruff', 'hair fall', 'hair loss', 'hairfall', 'baldness', 'grey hair', 'gray hair', 'stretch marks', 'scars', 'melasma', 'rosacea', 'eczema', 'dullness', 'open pores', 'pores', 'uneven skin tone', 'chapped lips', 'cracked heels'];
const INGREDIENT = ['vitamin c', 'vitamin e', 'vitamin a', 'vitamin b5', 'niacinamide', 'retinol', 'retinoid', 'salicylic acid', 'glycolic acid', 'lactic acid', 'hyaluronic acid', 'hyaluronic', 'kojic acid', 'azelaic acid', 'ceramide', 'ceramides', 'peptide', 'peptides', 'aha', 'bha', 'pha', 'alpha arbutin', 'arbutin', 'tranexamic acid', 'ascorbic acid', 'collagen', 'aloe vera', 'tea tree', 'rice water', 'sunscreen spf', 'zinc', 'shea butter', 'argan oil', 'castor oil', 'coconut oil', 'minoxidil', 'biotin', 'keratin', 'charcoal', 'clay', 'turmeric', 'sandalwood', 'neem'];

function makeBrandIndex(brandNames) {
  // brandNames: [{name, site}] where name may hold aliases separated by |
  const out = [];
  for (const row of brandNames) {
    const aliases = String(row.name ?? '').split('|').map(a => a.trim()).filter(Boolean);
    const canon = aliases[0] ?? '';
    for (const name of aliases) {
      const text = norm(name);
      const sq = squash(name);
      if (sq.length < 3) continue;
      const words = text.split(' ').filter(Boolean);
      out.push({ name: canon, key: sq, single: words.length === 1, text, site: row.site ?? '' });
    }
  }
  return out;
}

function findBrand(kw, index) {
  const text = norm(kw);
  const sq = squash(kw);
  let best = null;
  for (const b of index) {
    const hit = b.single ? new RegExp('(^| )' + b.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s)?( |$)').test(text) || (b.key.length >= 6 && sq.includes(b.key)) : sq.includes(b.key);
    if (hit && (!best || b.key.length > best.key.length)) best = b;
  }
  return best;
}

function classify(keyword, website, index) {
  const text = norm(keyword);
  if (!text) return { intent: '', brand: '' };
  const hit = index.length ? findBrand(keyword, index) : null;
  if (hit) {
    const own = !website || !hit.site || siteKey(hit.site) === siteKey(website);
    return { intent: own ? 'Branded' : 'Competitor brand', brand: hit.name };
  }
  if (has(text, COMPARISON)) return { intent: 'Comparison', brand: '' };
  if (has(text, LOCAL)) return { intent: 'Local', brand: '' };
  if (has(text, PRICE)) return { intent: 'Price / Buy', brand: '' };
  if (has(text, BEST)) return { intent: 'Best / Review', brand: '' };
  if (has(text, QUESTION)) return { intent: 'Question', brand: '' };
  if (has(text, HOWTO)) return { intent: 'How-to', brand: '' };
  if (has(text, CONCERN)) return { intent: 'Concern', brand: '' };
  if (has(text, INGREDIENT)) return { intent: 'Ingredient', brand: '' };
  return { intent: 'Generic', brand: '' };
}

const siteKey = u => String(u ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const colLetter = i => { let n = i + 1, out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };
const cfg = $('Validate').first().json;
const tabValues = $('Read Tab').first().json.values ?? [];
if (!tabValues.length) throw new Error('The tab "' + cfg.tab + '" is empty or was not found.');
const header = tabValues[0].map(h => String(h ?? '').trim());
const lower = header.map(h => h.toLowerCase());
const kwCol = lower.indexOf('keyword');
if (kwCol < 0) throw new Error('No "Keyword" column in "' + cfg.tab + '".');
const webCol = lower.indexOf('website');
let intentCol = lower.indexOf('intent');
let brandCol = lower.indexOf('brand');
let next = header.length;
while (next > 0 && !header[next - 1]) next--;
if (intentCol < 0) intentCol = next++;
if (brandCol < 0) brandCol = next++;

// Brand list: Website Input (website + Brand column, domain name when blank) plus any brands sent in the request.
const siteRows = $('Read Website Input').first().json.values ?? [];
const sh = (siteRows[0] ?? []).map(h => String(h ?? '').trim().toLowerCase());
const sw = Math.max(0, sh.indexOf('website')), sb = sh.indexOf('brand');
const brandRows = [];
for (const r of siteRows.slice(1)) {
  const site = siteKey(r[sw]);
  if (!site) continue;
  const named = sb >= 0 ? String(r[sb] ?? '').trim() : '';
  const fallback = site.split('.')[0].replace(/^(the|get|try|my|shop)(?=[a-z]{4,})/, '');
  brandRows.push({ name: named || fallback, site });
}
for (const part of cfg.extraBrands) brandRows.push({ name: part, site: '' });
const index = makeBrandIndex(brandRows);

const intents = [], brands = [], counts = {};
const preview = [];
for (let i = 0; i < tabValues.length; i++) {
  if (i === 0) { intents.push(['Intent']); brands.push(['Brand']); continue; }
  const row = tabValues[i];
  const keyword = row[kwCol];
  const existingIntent = String(row[intentCol] ?? '').trim();
  const existingBrand = String(row[brandCol] ?? '').trim();
  if (!String(keyword ?? '').trim()) { intents.push(['']); brands.push(['']); continue; }
  if (!cfg.overwrite && existingIntent) { intents.push([existingIntent]); brands.push([existingBrand]); counts[existingIntent] = (counts[existingIntent] || 0) + 1; continue; }
  const result = classify(keyword, webCol >= 0 ? row[webCol] : '', index);
  intents.push([result.intent]); brands.push([result.brand]);
  counts[result.intent] = (counts[result.intent] || 0) + 1;
  if (preview.length < 25 && i % Math.max(1, Math.floor(tabValues.length / 25)) === 0) preview.push({ keyword, intent: result.intent, brand: result.brand });
}
const q = "'" + cfg.tab.replace(/'/g, "''") + "'";
const last = tabValues.length;
const intentRange = q + '!' + colLetter(intentCol) + '1:' + colLetter(intentCol) + last;
const brandRange = q + '!' + colLetter(brandCol) + '1:' + colLetter(brandCol) + last;
return [{ json: {
  dryRun: cfg.dryRun, sheetId: cfg.sheetId, tab: cfg.tab, rows: tabValues.length - 1, counts, preview,
  intentRange, brandRange, brandsKnown: index.length,
  writeBody: { valueInputOption: 'RAW', data: [{ range: intentRange, values: intents }, { range: brandRange, values: brands }] }
} }];
