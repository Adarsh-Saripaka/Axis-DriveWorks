import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cookieParser from "cookie-parser";
import { registerSuggestRoute } from "./lib/suggestRoute.js";
import { registerCarSpecsRoute } from "./lib/carSpecsRoute.js";
import { registerAuthRoutes } from "./lib/authRoute.js";
import { registerReservationsRoutes } from "./lib/reservationsRoute.js";
import { runMigrations } from "./lib/migrations.js";
import { slugify, makeSpecKey, resolveBrandSlug } from "./lib/slug.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable reverse proxy support for Render / load balancers
app.set("trust proxy", 1);

// HTTP compression for all JSON / API responses
app.use(compression());

// =============================================
// SECURITY MIDDLEWARE
// =============================================

// Helmet — comprehensive HTTP security headers (CSP, HSTS, X-Frame, etc.)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow static asset serving cross-origin
    contentSecurityPolicy: false // API server only
  })
);

// CORS — strict origin allowlist with explicit methods & headers
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// Request size limiting & cookie parsing
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Input sanitization middleware
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
// STATIC ASSETS (Mounted before rate limiter)
// =============================================

const assetsPath = path.join(__dirname, "data", "axisdriveworks-3d-assets");
app.use(
  "/assets",
  express.static(assetsPath, {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=604800");
    }
  })
);

// =============================================
// SLIDING WINDOW RATE LIMITER (Tiered)
// =============================================

const rateBuckets = new Map(); // IP:tier -> { timestamps: number[] }

const RATE_TIERS = {
  suggest: { limit: 60, windowMs: 60_000 },
  specs: { limit: 30, windowMs: 60_000 },
  search: { limit: 30, windowMs: 60_000 },
  images: { limit: 30, windowMs: 60_000 },
  reserve: { limit: 10, windowMs: 60_000 },
  general: { limit: 60, windowMs: 60_000 }
};

function getTierForPath(urlPath) {
  if (urlPath.startsWith("/api/suggest")) return "suggest";
  if (urlPath.startsWith("/api/car-specs")) return "specs";
  if (urlPath.startsWith("/api/search")) return "search";
  if (urlPath.startsWith("/api/images")) return "images";
  if (urlPath.startsWith("/api/reserve") || urlPath.startsWith("/api/reservations")) return "reserve";
  return "general";
}

function slidingWindowRateLimit(req, res, next) {
  const ip = req.ip;
  const tier = getTierForPath(req.path);
  const { limit, windowMs } = RATE_TIERS[tier] || RATE_TIERS.general;
  const now = Date.now();
  const bucketKey = `${ip}:${tier}`;

  if (!rateBuckets.has(bucketKey)) {
    rateBuckets.set(bucketKey, { timestamps: [] });
  }

  const bucket = rateBuckets.get(bucketKey);
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

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
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < 120_000);
    if (bucket.timestamps.length === 0) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

    // Run unified migrations (only place tables and schemas are created/updated)
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
// ROUTES
// =============================================

app.get("/", (_req, res) => {
  res.json({
    name: "Axis DriveWorks API",
    version: "1.0.0",
    status: dataReady ? "operational" : "loading",
    endpoints: {
      suggest: "/api/suggest?q={query}",
      specs: "/api/car-specs?brand={brand}&model={model}",
      brandCars: "/api/brand/:brand/cars",
      reserve: "/api/reserve",
      reservationsLookup: "/api/reservations/lookup",
      reservations: "/api/reservations",
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

// Register public car catalog and search routes
registerSuggestRoute(app, () => db, () => dataReady);
registerCarSpecsRoute(app, () => db, () => dataReady);

// Register authentication routes (Google OAuth / Firebase token exchange + hardened cookies)
registerAuthRoutes(app, () => db, () => dataReady);

// Register reservations routes
registerReservationsRoutes(app, () => db, () => dataReady);

// Paginated Brand Cars Endpoint with slug resolution & brand alias support
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
  const brandSlug = resolveBrandSlug(brand);

  try {
    const totalRow = await db.get(
      "SELECT COUNT(*) as count FROM car_names WHERE brand_slug = ? OR brand = ? COLLATE NOCASE",
      [brandSlug, brand]
    );
    const total = totalRow?.count || 0;

    const rows = await db.all(
      `SELECT id, brand, model, year_start, year_end, body_style, has_3d_model, model_3d_id, model_3d_label, brand_slug, model_slug
         FROM car_names
        WHERE brand_slug = ? OR brand = ? COLLATE NOCASE
        ORDER BY has_3d_model DESC, model ASC
        LIMIT ? OFFSET ?`,
      [brandSlug, brand, limit, offset]
    );

    const enhanced = rows.map((r) => ({
      ...r,
      brand_slug: r.brand_slug || slugify(r.brand),
      model_slug: r.model_slug || slugify(r.model),
      spec_key: makeSpecKey(r.brand, r.model),
    }));

    res.json({
      brand: rows[0]?.brand || brand,
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
  console.log(`🚗 Axis DriveWorks backend running on http://localhost:${PORT}`);
  console.log(`🔒 Security: Helmet + Tiered Rate Limiter + Per-Booking Token Auth`);
});
