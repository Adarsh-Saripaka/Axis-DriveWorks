import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedDatabase() {
  const csvPath = path.join(__dirname, "..", "data", "cardata.csv");
  const dbPath = path.join(__dirname, "..", "data", "cardata.sqlite");

  console.log("🚀 Starting database seeding...");
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ ERROR: CSV file not found at ${csvPath}`);
    return;
  }

  // Remove old database if exists
  if (fs.existsSync(dbPath)) {
    console.log("🗑️ Removing old database file...");
    fs.unlinkSync(dbPath);
  }

  console.log("💾 Creating new SQLite database...");
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT,
      model TEXT,
      year TEXT,
      body_style TEXT,
      msrp_usd TEXT,
      horsepower TEXT,
      torque_nm TEXT,
      zero_to_hundred_kmh TEXT,
      top_speed_kmh TEXT,
      cylinders TEXT,
      weight_kg TEXT,
      engine_type TEXT,
      transmission TEXT,
      drivetrain TEXT,
      country_origin TEXT
    );
  `);

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isHeader = true;
  let headers = [];
  let count = 0;

  console.log("⏳ Reading CSV and inserting rows... (This might take a minute)");
  
  await db.exec("BEGIN TRANSACTION"); // Optimize batch inserts

  const insertStmt = await db.prepare(`
    INSERT INTO cars (brand, model, year, body_style, msrp_usd, horsepower, torque_nm, zero_to_hundred_kmh, top_speed_kmh, cylinders, weight_kg, engine_type, transmission, drivetrain, country_origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for await (const line of rl) {
    if (!line.trim()) continue;

    const values = line.split(",").map(v => v.trim());
    
    if (isHeader) {
      headers = values.map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase());
      isHeader = false;
      continue;
    }

    const car = {};
    headers.forEach((h, i) => {
      const allowedHeaders = [
        "brand", "model", "year", "body_style", "msrp_usd", "horsepower", 
        "torque_nm", "zero_to_hundred_kmh", "top_speed_kmh", "cylinders", 
        "weight_kg", "engine_type", "transmission", "drivetrain", "country_origin"
      ];
      if (allowedHeaders.includes(h)) {
        car[h] = values[i] ? values[i].replace(/^"|"$/g, "").trim() : "";
      }
    });

    await insertStmt.run(
      car.brand || "", car.model || "", car.year || "", car.body_style || "",
      car.msrp_usd || "", car.horsepower || "", car.torque_nm || "",
      car.zero_to_hundred_kmh || "", car.top_speed_kmh || "", car.cylinders || "",
      car.weight_kg || "", car.engine_type || "", car.transmission || "",
      car.drivetrain || "", car.country_origin || ""
    );

    count++;
    if (count % 10000 === 0) {
      console.log(`... inserted ${count} rows`);
    }
  }

  await insertStmt.finalize();
  await db.exec("COMMIT");
  
  console.log("⚡ Creating indexes for fast searching...");
  await db.exec("CREATE INDEX idx_brand ON cars(brand)");
  await db.exec("CREATE INDEX idx_model ON cars(model)");
  await db.exec("CREATE INDEX idx_year ON cars(year)");

  await db.close();
  console.log(`✅ Seeding complete! Database saved to ${dbPath}`);
}

seedDatabase().catch(console.error);
