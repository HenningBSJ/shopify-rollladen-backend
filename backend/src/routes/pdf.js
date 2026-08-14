const express = require('express');
const { getOrder } = require('../shopify');
const { renderHtml } = require('../pdf/render');
const { createStorageProvider } = require('../pdf/storage');

const router = express.Router();
const storage = createStorageProvider();

function requirePdfApiKey(req, res, next) {
  const required = process.env.PDF_API_KEY;
  if (!required) return next();
  const given = req.header('x-api-key');
  if (!given || given !== required) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requirePdfApiKey);

router.get('/status', async (req, res, next) => {
  try {
    const orderId = Number(req.query.orderId);
    const types = ['invoice', 'packing_slip', 'production'];
    const results = {};
    for (const type of types) {
      const key = storage.getObjectKey({ orderId, type });
      results[type] = {
        exists: await storage.exists({ key }),
        url: `${(process.env.PDF_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/${key}`,
      };
    }
    res.json({ orderId, results });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const orderId = Number(req.body.orderId);
    const types = Array.isArray(req.body.types) && req.body.types.length
      ? req.body.types
      : [req.body.type].filter(Boolean);
    const normalizedTypes = (types && types.length) ? types : ['invoice', 'packing_slip', 'production'];

    const order = await getOrder(orderId);
    const out = {};

    for (const type of normalizedTypes) {
      const html = renderHtml({ type, order });
      const key = storage.getObjectKey({ orderId, type });
      const put = await storage.put({
        key,
        contentType: 'text/html; charset=utf-8',
        body: html,
      });
      out[type] = { key, url: put.url };
    }

    res.json({ orderId, documents: out });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

