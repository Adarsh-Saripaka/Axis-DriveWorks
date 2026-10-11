import { fetchSpecsFromPerplexity, validateSpecs, extractJson } from "./perplexitySpecs.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a meticulous automotive data researcher.
Research EXACTLY ONE vehicle and ONE variant using verified automotive knowledge. Accuracy matters more than completeness.
Return a single strictly valid JSON object matching this schema:
{
  "brand": string,
  "model": string,
  "variant_used": string or null,
  "year_start": number or null,
  "year_end": number or null,
  "body_style": string or null,
  "doors": number or null,
  "seats": number or null,
  "engine_layout": string or null,
  "displacement_cc": number or null,
  "cylinders": number or null,
  "fuel_type": "petrol" | "diesel" | "electric" | "hybrid" | "plug-in hybrid" | null,
  "horsepower_hp": number or null,
  "torque_nm": number or null,
  "transmission": string or null,
  "drivetrain": "FWD" | "RWD" | "AWD" | "4WD" | null,
  "zero_to_100_kmh_s": number or null,
  "top_speed_kmh": number or null,
  "curb_weight_kg": number or null,
  "msrp_usd": number or null,
  "msrp_year": number or null,
  "country_origin": string or null,
  "source_urls": string[],
  "confidence": "high" | "medium" | "low",
  "notes": string or null
}

RULES:
- Use only facts from automotive records. Never guess numbers.
- Pick the single best-documented variant/year and name it in variant_used.
- msrp_usd: Provide the realistic original base factory MSRP (sticker price) in USD when new. Ensure MSRP reflects true market segment benchmarks (e.g. economy compacts $18k-$32k, premium compacts/sedans $35k-$60k, sports cars $55k-$120k, supercars $200k-$500k+). If the vehicle was not sold in the US, convert official European/home market MSRP to USD. Never return trivial prices under $5,000 for modern production vehicles.
- Numbers only (no units). Convert lb-ft to Nm (* 1.3558), mph to km/h (* 1.609), lbs to kg (* 0.4536).
- Include relevant automotive reference URLs in source_urls.
- Output ONLY the JSON object.`;

async function fetchSpecsFromGemini({ brand, model, year }, { retry = true } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const useSearchDefault = process.env.GEMINI_USE_SEARCH === "true";

  const executeCall = async (extra = "", withSearch = useSearchDefault) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);

    const bodyPayload = {
      contents: [
        {
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nVehicle to research: ${brand} ${model}${year ? ` (${year})` : ""}.${extra}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0
      }
    };

    if (withSearch) {
      bodyPayload.tools = [{ googleSearch: {} }];
    }

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      // If search grounding hits quota (429) or is unavailable (400/404), fall back to standard model generation
      if (!response.ok && withSearch && (response.status === 429 || response.status === 400 || response.status === 404)) {
        console.warn(`Gemini search grounding returned ${response.status}. Falling back to knowledge generation.`);
        return executeCall(extra, false);
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Gemini HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }

      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini");

      const parsed = extractJson(text);

      // Extract grounded web search URLs from Google Search chunks if present
      const searchChunks = candidate?.groundingMetadata?.groundingChunks || [];
      const groundedUrls = searchChunks
        .map((chunk) => chunk.web?.uri)
        .filter(Boolean);

      parsed.source_urls = [
        ...new Set([...(parsed.source_urls || []), ...groundedUrls])
      ].filter((u) => /^https?:\/\//.test(u));

      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };

  const ask = (extra = "") => executeCall(extra, true);

  let result = validateSpecs(await ask());
  if (!result.ok && retry) {
    result = validateSpecs(
      await ask(
        ` Previous answer failed validation (${result.errors.join("; ") || "missing sources"}). Re-check source pages and correct it.`
      )
    );
  }

  if (!result.ok) throw new Error(`Specs failed validation: ${result.errors.join(", ")}`);
  return result;
}

/**
 * Universal specs fetcher: supports Perplexity or Gemini.
 */
export async function fetchCarSpecs({ brand, model, year }, options = {}) {
  if (process.env.GEMINI_API_KEY) {
    return await fetchSpecsFromGemini({ brand, model, year }, options);
  }
  if (process.env.PERPLEXITY_API_KEY) {
    return await fetchSpecsFromPerplexity({ brand, model, year }, options);
  }
  throw new Error("Neither GEMINI_API_KEY nor PERPLEXITY_API_KEY is configured in .env");
}

export { validateSpecs };
