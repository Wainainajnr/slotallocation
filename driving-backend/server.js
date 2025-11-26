// File: c:\driving-school-booking\driving-backend\server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();
const { Client } = pkg;

const app = express();

// ---------------- Header-inspection middleware ---------------- //
// Safer: do not modify incoming headers. Log header sizes and, when they
// exceed a configured threshold, return a clear 431 JSON response so the
// client can surface useful guidance. This replaces the previous cookie-
// trimming behavior which could silently break auth flows.
app.use((req, res, next) => {
  try {
    const headersStr = JSON.stringify(req.headers || {});
    const headersLen = headersStr.length;
    const cookieLen = (req.headers && req.headers.cookie) ? req.headers.cookie.length : 0;
    const MAX_HEADER_BYTES = 8192; // 8 KB default limit — tune as needed

    if (headersLen > MAX_HEADER_BYTES) {
      console.warn(`[HEADER-INSPECT] Large headers detected: headers-length=${headersLen} cookie-length=${cookieLen} for ${req.method} ${req.url}`);
      return res.status(431).json({
        error: 'Request Header Fields Too Large',
        message: 'Request headers exceed server limits. Try clearing cookies or using an incognito window.',
        headersLen,
        cookieLen
      });
    }
  } catch (e) {
    console.warn('[HEADER-INSPECT] error computing header sizes', e && e.message);
  }
  next();
});

// Allow required headers and methods explicitly to avoid preflight surprises
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ---------------- Debug middleware ---------------- //
// Temporary: log header sizes to help diagnose HTTP 431 (Request Header Fields Too Large)
app.use((req, res, next) => {
  try {
    const headersStr = JSON.stringify(req.headers || {});
    const headersLen = headersStr.length;
    const cookieLen = (req.headers && req.headers.cookie) ? req.headers.cookie.length : 0;
    console.log(`[DEBUG] ${new Date().toISOString()} -> ${req.method} ${req.url} headers-length=${headersLen} cookie-length=${cookieLen}`);
  } catch (err) {
    console.warn('[DEBUG] failed to compute header sizes', err && err.message);
  }
  next();
});

