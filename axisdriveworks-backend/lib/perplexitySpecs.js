// perplexitySpecs.js  -  fetch ONE car's specs through Perplexity's Sonar API, then validate.
// Env: PERPLEXITY_API_KEY   (server-side only. Never expose in the frontend / render.yaml / git)
//
// Perplexity API: OpenAI-style POST https://api.perplexity.ai/chat/completions
// Models: sonar (cheap), sonar-pro (better for multi-source checks), sonar-deep-research (slow, thorough).

const API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = process.env.PERPLEXITY_MODEL || "sonar-pro";

const num = { type: ["number", "null"] };
const str = { type: ["string", "null"] };

export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: { type: "string" }, model: { type: "string" }, variant_used: str,
    year_start: num, year_end: num, body_style: str, doors: num, seats: num,
    engine_layout: str, displacement_cc: num, cylinders: num,
    fuel_type: { type: ["string", "null"], enum: ["petrol", "diesel", "electric", "hybrid", "plug-in hybrid", null] },
    horsepower_hp: num, torque_nm: num, transmission: str,
    drivetrain: { type: ["string", "null"], enum: ["FWD", "RWD", "AWD", "4WD", null] },
    zero_to_100_kmh_s: num, top_speed_kmh: num, curb_weight_kg: num,
    msrp_usd: num, msrp_year: num, country_origin: str,
    source_urls: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: str,
  },
  required: ["brand", "model", "source_urls", "confidence"],
};

const SYSTEM_PROMPT = `You are a meticulous automotive data researcher.
Research EXACTLY ONE vehicle and ONE variant using live web pages. Accuracy matters more than completeness.
RULES
- Use only values you found on pages you opened in this search. Never use memory for numbers.
- Pick the single best-documented variant/year and name it in variant_used. Never blend variants, trims, markets or years.
- horsepower_hp, torque_nm, zero_to_100_kmh_s, top_speed_kmh need 2 independent sources agreeing within ~3%.
  If only one source exists, still fill it but set confidence "low". If sources conflict, prefer the manufacturer and explain in notes.
- Prefer: manufacturer press/model pages, EPA fueleconomy.gov, NHTSA, then Car and Driver, Motor Trend, Road & Track, Autocar, evo.
  Do not use forums, Reddit, YouTube comments or undated listings.
- Numbers only (no units, no ranges). Unknown = null. Never guess.
- Convert units yourself (lb-ft x1.3558 = Nm, mph x1.609 = km/h, lb x0.4536 = kg). 0-60 mph is NOT 0-100 km/h: use null unless 0-100 km/h is given.
- msrp_usd = original US launch base price with msrp_year; null if there was no US price.
- source_urls = the pages you actually used. Return ONLY the JSON object.`;

// ---------- validation (never trust the model) ----------
const RANGES = {
  horsepower_hp: [50, 2000], torque_nm: [50, 2500], zero_to_100_kmh_s: [1.5, 20],
  top_speed_kmh: [100, 450], curb_weight_kg: [500, 4500], displacement_cc: [600, 9000],
  cylinders: [2, 16], doors: [2, 6], seats: [1, 9], msrp_usd: [5000, 5_000_000],
};
export function validateSpecs(s) {
  const errors = [];
  const out = { ...s };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    const v = out[k];
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      errors.push(`${k}=${v} outside ${lo}-${hi}`); out[k] = null;
    }
  }
  const now = new Date().getFullYear() + 1;
  for (const k of ["year_start", "year_end", "msrp_year"]) {
    if (out[k] != null && (!Number.isInteger(out[k]) || out[k] < 1885 || out[k] > now)) { errors.push(`${k}=${out[k]} invalid`); out[k] = null; }
  }
  if (out.year_start && out.year_end && out.year_end < out.year_start) { errors.push("year_end < year_start"); out.year_end = null; }
  // rough physics sanity: very fast 0-100 with low power is inconsistent
  if (out.zero_to_100_kmh_s != null && out.horsepower_hp != null && out.zero_to_100_kmh_s < 3 && out.horsepower_hp < 400) {
    errors.push("0-100 too fast for stated power"); out.zero_to_100_kmh_s = null;
  }
  out.source_urls = (out.source_urls || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 12);
  // key performance numbers backed by fewer than 2 sources -> force low confidence
  if (out.source_urls.length < 2) out.confidence = "low";
  if (errors.length && out.confidence === "high") out.confidence = "medium";
  return { ok: out.brand && out.model && out.source_urls.length > 0, specs: out, errors };
}

export function extractJson(text) {
  const t = String(text).replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("No JSON in response");
  return JSON.parse(t.slice(a, b + 1));
}

// ---------- the call ----------
export async function fetchSpecsFromPerplexity({ brand, model, year }, { retry = true } = {}) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("PERPLEXITY_API_KEY not set");

  const ask = async (extra = "") => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Vehicle: ${brand} ${model}${year ? ` (${year})` : ""}.${extra}` },
          ],
          response_format: { type: "json_schema", json_schema: { schema: SPEC_SCHEMA } },
          // exclude low-quality sources via the API filter (prefix "-" = exclude)
          search_domain_filter: ["-reddit.com", "-quora.com", "-pinterest.com", "-youtube.com", "-facebook.com"],
        }),
      });
      if (!r.ok) throw new Error(`Perplexity HTTP ${r.status}`);
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = extractJson(content);
      // merge in the URLs Perplexity actually retrieved, so citations are real
      const cited = (data.search_results || []).map((x) => x.url).concat(data.citations || []);
      parsed.source_urls = [...new Set([...(parsed.source_urls || []), ...cited])];
      return parsed;
    } finally { clearTimeout(timer); }
  };

  let result = validateSpecs(await ask());
  if (!result.ok && retry) {
    result = validateSpecs(await ask(` Previous answer failed validation (${result.errors.join("; ") || "missing sources"}). Re-check the pages and correct it.`));
  }
  if (!result.ok) throw new Error("Specs failed validation");
  return result; // { ok, specs, errors }
}
