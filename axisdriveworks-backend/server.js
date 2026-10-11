import express from "express";
import cors from "cors";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import { registerSuggestRoute } from "./lib/suggestRoute.js";
import { registerCarSpecsRoute } from "./lib/carSpecsRoute.js";
import { runMigrations } from "./lib/migrations.js";
import { slugify, makeSpecKey } from "./lib/slug.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Session secret — in production, use a strong env var
const SESSION_SECRET = process.env.SESSION_SECRET || "axis-driveworks-secret-key-change-in-production";
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================
// SECURITY MIDDLEWARE
// =============================================

// Helmet — comprehensive HTTP security headers (CSP, HSTS, X-Frame, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow static asset serving cross-origin
  contentSecurityPolicy: false // Disable CSP for API server (frontend handles its own)
}));

// CORS — strict origin allowlist with explicit methods & headers
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      process.env.FRONTEND_URL,
      "https://axis-driveworks-ui.onrender.com"
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// Request size limiting — prevent payload bombs
app.use(express.json({ limit: "10kb" }));

// Input sanitization middleware — strip HTML/script from all string body fields
function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.replace(/<[^>]*>/g, "").trim();
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      value[key] = sanitizeValue(value[key]);
    }
  }
  return value;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    sanitizeValue(req.body);
  }
  next();
});

// =============================================
// SLIDING WINDOW RATE LIMITER (Tiered)
// =============================================

const rateBuckets = new Map(); // IP -> { timestamps: number[] }

const RATE_TIERS = {
  suggest: { limit: 60, windowMs: 60_000 },
  specs: { limit: 30, windowMs: 60_000 },
  search: { limit: 30, windowMs: 60_000 },
  images: { limit: 30, windowMs: 60_000 },
  reserve: { limit: 10, windowMs: 60_000 },
  auth: { limit: 15, windowMs: 60_000 },
  general: { limit: 60, windowMs: 60_000 }
};

function getTierForPath(path) {
  if (path.startsWith("/api/suggest")) return "suggest";
  if (path.startsWith("/api/car-specs")) return "specs";
  if (path.startsWith("/api/search")) return "search";
  if (path.startsWith("/api/images")) return "images";
  if (path.startsWith("/api/reserve") || path.startsWith("/api/reservations")) return "reserve";
  if (path.startsWith("/api/auth")) return "auth";
  return "general";
}

function slidingWindowRateLimit(req, res, next) {
  const ip = req.ip;
  const tier = getTierForPath(req.path);
  const { limit, windowMs } = RATE_TIERS[tier];
  const now = Date.now();
  const bucketKey = `${ip}:${tier}`;

  if (!rateBuckets.has(bucketKey)) {
    rateBuckets.set(bucketKey, { timestamps: [] });
  }

  const bucket = rateBuckets.get(bucketKey);
  // Remove timestamps outside the current window
  bucket.timestamps = bucket.timestamps.filter(ts => now - ts < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldestInWindow = bucket.timestamps[0];
    const resetMs = windowMs - (now - oldestInWindow);

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetMs / 1000));
    res.setHeader("Retry-After", Math.ceil(resetMs / 1000));
    return res.status(429).json({
      error: "Too many requests. Try again later.",
      retryAfter: Math.ceil(resetMs / 1000)
    });
  }

  bucket.timestamps.push(now);
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", limit - bucket.timestamps.length);
  next();
}

app.use(slidingWindowRateLimit);

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter(ts => now - ts < 120_000);
    if (bucket.timestamps.length === 0) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

// =============================================
// STATIC ASSETS (3D Models)
// =============================================

const assetsPath = path.join(__dirname, "data", "axisdriveworks-3d-assets");
app.use("/assets", express.static(assetsPath));

console.log("🛠️  Assets being served from:", assetsPath);

// Request logging (development)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    next();
  });
}

// =============================================
// DATABASE
// =============================================

import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;
let dataReady = false;

async function initDB() {
  try {
    const dbPath = path.join(__dirname, "data", "cardata.sqlite");
    if (!fs.existsSync(dbPath)) {
      console.error(`❌ ERROR: SQLite database not found at ${dbPath}`);
      console.log("Please run 'node scripts/seedCarNames.js' first.");
      return;
    }

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Auto-create reservations table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        car_id INTEGER,
        car_brand TEXT,
        car_model TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        date TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create index on email for scoped queries
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email)`);

    // Run migrations for specs and counter tables
    await runMigrations(db);

    dataReady = true;
    console.log(`✅ SQLite Database connected!`);
    console.log(`📡 Server active at: http://localhost:${PORT}`);
    console.log("-----------------------------------------");
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  }
}

initDB();

// =============================================
// SESSION AUTH (Email-based, HMAC-SHA256)
// =============================================

function generateSessionToken(email) {
  const payload = JSON.stringify({
    email: email.toLowerCase().trim(),
    exp: Date.now() + SESSION_EXPIRY_MS,
    iat: Date.now()
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");

  // Timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp < Date.now()) return null; // Token expired
    return payload;
  } catch {
    return null;
  }
}

// Session middleware — extracts and validates auth token
function requireSession(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please provide your email to access bookings." });
  }

  const token = authHeader.slice(7);
  const session = verifySessionToken(token);

  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session. Please re-authenticate with your email." });
  }

  req.userEmail = session.email;
  next();
}

