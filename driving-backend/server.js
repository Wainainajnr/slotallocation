// Fixed Render-ready server.js
// - Uses Postgres (pg.Pool) for persistence (bookings + suspensions)
// - No local filesystem persistence (Render ephemeral FS)
// - Binds to process.env.PORT
// - Health check excluded from header-size 431 guard
// - Minimal debug logging behind NODE_ENV=development
// - Connection pooling and graceful shutdown

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const app = express();
const NODE_ENV = process.env.NODE_ENV || "production";
const DEBUG = NODE_ENV === "development";

// ---------------- Utilities ---------------- //
const HOURS = ["07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"];

const log = (...args) => {
  if (DEBUG) console.log(...args);
};

// ---------------- Database (pool) ---------------- //
let pool;
let DB_CONNECTED = false;

const initDB = async () => {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });

    // simple query to verify connection
    await pool.query("SELECT 1");
    DB_CONNECTED = true;
    console.log("✅ Connected to Postgres DB");

    // Ensure tables exist (safe to run on every start)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        hour VARCHAR(2) NOT NULL,
        student_name TEXT NOT NULL,
        permanent BOOLEAN DEFAULT FALSE,
        UNIQUE(date, hour, student_name)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suspensions (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        hour VARCHAR(2) NOT NULL,
        UNIQUE(date, hour)
      );
    `);

    pool.on('error', (err) => {
      console.error('[PG POOL ERROR]', err?.message || err);
      DB_CONNECTED = false;
    });
  } catch (err) {
    console.warn('[DB CONNECT] Could not connect to DB - running with in-memory fallback', err?.message || err);
    DB_CONNECTED = false;
  }
};

// In-memory fallback (no file writes) - ephemeral only
const inMemoryBookings = new Map(); // date -> [ { hour, student_name, permanent } ]
const inMemorySuspensions = new Map(); // date -> Set(hour)

const computeSlots = async (rows, date) => {
  const slots = {};
  HOURS.forEach((hour) => {
    const students = (rows || []).filter((r) => String(r.hour).padStart(2, '0') === hour);
    slots[hour] = {
      booked: students.length,
      available: Math.max(4 - students.length, 0),
      students: students.map((s) => s.student_name),
      permanentStudents: students.filter((s) => s.permanent).map((s) => s.student_name),
      suspended: false,
    };
  });
  return Object.entries(slots).map(([hour, val]) => ({ hour, capacity: 4, ...val }));
};

// ---------------- Middleware ---------------- //
app.use(express.json({ limit: '64kb' }));
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Header inspection (catch pathological cases) - ignore health check
app.use((req, res, next) => {
  try {
    if (req.path === '/health') return next();
    const headersStr = JSON.stringify(req.headers || {});
    const headersLen = headersStr.length;
    const cookieLen = req.headers?.cookie?.length || 0;
    const MAX_HEADER_BYTES = 64 * 1024; // increase threshold to be lenient on proxies
    if (headersLen > MAX_HEADER_BYTES) {
      console.warn(`[HEADER-INSPECT] headers-length=${headersLen} cookie-length=${cookieLen}`);
      return res.status(431).json({ error: 'Request Header Fields Too Large', message: 'Clear cookies or use an incognito window.' });
    }
  } catch (e) {
    log('[HEADER-INSPECT] error', e?.message || e);
  }
  next();
});

// Minimal debug logging
app.use((req, res, next) => {
  if (DEBUG) console.log(`[DEBUG] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ---------------- Routes ---------------- //
app.get('/health', async (req, res) => {
  res.json({ ok: true, dbConnected: DB_CONNECTED, now: new Date().toISOString() });
});

// Helper: load bookings for a date from DB or memory
const loadBookingsForDate = async (date) => {
  if (DB_CONNECTED && pool) {
    try {
      const result = await pool.query('SELECT hour, student_name, permanent FROM bookings WHERE date = $1', [date]);
      return result.rows;
    } catch (err) {
      console.error('[DB ERROR] loadBookingsForDate', err?.message || err);
      // fall through to memory
    }
  }
  return inMemoryBookings.get(date) || [];
};

const loadSuspensionsForDate = async (date) => {
  if (DB_CONNECTED && pool) {
    try {
      const result = await pool.query('SELECT hour FROM suspensions WHERE date = $1', [date]);
      return new Set(result.rows.map(r => String(r.hour).padStart(2, '0')));
    } catch (err) {
      console.error('[DB ERROR] loadSuspensionsForDate', err?.message || err);
    }
  }
  return inMemorySuspensions.get(date) || new Set();
};

