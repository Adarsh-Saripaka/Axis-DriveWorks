import { slugify, makeSpecKey } from "./slug.js";

const escapeLike = (s) => s.replace(/[\\%_]/g, (ch) => "\\" + ch);

export function registerSuggestRoute(app, getDb, isReady) {
  app.get("/api/suggest", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    // `?q=a&q=b` arrives as an array in Express 5 -> take the first string only
    const raw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const q = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (q.length < 2) return res.json([]);
    if (q.length > 60) return res.status(400).json({ error: "Query too long." });

    const tokens = q.split(" ").slice(0, 5);
    const where = tokens.map(() => "search_key LIKE ? ESCAPE '\\'").join(" AND ");
    const params = tokens.map((t) => `%${escapeLike(t)}%`);

    try {
      const rows = await getDb().all(
        `SELECT id, brand, model, year_start, year_end, has_3d_model, model_3d_id, model_3d_label
           FROM car_names
          WHERE ${where}
          ORDER BY (search_key LIKE ? ESCAPE '\\') DESC, has_3d_model DESC, brand, model
          LIMIT 10`,
        [...params, `${escapeLike(q)}%`]
      );

      const enhanced = rows.map((r) => ({
        ...r,
        brand_slug: slugify(r.brand),
        model_slug: slugify(r.model),
        spec_key: makeSpecKey(r.brand, r.model),
      }));

      res.json(enhanced);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Suggest failed." });
    }
  });
}
