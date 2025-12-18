const express = require('express');
const cors = require('cors');
const db = require('./db');
const { errorHandler } = require('./middleware');
const authRoutes = require('./routes/auth');
const addressRoutes = require('./routes/addresses');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);

app.use(errorHandler);

const startServer = async () => {
  try {
    const client = await db.getClient();
    client.release();
    console.log('[DB] Connected successfully');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    console.error('[DB] Check DATABASE_URL in .env');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer();

module.exports = app;