// Email validation helper
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// =============================================
// ROUTES
// =============================================

app.get("/", (_req, res) => {
  res.json({
    name: "Axis DriveWorks API",
    version: "3.0.0 (Secured)",
    status: dataReady ? "operational" : "loading",
    endpoints: {
      suggest: "/api/suggest?q={query}",
      specs: "/api/car-specs?brand={brand}&model={model}",
      images: "/api/images?q={query}",
      auth: "/api/auth/session",
      health: "/health"
    }
  });
});

app.get("/health", (_req, res) => {
  if (dataReady) {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  } else {
    res.status(503).json({ status: "unavailable", message: "Database not ready" });
  }
});

// --- Auth ---

app.post("/api/auth/session", (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  const token = generateSessionToken(email);
  res.json({
    token,
    email: email.toLowerCase().trim(),
    expiresIn: SESSION_EXPIRY_MS / 1000 // seconds
  });
});

// --- Car Data (Public) ---

registerSuggestRoute(app, () => db, () => dataReady);
registerCarSpecsRoute(app, () => db, () => dataReady);

// Paginated Brand Cars Endpoint
app.get("/api/brand/:brand/cars", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });

  const brand = String(req.params.brand || "").trim();
  if (!brand || brand.length > 50) {
    return res.status(400).json({ error: "Invalid brand parameter." });
  }

  const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    const totalRow = await db.get(
      "SELECT COUNT(*) as count FROM car_names WHERE brand = ? COLLATE NOCASE",
      [brand]
    );
    const total = totalRow?.count || 0;

    const rows = await db.all(
      `SELECT id, brand, model, year_start, year_end, body_style, has_3d_model, model_3d_id, model_3d_label
         FROM car_names
        WHERE brand = ? COLLATE NOCASE
        ORDER BY has_3d_model DESC, model ASC
        LIMIT ? OFFSET ?`,
      [brand, limit, offset]
    );

    const enhanced = rows.map((r) => ({
      ...r,
      brand_slug: slugify(r.brand),
      model_slug: slugify(r.model),
      spec_key: makeSpecKey(r.brand, r.model),
    }));

    res.json({
      brand,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      cars: enhanced
    });
  } catch (err) {
    console.error("Brand cars query failed:", err);
    res.status(500).json({ error: "Failed to fetch brand cars." });
  }
});




// --- Reservations (Authenticated + Scoped by Email) ---

app.post("/api/reserve", requireSession, async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });

  const { car_id, car_brand, car_model, name, date } = req.body;
  const email = req.userEmail; // From session — can't be spoofed

  if (!name || !date) {
    return res.status(400).json({ error: "Missing required fields (name, date)." });
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }

  // Prevent booking in the past
  const bookingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    return res.status(400).json({ error: "Cannot book a test drive in the past." });
  }

  try {
    const result = await db.run(
      "INSERT INTO reservations (car_id, car_brand, car_model, name, email, date) VALUES (?, ?, ?, ?, ?, ?)",
      [car_id || null, car_brand || "", car_model || "", name, email, date]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error("Reservation error:", err);
    res.status(500).json({ error: "Failed to create reservation." });
  }
});

// Get user's own reservations only
app.get("/api/reservations", requireSession, async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    const reservations = await db.all(
      "SELECT * FROM reservations WHERE email = ? ORDER BY id DESC",
      req.userEmail
    );
    res.json(reservations);
  } catch (err) {
    console.error("Reservations query error:", err);
    res.status(500).json({ error: "Failed to fetch reservations." });
  }
});

// Mark user's own reservation as complete
app.put("/api/reservations/:id/complete", requireSession, async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) return res.status(400).json({ error: "Invalid reservation ID." });

  try {
    // Only allow completing own reservations
    const reservation = await db.get(
      "SELECT * FROM reservations WHERE id = ? AND email = ?",
      [id, req.userEmail]
    );

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found or access denied." });
    }

    await db.run("UPDATE reservations SET completed = 1 WHERE id = ?", id);
    res.json({ success: true });
  } catch (err) {
    console.error("Complete reservation error:", err);
    res.status(500).json({ error: "Failed to update reservation." });
  }
});

// Clear only user's own completed reservations
app.delete("/api/reservations/completed", requireSession, async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    await db.run(
      "DELETE FROM reservations WHERE completed = 1 AND email = ?",
      req.userEmail
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Delete completed error:", err);
    res.status(500).json({ error: "Failed to delete completed reservations." });
  }
});

// =============================================
// GLOBAL ERROR HANDLER
// =============================================

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// =============================================
// START SERVER
// =============================================

app.listen(PORT, () => {
  console.log(`🚗 Axis DriveWorks backend v3.0 running on http://localhost:${PORT}`);
  console.log(`🔒 Security: Helmet + Tiered Rate Limiter + Session Auth`);
});
