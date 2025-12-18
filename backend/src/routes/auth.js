const express = require('express');
const validator = require('validator');
const db = require('../db');
const auth = require('../auth');
const { authMiddleware } = require('../middleware');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, company_name, contact_person, phone, country, street, postal_code, city } = req.body;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!company_name || !contact_person || !phone || !country) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await auth.hashPassword(password);

    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, company_name, contact_person, phone, country) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, company_name, country',
      [email, passwordHash, company_name, contact_person, phone, country]
    );

    const user = userResult.rows[0];

    if (street && postal_code && city) {
      await db.query(
        'INSERT INTO addresses (user_id, address_type, street, postal_code, city, country, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [user.id, 'shipping', street, postal_code, city, country, true]
      );
    }

    const accessToken = auth.generateAccessToken(user);
    const refreshToken = auth.generateRefreshToken(user);
    await auth.saveRefreshToken(user.id, refreshToken);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        company_name: user.company_name,
        country: user.country,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const passwordValid = await auth.verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const accessToken = auth.generateAccessToken(user);
    const refreshToken = auth.generateRefreshToken(user);
    await auth.saveRefreshToken(user.id, refreshToken);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        company_name: user.company_name,
        contact_person: user.contact_person,
        country: user.country,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = auth.verifyRefreshTokenJWT(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const isValid = await auth.verifyRefreshToken(decoded.id, refreshToken);
    if (!isValid) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];

    const newAccessToken = auth.generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query('SELECT id, email, company_name, contact_person, phone, country FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
