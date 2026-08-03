import express from "express";
import cors from "cors";
import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// --- Security & middleware ---
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      process.env.FRONTEND_URL, // Dynamic URL for Render deployment
      "https://axis-driveworks-ui.onrender.com"
    ].filter(Boolean),
  })
);

app.use(express.json());

// --- Static Assets (3D Models) ---
// This allows the frontend to download the .glb files
const assetsPath = path.join(__dirname, "data", "axisdriveworks-3d-assets");
app.use("/assets", express.static(assetsPath));

console.log("🛠️  Assets being served from:", assetsPath);

// Log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Simple in-memory rate limiter (per IP, 60 req/min)
const rateMap = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateMap.set(ip, { start: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }
  next();
});

// Basic security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// --- Database ---
import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;
let dataReady = false;

async function initDB() {
  try {
    const dbPath = path.join(__dirname, "data", "cardata.sqlite");
    if (!fs.existsSync(dbPath)) {
      console.error(`❌ ERROR: SQLite database not found at ${dbPath}`);
      console.log("Please run 'node scripts/seedDatabase.js' first.");
      return;
    }

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    dataReady = true;
    console.log(`✅ SQLite Database connected!`);
    console.log(`📡 Server active at: http://localhost:${PORT}`);
    console.log("-----------------------------------------");
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  }
}

initDB();

// --- Routes ---

app.get("/", (req, res) => {
  res.json({
    name: "Axis DriveWorks API",
    version: "2.0.0 (SQLite Powered)",
    status: dataReady ? "operational" : "loading",
    endpoints: {
      search: "/api/search?q={query}",
      details: "/api/car/{id}",
      brands: "/api/brands",
      health: "/health"
    }
  });
});

app.get("/health", (req, res) => {
  if (dataReady) {
    res.status(200).send("OK");
  } else {
    res.status(503).send("Service Unavailable - Database Not Ready");
  }
});

app.get("/api/brands", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    const rows = await db.all("SELECT DISTINCT brand FROM cars ORDER BY brand");
    const uniqueBrands = rows.map(r => r.brand).filter(Boolean);
    res.json(uniqueBrands);
  } catch (err) {
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/search", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });

  const raw = (req.query.q || "").trim();

  // Validate: reject excessively long queries
  if (!raw) return res.json([]);
  if (raw.length > 100) return res.status(400).json({ error: "Query too long." });

  const words = raw.split(/\s+/).filter(Boolean);

  try {
    // Basic AND query approach: we require all words to match somewhere in the text
    let query = "SELECT * FROM cars WHERE ";
    let params = [];
    let conditions = [];

    for (const word of words) {
      conditions.push("(brand LIKE ? OR model LIKE ? OR year LIKE ? OR body_style LIKE ?)");
      const likeParam = `%${word}%`;
      params.push(likeParam, likeParam, likeParam, likeParam);
    }

    query += conditions.join(" AND ") + " LIMIT 35";
    
    const results = await db.all(query, params);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed." });
  }
});

app.get("/api/car/:id", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) return res.status(400).json({ error: "Invalid car ID." });

  try {
    const car = await db.get("SELECT * FROM cars WHERE id = ?", id);
    if (!car) return res.status(404).json({ error: "Car not found." });
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: "Database error." });
  }
});

// --- Reservations API ---

app.post("/api/reserve", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  
  const { car_id, car_brand, car_model, name, email, date } = req.body;
  if (!name || !email || !date) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  
  try {
    const result = await db.run(
      "INSERT INTO reservations (car_id, car_brand, car_model, name, email, date) VALUES (?, ?, ?, ?, ?, ?)",
      [car_id || null, car_brand, car_model, name, email, date]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create reservation." });
  }
});

app.get("/api/reservations", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    const reservations = await db.all("SELECT * FROM reservations ORDER BY id DESC");
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reservations." });
  }
});

app.put("/api/reservations/:id/complete", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    await db.run("UPDATE reservations SET completed = 1 WHERE id = ?", req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update reservation." });
  }
});

app.delete("/api/reservations/completed", async (req, res) => {
  if (!dataReady) return res.status(503).json({ error: "Database Loading" });
  try {
    await db.run("DELETE FROM reservations WHERE completed = 1");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete completed reservations." });
  }
});

// --- Global error handler ---
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚗 Axis DriveWorks backend running on http://localhost:${PORT}`);
});
