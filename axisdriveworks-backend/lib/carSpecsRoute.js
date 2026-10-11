import { makeSpecKey, slugify } from "./slug.js";
import { fetchCarSpecs } from "./specsFetcher.js";
import { findBestCarImage } from "./imageEngine.js";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const inFlightRequests = new Map(); // spec_key -> Promise<Object>

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function registerCarSpecsRoute(app, getDb, isReady) {
  // GET /api/car-specs?brand=&model=
  app.get("/api/car-specs", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const rawBrand = Array.isArray(req.query.brand) ? req.query.brand[0] : req.query.brand;
    const rawModel = Array.isArray(req.query.model) ? req.query.model[0] : req.query.model;

    const brand = String(rawBrand || "").trim();
    const model = String(rawModel || "").trim();

    if (!brand || !model) {
      return res.status(400).json({ error: "Both 'brand' and 'model' parameters are required." });
    }

    const db = getDb();

    // 1. Resolve vehicle in car_names if already indexed
    let carRow = await db.get(
      "SELECT * FROM car_names WHERE brand = ? COLLATE NOCASE AND model = ? COLLATE NOCASE LIMIT 1",
      [brand, model]
    );

    const cleanBrand = carRow ? carRow.brand : brand;
    const cleanModel = carRow ? carRow.model : model;
    const specKey = makeSpecKey(cleanBrand, cleanModel);

    // 2. Cache Hit younger than 90 days -> return immediately with best image
    const cachedRow = await db.get("SELECT * FROM car_specs WHERE spec_key = ?", [specKey]);
    const now = Date.now();

    if (cachedRow && now - cachedRow.fetched_at < NINETY_DAYS_MS) {
      const bestImage = await findBestCarImage(db, specKey, cleanBrand, cleanModel);
      return res.json({
        specs: JSON.parse(cachedRow.data),
        confidence: cachedRow.confidence,
        source_urls: JSON.parse(cachedRow.source_urls),
        fetched_at: cachedRow.fetched_at,
        cached: true,
        image: bestImage,
        brand_slug: slugify(cleanBrand),
        model_slug: slugify(cleanModel),
        model_3d_id: carRow?.model_3d_id || null,
        has_3d_model: carRow?.has_3d_model || 0
      });
    }

    // 3. Check DAILY_LOOKUP_LIMIT
    const dailyLimit = parseInt(process.env.DAILY_LOOKUP_LIMIT, 10) || 150;
    const today = getTodayKey();

    const usageRow = await db.get("SELECT lookups FROM usage_counter WHERE day = ?", [today]);
    const currentUsage = usageRow?.lookups || 0;

    if (currentUsage >= dailyLimit) {
      if (cachedRow) {
        const bestImage = await findBestCarImage(db, specKey, cleanBrand, cleanModel);
        return res.json({
          specs: JSON.parse(cachedRow.data),
          confidence: cachedRow.confidence,
          source_urls: JSON.parse(cachedRow.source_urls),
          fetched_at: cachedRow.fetched_at,
          cached: true,
          stale: true,
          notice: "Daily lookup limit reached; served from cache.",
          image: bestImage,
          brand_slug: slugify(cleanBrand),
          model_slug: slugify(cleanModel),
          model_3d_id: carRow?.model_3d_id || null,
          has_3d_model: carRow?.has_3d_model || 0
        });
      }
      return res.status(429).json({
        error: "Daily live AI lookup quota reached. Please check back tomorrow or try cached models."
      });
    }

    // 4. In-flight lock so concurrent requests for the exact same vehicle share ONE call
    if (inFlightRequests.has(specKey)) {
      try {
        const sharedResult = await inFlightRequests.get(specKey);
        return res.json({
          ...sharedResult,
          cached: true
        });
      } catch {
        // Fall through to retry on shared failure
      }
    }

    // Launch single in-flight lookup
    const fetchPromise = (async () => {
      // 5. Run Specs research + Image scoring in parallel
      const [specsResult, bestImage] = await Promise.all([
        fetchCarSpecs({
          brand: cleanBrand,
          model: cleanModel,
          year: carRow?.year_start || null
        }),
        findBestCarImage(db, specKey, cleanBrand, cleanModel)
      ]);

      const specs = specsResult.specs;
      const fetchedAt = Date.now();
      const sourceUrls = specs.source_urls || [];
      const confidence = specs.confidence || "low";

      // 6. Save in SQLite
      await db.exec("BEGIN");
      try {
        await db.run(
          `INSERT OR REPLACE INTO car_specs (spec_key, data, source_urls, confidence, fetched_at)
           VALUES (?, ?, ?, ?, ?)`,
          [specKey, JSON.stringify(specs), JSON.stringify(sourceUrls), confidence, fetchedAt]
        );

        await db.run(
          `INSERT INTO usage_counter (day, lookups) VALUES (?, 1)
           ON CONFLICT(day) DO UPDATE SET lookups = lookups + 1`,
          [today]
        );

        // Dynamically add to car_names if it was a new discovery!
        if (!carRow) {
          await db.run(
            `INSERT OR IGNORE INTO car_names
             (brand, model, year_start, year_end, body_style, has_3d_model, sources, search_key)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              specs.brand || cleanBrand,
              specs.model || cleanModel,
              specs.year_start || null,
              specs.year_end || null,
              specs.body_style || null,
              JSON.stringify(sourceUrls),
              `${(specs.brand || cleanBrand).toLowerCase()} ${(specs.model || cleanModel).toLowerCase()}`
            ]
          );
        }

        await db.exec("COMMIT");
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }

      return {
        specs,
        confidence,
        source_urls: sourceUrls,
        fetched_at: fetchedAt,
        cached: false,
        image: bestImage,
        brand_slug: slugify(specs.brand || cleanBrand),
        model_slug: slugify(specs.model || cleanModel),
        model_3d_id: carRow?.model_3d_id || null,
        has_3d_model: carRow?.has_3d_model || 0
      };
    })();

    inFlightRequests.set(specKey, fetchPromise);

    try {
      const result = await fetchPromise;
      res.json(result);
    } catch (err) {
      console.error(`Dynamic lookup failed for ${cleanBrand} ${cleanModel}:`, err.message);

      // 7. If research fails: return stale cache if present, otherwise 502
      if (cachedRow) {
        const bestImage = await findBestCarImage(db, specKey, cleanBrand, cleanModel);
        return res.json({
          specs: JSON.parse(cachedRow.data),
          confidence: cachedRow.confidence,
          source_urls: JSON.parse(cachedRow.source_urls),
          fetched_at: cachedRow.fetched_at,
          cached: true,
          stale: true,
          image: bestImage,
          brand_slug: slugify(cleanBrand),
          model_slug: slugify(cleanModel),
          model_3d_id: carRow?.model_3d_id || null,
          has_3d_model: carRow?.has_3d_model || 0
        });
      }

      res.status(502).json({
        error: "Unable to retrieve verified specifications at this moment. Please check your query or try again shortly."
      });
    } finally {
      inFlightRequests.delete(specKey);
    }
  });

  // Dedicated GET /api/images?q=
  app.get("/api/images", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const query = String(rawQ || "").trim();
    if (!query) return res.json({ url: null, source: null });

    const parts = query.split(/\s+/);
    const brand = parts[0] || "Car";
    const model = parts.slice(1).join(" ") || "Model";
    const specKey = makeSpecKey(brand, model);

    const bestImage = await findBestCarImage(getDb(), specKey, brand, model);
    res.json(bestImage);
  });

  // POST /api/car-specs/report (Report incorrect data)
  app.post("/api/car-specs/report", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const { spec_key, message } = req.body || {};
    const cleanKey = String(spec_key || "").trim();
    const cleanMsg = String(message || "").trim();

    if (!cleanKey) {
      return res.status(400).json({ error: "Missing spec_key." });
    }
    if (!cleanMsg || cleanMsg.length < 5 || cleanMsg.length > 500) {
      return res.status(400).json({ error: "Report message must be between 5 and 500 characters." });
    }

    try {
      await getDb().run(
        "INSERT INTO spec_reports (spec_key, message, created_at) VALUES (?, ?, ?)",
        [cleanKey, cleanMsg, Date.now()]
      );

      res.json({ success: true, message: "Thank you. Your report has been recorded for review." });
    } catch (err) {
      console.error("Failed to save spec report:", err);
      res.status(500).json({ error: "Could not submit report." });
    }
  });
}
