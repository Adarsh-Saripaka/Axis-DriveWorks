// scripts/seedCarNames.js  -  creates + fills the `car_names` table (names only, no specs)
// Usage (from axisdriveworks-backend/):  node scripts/seedCarNames.js
// Expects data/car_names.json (produced by build_car_names.py)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(__dirname, "..", "data", "car_names.json");
const dbPath = path.join(__dirname, "..", "data", "cardata.sqlite");

if (!fs.existsSync(jsonPath)) {
  console.error(`car_names.json not found at ${jsonPath}`);
  process.exit(1);
}
const names = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

const db = await open({ filename: dbPath, driver: sqlite3.Database });
await db.exec(`
  DROP TABLE IF EXISTS car_names;
  CREATE TABLE car_names (
    id INTEGER PRIMARY KEY,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year_start INTEGER,
    year_end INTEGER,           -- NULL = still in production / unknown
    body_style TEXT,
    has_3d_model INTEGER NOT NULL DEFAULT 0,
    model_3d_id TEXT,
    model_3d_label TEXT,
    sources TEXT,
    search_key TEXT NOT NULL,   -- lower-case "brand model" for autocomplete
    UNIQUE (brand, model)
  );
  CREATE INDEX idx_car_names_key   ON car_names(search_key COLLATE NOCASE);
  CREATE INDEX idx_car_names_brand ON car_names(brand COLLATE NOCASE);
`);

await db.exec("BEGIN");
const stmt = await db.prepare(
  `INSERT INTO car_names
   (id, brand, model, year_start, year_end, body_style, has_3d_model, model_3d_id, model_3d_label, sources, search_key)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`
);
for (const n of names) {
  await stmt.run(n.id, n.brand, n.model, n.year_start, n.year_end, n.body_style,
    n.has_3d_model, n.model_3d_id, n.model_3d_label, n.sources, n.search_key);
}
await stmt.finalize();
await db.exec("COMMIT");

// Leave the reservations table untouched; make sure it exists (it was never created in code before).
await db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER, car_brand TEXT, car_model TEXT,
    name TEXT, email TEXT, date TEXT,
    completed INTEGER DEFAULT 0
  );
`);

const { c } = await db.get("SELECT COUNT(*) AS c FROM car_names");
console.log(`Seeded ${c} car names.`);
await db.close();
