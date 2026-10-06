const fs = require('node:fs/promises');
const path = require('node:path');

function requiredEnv(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) {
    const err = new Error(`${name} is not set`);
    err.code = 'ENV_MISSING';
    throw err;
  }
  return v;
}

function normalizeStoreUrl(storeUrl) {
  return String(storeUrl).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function roundToCents(n) {
  return Math.round(n * 100) / 100;
}

function fmtPrice(n) {
  return roundToCents(n).toFixed(2);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/["\r\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function shopifyRequest(restPath, { method = 'GET', body } = {}) {
  const store = normalizeStoreUrl(requiredEnv('SHOPIFY_STORE_URL'));
  const token = requiredEnv('SHOPIFY_ADMIN_TOKEN');
  const apiVersion = String(process.env.SHOPIFY_API_VERSION || '2025-01').trim();
  const url = `https://${store}/admin/api/${apiVersion}${restPath}`;

  const headers = {
    'X-Shopify-Access-Token': token,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.errors || data?.error || `Shopify API error ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

async function listAllProducts() {
  const out = [];
  let sinceId = 0;
  for (;;) {
    const qs = `?limit=250&since_id=${sinceId}&status=any`;
    const data = await shopifyRequest(`/products.json${qs}`);
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) break;
    out.push(...products);
    sinceId = Number(products[products.length - 1].id) || sinceId;
    if (!sinceId) break;
  }
  return out;
}

async function main() {
  const factor = Number.parseFloat(String(process.env.PRICE_FACTOR || '1.10'));
  const apply = String(process.env.APPLY || '').trim() === '1';
  const throttleMs = Number.parseInt(String(process.env.THROTTLE_MS || '450'), 10);
  const updateCompareAt = String(process.env.UPDATE_COMPARE_AT || '').trim() === '1';

  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('Invalid PRICE_FACTOR');
  }

  const products = await listAllProducts();
  const updates = [];

  for (const p of products) {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    for (const v of variants) {
      const oldPrice = Number.parseFloat(String(v?.price || ''));
      if (!Number.isFinite(oldPrice) || oldPrice <= 0) continue;
      const newPrice = fmtPrice(oldPrice * factor);
      if (String(v.price) === newPrice) continue;

      let oldCompareAt = null;
      let newCompareAt = null;
      if (updateCompareAt && v?.compare_at_price != null && String(v.compare_at_price).trim() !== '') {
        const oc = Number.parseFloat(String(v.compare_at_price));
        if (Number.isFinite(oc) && oc > 0) {
          oldCompareAt = fmtPrice(oc);
          newCompareAt = fmtPrice(oc * factor);
        }
      }

      updates.push({
        productId: p.id,
        productTitle: p.title || '',
        variantId: v.id,
        sku: v.sku || '',
        oldPrice: fmtPrice(oldPrice),
        newPrice,
        oldCompareAt,
        newCompareAt,
      });
    }
  }

  const outDir = path.join(process.cwd(), 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const previewPath = path.join(outDir, 'price-update-preview.csv');
  const header = [
    'variant_id',
    'sku',
    'old_price',
    'new_price',
    'old_compare_at_price',
    'new_compare_at_price',
    'product_id',
    'product_title',
  ].join(',');
  const rows = updates.map((u) => [
    u.variantId,
    u.sku,
    u.oldPrice,
    u.newPrice,
    u.oldCompareAt ?? '',
    u.newCompareAt ?? '',
    u.productId,
    u.productTitle,
  ].map(csvEscape).join(','));
  await fs.writeFile(previewPath, [header, ...rows].join('\n'), 'utf8');

  console.log(`Gefundene Updates: ${updates.length}`);
  console.log(`Preview CSV: ${previewPath}`);
  console.log(`APPLY=${apply ? '1' : '0'}`);

  if (!apply) return;

  let ok = 0;
  for (let i = 0; i < updates.length; i += 1) {
    const u = updates[i];
    const body = { variant: { id: u.variantId, price: u.newPrice } };
    if (updateCompareAt && u.newCompareAt != null) body.variant.compare_at_price = u.newCompareAt;
    await shopifyRequest(`/variants/${u.variantId}.json`, { method: 'PUT', body });
    ok += 1;
    if (throttleMs) await sleep(throttleMs);
    if (ok % 50 === 0) console.log(`Aktualisiert: ${ok}/${updates.length}`);
  }

  console.log(`Fertig. Aktualisiert: ${ok}/${updates.length}`);
}

main().catch((err) => {
  const msg = err && err.message ? String(err.message) : String(err);
  console.error(msg);
  process.exitCode = 1;
});

