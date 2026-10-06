const DEFAULT_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function getShopifyBaseUrl() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  if (!storeUrl) {
    const err = new Error('SHOPIFY_STORE_URL is not set');
    err.status = 500;
    throw err;
  }
  const normalized = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${normalized}`;
}

function getAccessToken() {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) {
    const err = new Error('SHOPIFY_ADMIN_TOKEN is not set');
    err.status = 500;
    throw err;
  }
  return token;
}

async function shopifyRequest(path, { method = 'GET', body } = {}) {
  const baseUrl = getShopifyBaseUrl();
  const url = `${baseUrl}/admin/api/${DEFAULT_API_VERSION}${path}`;

  const headers = {
    'X-Shopify-Access-Token': getAccessToken(),
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

async function getOrder(orderId) {
  if (!orderId || !Number.isFinite(Number(orderId))) {
    const err = new Error('Invalid orderId');
    err.status = 400;
    throw err;
  }
  const data = await shopifyRequest(`/orders/${orderId}.json?status=any`);
  return data.order;
}

module.exports = {
  getOrder,
};

