const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY address_type, is_default DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { address_type, street, postal_code, city, country, is_default } = req.body;

    if (!address_type || !['shipping', 'billing'].includes(address_type)) {
      return res.status(400).json({ error: 'Invalid address type' });
    }

    if (!street || !postal_code || !city || !country) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (is_default) {
      await db.query(
        'UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND address_type = $2',
        [req.user.id, address_type]
      );
    }

    const result = await db.query(
      'INSERT INTO addresses (user_id, address_type, street, postal_code, city, country, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.user.id, address_type, street, postal_code, city, country, is_default || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { street, postal_code, city, country, is_default } = req.body;

    const checkResult = await db.query(
      'SELECT address_type FROM addresses WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    const addressType = checkResult.rows[0].address_type;

    if (is_default) {
      await db.query(
        'UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND address_type = $2',
        [req.user.id, addressType]
      );
    }

    const result = await db.query(
      'UPDATE addresses SET street = $1, postal_code = $2, city = $3, country = $4, is_default = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
      [street, postal_code, city, country, is_default || false, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({ message: 'Address deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
