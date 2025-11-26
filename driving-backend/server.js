// File: driving-backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Client } = pkg;

const app = express();

// ---------------- Paths & Persistence ---------------- //
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const SUSPENSIONS_FILE = path.join(DATA_DIR, "suspensions.json"); // NEW: Separate suspensions storage
const inMemoryBookings = new Map();
const inMemorySuspensions = new Map(); // NEW: Store suspensions separately

const loadPersistedBookings = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const obj = JSON.parse(raw || "{}");
      Object.entries(obj).forEach(([date, arr]) => {
        inMemoryBookings.set(date, Array.isArray(arr) ? arr : []);
      });
      console.log(`[PERSIST] Loaded bookings from ${DATA_FILE}`);
    }
    
    // NEW: Load suspensions
    if (fs.existsSync(SUSPENSIONS_FILE)) {
      const raw = fs.readFileSync(SUSPENSIONS_FILE, "utf8");
      const obj = JSON.parse(raw || "{}");
      Object.entries(obj).forEach(([date, suspensions]) => {
        inMemorySuspensions.set(date, new Set(suspensions)); // Use Set for faster lookups
      });
      console.log(`[PERSIST] Loaded suspensions from ${SUSPENSIONS_FILE}`);
    }
  } catch (e) {
    console.warn("[PERSIST] load error", e.message);
  }
};

const persistBookings = () => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(Object.fromEntries(inMemoryBookings), null, 2),
      "utf8"
    );
    console.log(`[PERSIST] Saved bookings to ${DATA_FILE}`);
  } catch (e) {
    console.warn("[PERSIST] persist error", e.message);
  }
};

// NEW: Persist suspensions separately
const persistSuspensions = () => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const suspensionsObj = {};
    inMemorySuspensions.forEach((suspendedSlots, date) => {
      suspensionsObj[date] = Array.from(suspendedSlots);
    });
    fs.writeFileSync(
      SUSPENSIONS_FILE,
      JSON.stringify(suspensionsObj, null, 2),
      "utf8"
    );
    console.log(`[PERSIST] Saved suspensions to ${SUSPENSIONS_FILE}`);
  } catch (e) {
    console.warn("[PERSIST] suspensions error", e.message);
  }
};

loadPersistedBookings();

// ---------------- Utilities ---------------- //
const HOURS = ["07", "08", "09", "10", "11",  "12", "13", "14", "15", "16", "17"];

const computeSlots = (rows, date) => {
  const slots = {};
  HOURS.forEach((hour) => {
    const students = (rows || []).filter(
      (r) => String(r.hour).padStart(2, "0") === hour
    );
    
    // NEW: Check suspensions from separate storage
    const isSuspended = inMemorySuspensions.get(date)?.has(hour) || false;
    
    slots[hour] = {
      booked: students.length,
      available: Math.max(4 - students.length, 0),
      students: students.map((s) => s.student_name),
      permanentStudents: students.filter((s) => s.permanent).map((s) => s.student_name),
      suspended: isSuspended, // Use the correct suspension state
    };
  });
  return Object.entries(slots).map(([hour, val]) => ({ hour, capacity: 4, ...val }));
};

// ---------------- Middleware ---------------- //
app.use(express.json());
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Header inspection (catch 431)
app.use((req, res, next) => {
  try {
    const headersStr = JSON.stringify(req.headers || {});
    const headersLen = headersStr.length;
    const cookieLen = req.headers?.cookie?.length || 0;
    const MAX_HEADER_BYTES = 8192;
    if (headersLen > MAX_HEADER_BYTES) {
      console.warn(
        `[HEADER-INSPECT] headers-length=${headersLen} cookie-length=${cookieLen}`
      );
      return res.status(431).json({
        error: "Request Header Fields Too Large",
        message: "Clear cookies or use an incognito window.",
      });
    }
  } catch (e) {
    console.warn("[HEADER-INSPECT] error", e.message);
  }
  next();
});

// Debug logging
app.use((req, res, next) => {
  try {
    console.log(`[DEBUG] ${new Date().toISOString()} ${req.method} ${req.url}`);
  } catch {}
  next();
});

// ---------------- Database Setup ---------------- //
let client = null;
let DB_CONNECTED = false;

const initDB = async () => {
  try {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    DB_CONNECTED = true;
    console.log("✅ Connected to Neon DB");
    client.on("error", (err) => console.error("[PG CLIENT] error", err.message));
  } catch (err) {
    console.warn("[DB CONNECT] Using in-memory store (dev only)", err.message);
  }
};

// ---------------- Routes ---------------- //

// Health check
app.get("/health", (req, res) =>
  res.json({ ok: true, dbConnected: DB_CONNECTED, now: new Date().toISOString() })
);