// Diagnostic route to check header sizes from the client quickly
app.get('/diagnose-headers', (req, res) => {
  try {
    const headers = req.headers || {};
    const headersLen = JSON.stringify(headers).length;
    const cookieLen = headers.cookie ? headers.cookie.length : 0;
    return res.json({ ok: true, headersLen, cookieLen, headersSample: { cookie: headers.cookie ? headers.cookie.slice(0, 500) : '' } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Health endpoint for quick checks
app.get('/health', (req, res) => {
  return res.json({ ok: true, dbConnected: !!DB_CONNECTED, now: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

// Connect to Neon Postgres
let client = null;
let DB_CONNECTED = false;
try {
  client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  DB_CONNECTED = true;
  console.log("✅ Connected to Neon DB");

  // Listen for client errors so they don't crash the process unexpectedly
  client.on('error', (err) => {
    console.error('[PG CLIENT] error', err && err.message);
  });
} catch (err) {
  console.error('[DB CONNECT] failed to connect to Postgres:', err && (err.message || err));
  console.warn('[DB CONNECT] Falling back to in-memory store for bookings (development only)');
}

// Simple in-memory fallback store when DB is unavailable (development/testing)
const inMemoryBookings = new Map(); // date -> [{ hour: '07', student_name, permanent }]

// Persist in-memory bookings to a JSON file so dev data survives restarts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');

const loadPersistedBookings = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const obj = JSON.parse(raw || '{}');
      Object.entries(obj).forEach(([date, arr]) => {
        inMemoryBookings.set(date, Array.isArray(arr) ? arr : []);
      });
      console.log(`[PERSIST] Loaded persisted bookings from ${DATA_FILE}`);
    }
  } catch (e) {
    console.warn('[PERSIST] failed to load persisted bookings', e && e.message);
  }
};

const persistBookings = () => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = Object.fromEntries(inMemoryBookings);
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`[PERSIST] Saved bookings to ${DATA_FILE}`);
  } catch (e) {
    console.warn('[PERSIST] failed to persist bookings', e && e.message);
  }
};

// Load on startup
loadPersistedBookings();

// ---------------- Routes ---------------- //

// GET /admin/daily?date=YYYY-MM-DD
app.get("/admin/daily", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ success: false, message: "Missing date" });

  try {
    let rows = [];
    if (DB_CONNECTED && client) {
      const result = await client.query(
        `SELECT hour, student_name, permanent FROM bookings WHERE date = $1`,
        [date]
      );
      // log rows for debugging
      console.log(`[DB] fetched ${result.rows.length} booking rows for date=${date}`);
      rows = result.rows;
    } else {
      // read from in-memory store
      rows = inMemoryBookings.get(date) || [];
      console.log(`[IN-MEMORY] fetched ${rows.length} booking rows for date=${date}`);
    }

    const hours = ["07","08","09","10","11","13","14","15","16","17"];
    const slots = {};

    hours.forEach(hour => {
      const students = (rows || []).filter(r => String(r.hour).padStart(2, "0") === hour);
      const bookedStudents = students.map(s => s.student_name);
      const permanentStudents = students.filter(s => s.permanent).map(s => s.student_name);

      slots[hour] = {
        booked: bookedStudents.length,
        available: Math.max(4 - bookedStudents.length, 0),
        students: bookedStudents,
        permanentStudents
      };
    });

    // Return as an array for easier frontend handling
    const slotsArray = Object.entries(slots).map(([hour, val]) => ({ hour, capacity: 4, ...val }));

    res.json(slotsArray);
  } catch (err) {
    console.error("Error fetching daily slots:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /admin/book
app.post("/admin/book", async (req, res) => {
  const { date, hour, student_name, permanent } = req.body;
  if (!date || !hour || !student_name) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  // Log incoming body for debugging
  console.log(`[INCOMING POST] /admin/book - body:`, req.body);

  // Normalize hour to two-digit string (e.g. '07') to keep storage/query consistent
  const hourNorm = String(hour).padStart(2, '0');

  try {
    let existingRows = [];
    if (DB_CONNECTED && client) {
      const existing = await client.query(
        `SELECT student_name FROM bookings WHERE date = $1 AND hour = $2`,
        [date, hourNorm]
      );
      existingRows = existing.rows.map(r => ({ student_name: r.student_name }));
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      existingRows = dateList.filter(b => String(b.hour).padStart(2, '0') === hourNorm);
    }

    if (existingRows.length >= 4) {
      return res.json({ success: false, message: "Slot full" });
    }

    if (existingRows.find(r => r.student_name === student_name)) {
      return res.json({ success: false, message: "Student already booked" });
    }

    // Insert new booking
    if (DB_CONNECTED && client) {
      await client.query(
        `INSERT INTO bookings(date, hour, student_name, permanent) VALUES($1, $2, $3, $4)`,
        [date, hourNorm, student_name, permanent || false]
      );
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      dateList.push({ hour: hourNorm, student_name, permanent: !!permanent });
      inMemoryBookings.set(date, dateList);
      // persist to disk so dev data survives restarts
      persistBookings();
    }

    // Log current in-memory state for debugging (only when DB not connected)
    if (!DB_CONNECTED) {
      try {
        console.log(`[IN-MEMORY BOOKINGS] for date=${date}:`, JSON.stringify(inMemoryBookings.get(date) || []));
      } catch (e) {
        console.warn('[IN-MEMORY BOOKINGS] error serializing bookings', e && e.message);
      }
    }

    // After booking, compute updated slots from DB or in-memory store
    let rows = [];
    if (DB_CONNECTED && client) {
      const result = await client.query(
        `SELECT hour, student_name, permanent FROM bookings WHERE date = $1`,
        [date]
      );
      rows = result.rows;
    } else {
      rows = inMemoryBookings.get(date) || [];
    }

    const hours = ["07","08","09","10","11","13","14","15","16","17"];
    const slots = {};
    hours.forEach(h => {
      const students = (rows || []).filter(r => String(r.hour).padStart(2, "0") === h).map(r => r.student_name);
      const permanentStudents = (rows || []).filter(r => String(r.hour).padStart(2, "0") === h && r.permanent).map(r => r.student_name);
      slots[h] = {
        booked: students.length,
        available: Math.max(4 - students.length, 0),
        students,
        permanentStudents
      };
    });

    const slotsArray = Object.entries(slots).map(([hour, val]) => ({ hour, capacity: 4, ...val }));
    res.json({ success: true, message: "Booking confirmed", slots: slotsArray });
  } catch (err) {
    console.error("Error booking slot:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /admin/book  - remove a student booking (admin action)
app.delete('/admin/book', async (req, res) => {
  // Accept DELETE body or query params for flexibility
  console.log(`[INCOMING DELETE] /admin/book - headers:`, req.headers);
  console.log(`[INCOMING DELETE] /admin/book - body:`, req.body);
  let { date, hour, student_name } = req.body || {};
  // fallback to query params (some clients strip body for DELETE)
  if (!date || !hour || !student_name) {
    date = date || req.query.date;
    hour = hour || req.query.hour;
    student_name = student_name || req.query.student_name;
  }

  if (!date || !hour || !student_name) {
    return res.status(400).json({ success: false, message: 'Missing fields for delete' });
  }

  const hourNorm = String(hour).padStart(2, '0');

  try {
    if (DB_CONNECTED && client) {
      await client.query(
        `DELETE FROM bookings WHERE date = $1 AND hour = $2 AND student_name = $3`,
        [date, hourNorm, student_name]
      );
      console.log(`[DB] deleted booking ${student_name} ${date} ${hourNorm}`);
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      const filtered = dateList.filter(b => !(String(b.hour).padStart(2,'0') === hourNorm && b.student_name === student_name));
      inMemoryBookings.set(date, filtered);
      persistBookings();
      console.log(`[IN-MEMORY] deleted booking ${student_name} ${date} ${hourNorm}`);
    }

    // return updated slots
    let rows = [];
    if (DB_CONNECTED && client) {
      const result = await client.query(
        `SELECT hour, student_name, permanent FROM bookings WHERE date = $1`,
        [date]
      );
      rows = result.rows;
    } else {
      rows = inMemoryBookings.get(date) || [];
    }

    const hours = ["07","08","09","10","11","13","14","15","16","17"];
    const slots = {};
    hours.forEach(h => {
      const students = (rows || []).filter(r => String(r.hour).padStart(2, '0') === h).map(r => r.student_name);
      const permanentStudents = (rows || []).filter(r => String(r.hour).padStart(2, '0') === h && r.permanent).map(r => r.student_name);
      slots[h] = {
        booked: students.length,
        available: Math.max(4 - students.length, 0),
        students,
        permanentStudents
      };
    });

    const slotsArray = Object.entries(slots).map(([hour, val]) => ({ hour, capacity: 4, ...val }));
    return res.json({ success: true, message: 'Deleted booking', slots: slotsArray });
  } catch (err) {
    console.error('Error deleting booking:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---------------- Start Server ---------------- //
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Central error handler (returns helpful JSON for 431 and other errors)
app.use((err, req, res, next) => {
  console.error('[ERROR HANDLER]', err && err.stack ? err.stack : err);
  if (err && err.status === 431) {
    return res.status(431).json({ error: 'Request Header Fields Too Large', message: 'Try clearing cookies or use an incognito window.' });
  }
  const status = (err && err.status) || 500;
  res.status(status).json({ error: err && err.message ? err.message : 'Server error' });
});