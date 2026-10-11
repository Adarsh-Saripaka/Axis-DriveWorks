// scripts/prefillSpecs.js
// Pre-fills the car_specs cache for all vehicles with has_3d_model = 1
// Resumable, sequential with 2-second delay
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { makeSpecKey } from "../lib/slug.js";
import { fetchCarSpecs } from "../lib/specsFetcher.js";
import { runMigrations } from "../lib/migrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const dbPath = path.join(__dirname, "..", "data", "cardata.sqlite");
const db = await open({ filename: dbPath, driver: sqlite3.Database });

await runMigrations(db);

const carsWith3D = await db.all(
  "SELECT id, brand, model, year_start, model_3d_id, model_3d_label FROM car_names WHERE has_3d_model = 1 ORDER BY brand, model"
);

console.log(`Found ${carsWith3D.length} vehicles with 3D models to pre-fill.`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = { high: 0, medium: 0, low: 0, failed: 0, cached: 0 };

for (let i = 0; i < carsWith3D.length; i++) {
  const car = carsWith3D[i];
  const specKey = makeSpecKey(car.brand, car.model);
  const progress = `[${i + 1}/${carsWith3D.length}]`;

  // Check if already cached
  const existing = await db.get("SELECT confidence, fetched_at FROM car_specs WHERE spec_key = ?", [specKey]);
  if (existing) {
    console.log(`${progress} [CACHED] ${car.brand} ${car.model} (Confidence: ${existing.confidence})`);
    stats[existing.confidence] = (stats[existing.confidence] || 0) + 1;
    stats.cached++;
    continue;
  }

  console.log(`${progress} [FETCHING] ${car.brand} ${car.model}...`);
  try {
    const { specs } = await fetchCarSpecs({
      brand: car.brand,
      model: car.model,
      year: car.year_start
    });

    const confidence = specs.confidence || "low";
    const fetchedAt = Date.now();

    await db.run(
      `INSERT OR REPLACE INTO car_specs (spec_key, data, source_urls, confidence, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
      [specKey, JSON.stringify(specs), JSON.stringify(specs.source_urls || []), confidence, fetchedAt]
    );

    console.log(`    ↳ Verified! Confidence: ${confidence}, Sources: ${specs.source_urls?.length || 0}`);
    stats[confidence] = (stats[confidence] || 0) + 1;
  } catch (err) {
    console.error(`    ↳ FAILED: ${err.message}`);
    stats.failed++;
  }

  // 2 second respectful delay between live AI web requests
  if (i < carsWith3D.length - 1) {
    await sleep(2000);
  }
}

console.log("\n=================================");
console.log("       PRE-FILL COMPLETED        ");
console.log("=================================");
console.table({
  "Total 3D Vehicles": carsWith3D.length,
  "Already Cached": stats.cached,
  "High Confidence": stats.high,
  "Medium Confidence": stats.medium,
  "Low Confidence": stats.low,
  "Failed": stats.failed
});

await db.close();