// Get daily bookings
app.get("/admin/daily", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ success: false, message: "Missing date" });

  try {
    let rows = [];
    if (DB_CONNECTED && client) {
      try {
        const result = await client.query(
          "SELECT hour, student_name, permanent FROM bookings WHERE date=$1",
          [date]
        );
        rows = result.rows;
      } catch (dbErr) {
        console.error("[DB ERROR /admin/daily]", dbErr.message);
        rows = inMemoryBookings.get(date) || [];
      }
    } else {
      rows = inMemoryBookings.get(date) || [];
    }
    res.json(computeSlots(rows, date)); // Pass date to computeSlots
  } catch (err) {
    console.error("[ROUTE ERROR /admin/daily]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Book a student
app.post("/admin/book", async (req, res) => {
  const { date, hour, student_name, permanent } = req.body;
  if (!date || !hour || !student_name)
    return res.status(400).json({ success: false, message: "Missing fields" });
  const hourNorm = String(hour).padStart(2, "0");

  try {
    // NEW: Check if slot is suspended
    if (inMemorySuspensions.get(date)?.has(hourNorm)) {
      return res.json({ success: false, message: "Slot is suspended" });
    }

    let existingRows = [];
    if (DB_CONNECTED && client) {
      try {
        const existing = await client.query(
          "SELECT student_name FROM bookings WHERE date=$1 AND hour=$2",
          [date, hourNorm]
        );
        existingRows = existing.rows.map((r) => ({ student_name: r.student_name }));
      } catch (dbErr) {
        console.error("[DB ERROR /admin/book check]", dbErr.message);
        existingRows = (inMemoryBookings.get(date) || []).filter(
          (b) => String(b.hour).padStart(2, "0") === hourNorm
        );
      }
    } else {
      existingRows = (inMemoryBookings.get(date) || []).filter(
        (b) => String(b.hour).padStart(2, "0") === hourNorm
      );
    }

    if (existingRows.length >= 4)
      return res.json({ success: false, message: "Slot full" });
    if (existingRows.find((r) => r.student_name === student_name))
      return res.json({ success: false, message: "Student already booked" });

    if (DB_CONNECTED && client) {
      await client.query(
        "INSERT INTO bookings(date,hour,student_name,permanent) VALUES($1,$2,$3,$4)",
        [date, hourNorm, student_name, !!permanent]
      );
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      dateList.push({ hour: hourNorm, student_name, permanent: !!permanent });
      inMemoryBookings.set(date, dateList);
      persistBookings();
    }

    const rows = DB_CONNECTED && client
      ? (await client.query(
          "SELECT hour, student_name, permanent FROM bookings WHERE date=$1",
          [date]
        )).rows
      : inMemoryBookings.get(date) || [];

    res.json({ success: true, message: "Booking confirmed", slots: computeSlots(rows, date) });
  } catch (err) {
    console.error("[ROUTE ERROR /admin/book]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a booking
app.delete("/admin/book", async (req, res) => {
  let { date, hour, student_name } = req.body || {};
  date = date || req.query.date;
  hour = hour || req.query.hour;
  student_name = student_name || req.query.student_name;
  if (!date || !hour || !student_name)
    return res.status(400).json({ success: false, message: "Missing fields" });

  const hourNorm = String(hour).padStart(2, "0");
  try {
    if (DB_CONNECTED && client) {
      await client.query(
        "DELETE FROM bookings WHERE date=$1 AND hour=$2 AND student_name=$3",
        [date, hourNorm, student_name]
      );
    } else {
      const dateList = inMemoryBookings.get(date) || [];
      inMemoryBookings.set(
        date,
        dateList.filter(
          (b) => !(String(b.hour).padStart(2, "0") === hourNorm && b.student_name === student_name)
        )
      );
      persistBookings();
    }

    const rows = DB_CONNECTED && client
      ? (await client.query(
          "SELECT hour, student_name, permanent FROM bookings WHERE date=$1",
          [date]
        )).rows
      : inMemoryBookings.get(date) || [];

    res.json({ success: true, message: "Deleted booking", slots: computeSlots(rows, date) });
  } catch (err) {
    console.error("[ROUTE ERROR /admin/book DELETE]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Suspend / Unsuspend slot - FIXED VERSION
app.post("/admin/suspend", async (req, res) => {
  const { slotId, action, date } = req.body;
  if (!slotId || !action || !date)
    return res.status(400).json({ success: false, message: "Missing fields" });

  const hourNorm = String(slotId).padStart(2, "0");

  try {
    // Check if slot has students (for suspend action only)
    if (action === "suspend") {
      let existingStudents = [];
      if (DB_CONNECTED && client) {
        const result = await client.query(
          "SELECT student_name FROM bookings WHERE date=$1 AND hour=$2",
          [date, hourNorm]
        );
        existingStudents = result.rows;
      } else {
        existingStudents = (inMemoryBookings.get(date) || []).filter(
          (b) => String(b.hour).padStart(2, "0") === hourNorm
        );
      }
      
      if (existingStudents.length > 0) {
        return res.json({ 
          success: false, 
          message: "Cannot suspend slot with existing students" 
        });
      }
    }

    // Handle suspension state
    if (!inMemorySuspensions.has(date)) {
      inMemorySuspensions.set(date, new Set());
    }
    const dateSuspensions = inMemorySuspensions.get(date);

    if (action === "suspend") {
      dateSuspensions.add(hourNorm);
    } else if (action === "unsuspend") {
      dateSuspensions.delete(hourNorm);
    }
    
    persistSuspensions();

    res.json({ 
      success: true, 
      message: `Slot ${action}ed successfully` 
    });
  } catch (err) {
    console.error("[ROUTE ERROR /admin/suspend]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------------- Start Server ---------------- //
const PORT = process.env.PORT || 3002;

const startServer = async () => {
  await initDB();
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
};

startServer();

// ---------------- Global Error Handler ---------------- //
app.use((err, req, res, next) => {
  console.error("[ERROR HANDLER]", err);
  if (err?.status === 431)
    return res.status(431).json({ error: "Request Header Fields Too Large" });
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Server error" });
});