app.get('/admin/daily', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ success: false, message: 'Missing date' });
  try {
    const rows = await loadBookingsForDate(date);
    const suspensionsSet = await loadSuspensionsForDate(date);
    // annotate suspended in computeSlots result
    const slots = await computeSlots(rows, date);
    // apply suspensions
    slots.forEach(s => { s.suspended = suspensionsSet.has(String(s.hour).padStart(2, '0')); });
    res.json(slots);
  } catch (err) {
    console.error('[ROUTE ERROR /admin/daily]', err?.message || err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/admin/book', async (req, res) => {
  const { date, hour, student_name, permanent } = req.body || {};
  if (!date || !hour || !student_name) return res.status(400).json({ success: false, message: 'Missing fields' });
  const hourNorm = String(hour).padStart(2, '0');

  try {
    const suspensionsSet = await loadSuspensionsForDate(date);
    if (suspensionsSet.has(hourNorm)) return res.json({ success: false, message: 'Slot is suspended' });

    let existingRows = await loadBookingsForDate(date);
    existingRows = existingRows.filter(r => String(r.hour).padStart(2, '0') === hourNorm || String(r.hour) === hourNorm);

    if (existingRows.length >= 4) return res.json({ success: false, message: 'Slot full' });
    if (existingRows.find(r => r.student_name === student_name)) return res.json({ success: false, message: 'Student already booked' });

    if (DB_CONNECTED && pool) {
      try {
        await pool.query('INSERT INTO bookings(date,hour,student_name,permanent) VALUES($1,$2,$3,$4)', [date, hourNorm, student_name, !!permanent]);
      } catch (dbErr) {
        // possible unique violation if raced; treat as conflict
        console.error('[DB ERROR /admin/book INSERT]', dbErr?.message || dbErr);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      dateList.push({ hour: hourNorm, student_name, permanent: !!permanent });
      inMemoryBookings.set(date, dateList);
    }

    const rows = await loadBookingsForDate(date);
    const suspensionsSetAfter = await loadSuspensionsForDate(date);
    const slots = await computeSlots(rows, date);
    slots.forEach(s => { s.suspended = suspensionsSetAfter.has(String(s.hour).padStart(2, '0')); });

    res.json({ success: true, message: 'Booking confirmed', slots });
  } catch (err) {
    console.error('[ROUTE ERROR /admin/book]', err?.message || err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/admin/book', async (req, res) => {
  let { date, hour, student_name } = req.body || {};
  date = date || req.query.date;
  hour = hour || req.query.hour;
  student_name = student_name || req.query.student_name;
  if (!date || !hour || !student_name) return res.status(400).json({ success: false, message: 'Missing fields' });
  const hourNorm = String(hour).padStart(2, '0');

  try {
    if (DB_CONNECTED && pool) {
      await pool.query('DELETE FROM bookings WHERE date=$1 AND hour=$2 AND student_name=$3', [date, hourNorm, student_name]);
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      inMemoryBookings.set(date, dateList.filter(b => !(String(b.hour).padStart(2,'0') === hourNorm && b.student_name === student_name)));
    }

    const rows = await loadBookingsForDate(date);
    const suspensionsSet = await loadSuspensionsForDate(date);
    const slots = await computeSlots(rows, date);
    slots.forEach(s => { s.suspended = suspensionsSet.has(String(s.hour).padStart(2, '0')); });

    res.json({ success: true, message: 'Deleted booking', slots });
  } catch (err) {
    console.error('[ROUTE ERROR /admin/book DELETE]', err?.message || err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/admin/suspend', async (req, res) => {
  const { slotId, action, date } = req.body || {};
  if (!slotId || !action || !date) return res.status(400).json({ success: false, message: 'Missing fields' });
  if (!['suspend','unsuspend'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });

  const hourNorm = String(slotId).padStart(2, '0');

  try {
    // Check if slot has students (for suspend action only)
    if (action === 'suspend') {
      const existingStudents = (await loadBookingsForDate(date)).filter(b => String(b.hour).padStart(2,'0') === hourNorm);
      if (existingStudents.length > 0) return res.json({ success: false, message: 'Cannot suspend slot with existing students' });
    }

    if (DB_CONNECTED && pool) {
      if (action === 'suspend') {
        await pool.query('INSERT INTO suspensions(date,hour) VALUES($1,$2) ON CONFLICT DO NOTHING', [date, hourNorm]);
      } else {
        await pool.query('DELETE FROM suspensions WHERE date=$1 AND hour=$2', [date, hourNorm]);
      }
    } else {
      if (!inMemorySuspensions.has(date)) inMemorySuspensions.set(date, new Set());
      const dateSet = inMemorySuspensions.get(date);
      if (action === 'suspend') dateSet.add(hourNorm);
      else dateSet.delete(hourNorm);
    }

    res.json({ success: true, message: `Slot ${action}ed successfully` });
  } catch (err) {
    console.error('[ROUTE ERROR /admin/suspend]', err?.message || err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---------------- Start Server ---------------- //
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await initDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

startServer();

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down server...');
  try {
    if (pool) await pool.end();
  } catch (e) {
    console.warn('Error closing DB pool', e?.message || e);
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR HANDLER]', err?.message || err);
  if (err?.status === 431) return res.status(431).json({ error: 'Request Header Fields Too Large' });
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || 'Server error' });
});
