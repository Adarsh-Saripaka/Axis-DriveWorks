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
import { assertAdminTokenConfigured, csrfGuard } from "./lib/security.js";

dotenv.config();

// Assert ADMIN_TOKEN strength and prevent insecure defaults
assertAdminTokenConfigured();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy configuration: only trust reverse proxy if explicitly configured or running in production behind a proxy
const trustProxySetting = process.env.TRUST_PROXY;
if (trustProxySetting === "true" || trustProxySetting === "1") {
  app.set("trust proxy", 1);
} else if (process.env.NODE_ENV === "production" && trustProxySetting !== "false") {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", false);
}

// HTTP compression for all JSON / API responses
app.use(compression());

// =============================================
// SECURITY MIDDLEWARE
// =============================================

// Helmet — comprehensive HTTP security headers with strict Content Security Policy & no-referrer
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          process.env.NODE_ENV === "production" ? "'self'" : "'self' 'unsafe-eval' 'unsafe-inline'",
          "https://apis.google.com",
          "https://*.firebaseapp.com"
        ],
        connectSrc: [
          "'self'",
          "blob:",
          "http://localhost:5000",
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:3000",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          process.env.FRONTEND_URL
        ].filter(Boolean),
        workerSrc: ["'self'", "blob:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://lh3.googleusercontent.com",
          "https://images.unsplash.com",
          "https://images.pexels.com",
          "https://*.wikimedia.org",
          "https:"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);

// CORS — strict origin allowlist with explicit methods & headers (including X-Requested-With)
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true
  })
);

// Request size limiting & cookie parsing (replaces naive regex stripping with schema validation)
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Cache-Control: ensure API responses containing sensitive user data are not cached (Fix #4.3)
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

// Reject query-string tokens globally across /api (Fix #4.1)
app.use("/api", (req, res, next) => {
  if (req.query && (req.query.token || req.query.manage_token || req.query.session_token)) {
    return res.status(400).json({
      error: "Security violation: Tokens must never be provided in the URL query string."
    });
  }
  next();
});

// Anti-CSRF protection for mutating API requests (Fix #5.3)
app.use("/api", csrfGuard);

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

const rateBuckets = new Map(); // clientKey:tier -> { timestamps: number[] }
const MAX_RATE_BUCKETS = 10000;

const RATE_TIERS = {
  suggest: { limit: 60, windowMs: 60_000 },
  specs: { limit: 30, windowMs: 60_000 },
  report: { limit: 10, windowMs: 60 * 60_000 }, // Max 10 reports per hour
  search: { limit: 30, windowMs: 60_000 },
  images: { limit: 30, windowMs: 60_000 },
  reserve: { limit: 10, windowMs: 60_000 },
  general: { limit: 60, windowMs: 60_000 }
};

function getTierForPath(urlPath) {
  if (urlPath.startsWith("/api/car-specs/report")) return "report";
  if (urlPath.startsWith("/api/suggest")) return "suggest";
  if (urlPath.startsWith("/api/car-specs")) return "specs";
  if (urlPath.startsWith("/api/search")) return "search";
  if (urlPath.startsWith("/api/images")) return "images";
  if (urlPath.startsWith("/api/reserve") || urlPath.startsWith("/api/reservations")) return "reserve";
  return "general";
}

/**
 * Derives rate limit client key: Prioritizes authenticated user UID/session over shared IP.
 */
function getClientKey(req) {
  if (req.user?.uid) {
    return `u:${req.user.uid}`;
  }
  const sessionCookie = req.cookies?.adw_session;
  if (sessionCookie && typeof sessionCookie === "string") {
    return `s:${sessionCookie.slice(0, 16)}`;
  }
  const ip = req.ip || "unknown";
  return `ip:${ip}`;
}

function slidingWindowRateLimit(req, res, next) {
  const clientKey = getClientKey(req);
  const tier = getTierForPath(req.path);
  const { limit, windowMs } = RATE_TIERS[tier] || RATE_TIERS.general;
  const now = Date.now();
  const bucketKey = `${clientKey}:${tier}`;

  if (!rateBuckets.has(bucketKey)) {
    // Memory leak / exhaustion guard: if buckets exceed cap, evict oldest entries
    if (rateBuckets.size >= MAX_RATE_BUCKETS) {
      const keysToDelete = [];
      for (const [key, b] of rateBuckets.entries()) {
        if (!b.timestamps.length || now - b.timestamps[b.timestamps.length - 1] > windowMs) {
          keysToDelete.push(key);
        }
        if (keysToDelete.length >= 500) break;
      }
      for (const k of keysToDelete) rateBuckets.delete(k);
    }
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
