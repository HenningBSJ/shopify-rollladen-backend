const express = require('express');
const QRCode = require('qrcode');
const { monitorHttpAuthMiddleware } = require('../middleware');

const router = express.Router();
router.use(monitorHttpAuthMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) return res.status(400).send('Missing text');

    const svg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      scale: 4,
    });

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
