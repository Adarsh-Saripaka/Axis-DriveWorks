import { makeSpecKey, slugify } from "./slug.js";
import { fetchCarSpecs } from "./specsFetcher.js";
import { findBestCarImage } from "./imageEngine.js";
import { createAuthMiddleware } from "./authRoute.js";
import { validateBody, ReportSchema } from "./validation.js";
import { logSecurityAudit } from "./security.js";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const inFlightRequests = new Map(); // spec_key -> Promise<Object>

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function registerCarSpecsRoute(app, getDb, isReady) {
  const { requireAuth } = createAuthMiddleware(getDb);
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
      const rawSpecs = JSON.parse(cachedRow.data);
      const isEstimate = cachedRow.confidence === "baseline" || cachedRow.confidence === "low";
      const specs = {
        ...rawSpecs,
        isEstimate,
        source: isEstimate ? "Estimated specifications based on catalog baseline" : "Verified automotive records"
      };

      return res.json({
        specs,
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
      // 5. Run Specs research + Image scoring in parallel with Promise.allSettled
      const [specsPromise, imagePromise] = await Promise.allSettled([
        fetchCarSpecs({
          brand: cleanBrand,
          model: cleanModel,
          year: carRow?.year_start || null
        }),
        findBestCarImage(db, specKey, cleanBrand, cleanModel)
      ]);

      const bestImage = imagePromise.status === "fulfilled" ? imagePromise.value : null;

      // Case A: AI Research succeeded
      if (specsPromise.status === "fulfilled" && specsPromise.value?.specs) {
        const specs = specsPromise.value.specs;
        const fetchedAt = Date.now();
        const sourceUrls = specs.source_urls || [];
        const confidence = specs.confidence || "high";

        // Save in SQLite
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
      }

      // Case B: AI research threw error or API key missing
      console.warn(
        `AI research unavailable for ${cleanBrand} ${cleanModel}: ${specsPromise.reason?.message || "Unknown error"}. Serving catalog baseline.`
      );

      // Return stale cache if available
      if (cachedRow) {
        return {
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
        };
      }

      // Return baseline vehicle specs from verified database
      const baselineSpecs = {
        brand: carRow?.brand || cleanBrand,
        model: carRow?.model || cleanModel,
        variant_used: carRow?.model_3d_label || carRow?.model || cleanModel,
        year_start: carRow?.year_start || null,
        year_end: carRow?.year_end || null,
        body_style: carRow?.body_style || "Coupe / Sedan",
        doors: null,
        seats: null,
        engine_layout: null,
        displacement_cc: null,
        cylinders: null,
        fuel_type: null,
        horsepower_hp: null,
        torque_nm: null,
        transmission: null,
        drivetrain: null,
        zero_to_100_kmh_s: null,
        top_speed_kmh: null,
        curb_weight_kg: null,
        msrp_usd: null,
        msrp_year: null,
        country_origin: null,
        source_urls: [],
        confidence: "baseline",
        isEstimate: true,
        source: "Catalog baseline / estimated specifications",
        notes: specsPromise.reason?.message
          ? `AI research notice: ${specsPromise.reason.message}`
          : "Verified catalog entry. Configure GEMINI_API_KEY in axisdriveworks-backend/.env for live deep AI research."
      };

      return {
        specs: baselineSpecs,
        confidence: "baseline",
        source_urls: [],
        fetched_at: Date.now(),
        cached: false,
        image: bestImage,
        brand_slug: slugify(baselineSpecs.brand),
        model_slug: slugify(baselineSpecs.model),
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

      // Final fallback if everything failed
      res.json({
        specs: {
          brand: cleanBrand,
          model: cleanModel,
          body_style: "Sedan / Coupe",
          confidence: "baseline"
        },
        confidence: "baseline",
        source_urls: [],
        fetched_at: Date.now(),
        cached: false,
        image: null,
        brand_slug: slugify(cleanBrand),
        model_slug: slugify(cleanModel),
        model_3d_id: null,
        has_3d_model: 0
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

  // POST /api/car-specs/report (Report incorrect data - Authenticated Moderation Queue)
  app.post("/api/car-specs/report", requireAuth, validateBody(ReportSchema), async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const db = getDb();
    const user = req.user;
    const { spec_key, field, proposed_value, message } = req.body;

    // Referential Integrity Check: Verify that the vehicle/spec_key exists
    const specExists = await db.get("SELECT spec_key FROM car_specs WHERE spec_key = ?", [spec_key]);
    if (!specExists) {
      // Check if it matches a catalog car
      const carExists = await db.get(
        "SELECT id FROM car_names WHERE search_key = ? OR brand_slug = ? OR model_slug = ?",
        [spec_key.toLowerCase(), spec_key.toLowerCase(), spec_key.toLowerCase()]
      );
      if (!carExists && !spec_key.includes("_")) {
        return res.status(404).json({ error: "Referenced vehicle does not exist in the catalogue." });
      }
    }

    // Atomic Daily User Quota (Max 20 reports per user per day to stop slow-drip bloat)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const dailyCount = await db.get(
      "SELECT COUNT(*) as count FROM spec_reports WHERE reporter_uid = ? AND created_at >= ?",
      [user.uid, todayMs]
    );

    if (dailyCount && dailyCount.count >= 20) {
      return res.status(429).json({
        error: "Daily report quota reached. Maximum 20 reports per user per day."
      });
    }

    // Moderation Queue & Deduplication: Resubmitting updates existing pending report
    const existingPending = await db.get(
      "SELECT id FROM spec_reports WHERE reporter_uid = ? AND spec_key = ? AND field = ? AND status = 'pending'",
      [user.uid, spec_key, field]
    );

    const now = Date.now();
    try {
      if (existingPending) {
        await db.run(
          `UPDATE spec_reports 
           SET proposed_value = ?, message = ?, updated_at = ? 
           WHERE id = ?`,
          [proposed_value || null, message, now, existingPending.id]
        );

        logSecurityAudit("SPEC_REPORT_UPDATED", {
          reportId: existingPending.id,
          uid: user.uid,
          specKey: spec_key,
          field,
          ip: req.ip
        });

        return res.status(200).json({
          ok: true,
          success: true,
          id: existingPending.id,
          message: "Your pending correction report has been updated."
        });
      }

      const result = await db.run(
        `INSERT INTO spec_reports 
         (spec_key, field, proposed_value, message, reporter_uid, reporter_email, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [spec_key, field, proposed_value || null, message, user.uid, user.email, now, now]
      );

      logSecurityAudit("SPEC_REPORT_CREATED", {
        reportId: result.lastID,
        uid: user.uid,
        specKey: spec_key,
        field,
        ip: req.ip
      });

      res.status(202).json({
        ok: true,
        success: true,
        id: result.lastID,
        message: "Thank you. Your correction report has been queued for moderation review."
      });
    } catch (err) {
      console.error("Failed to queue spec report:", err);
      res.status(500).json({ error: "Could not submit report." });
    }
  });
}
