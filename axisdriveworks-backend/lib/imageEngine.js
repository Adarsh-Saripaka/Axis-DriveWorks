// lib/imageEngine.js
// Multi-API Image Candidate Aggregation & Scoring Engine
// Providers: Serper (Google Images), Wikimedia Commons, Unsplash

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const inFlightImageRequests = new Map(); // spec_key -> Promise<Object>

// ---------- 1. PROVIDERS ----------

async function fetchFromSerper(brand, model) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: `${brand} ${model} official car`,
        num: 8
      })
    });

    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.images || [];

    return items.map((item) => ({
      url: item.imageUrl,
      thumbnail: item.thumbnailUrl,
      width: parseInt(item.imageWidth, 10) || 1200,
      height: parseInt(item.imageHeight, 10) || 800,
      title: item.title || "",
      source: `Google Images (${item.domain || item.source || "Web"})`,
      author: item.source || item.domain || "Editorial Photography",
      licence: "Editorial / Web"
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromWikimedia(brand, model) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const query = `${brand} ${model} car`;
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920&format=json&origin=*`;

    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});

    const candidates = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata || {};
      const imgUrl = info?.thumburl || info?.url;

      if (!imgUrl || !/\.(jpg|jpeg|png|webp)($|\?)/i.test(imgUrl)) continue;

      const author = (meta.Artist?.value || "").replace(/<[^>]*>/g, "").trim() || "Wikimedia Contributor";
      const licence = meta.LicenseShortName?.value || "Creative Commons";

      candidates.push({
        url: imgUrl,
        thumbnail: imgUrl,
        width: info.thumbwidth || info.width || 1200,
        height: info.thumbheight || info.height || 800,
        title: page.title || "",
        source: "Wikimedia Commons",
        author: author.slice(0, 80),
        licence: licence.slice(0, 40)
      });
    }

    return candidates.slice(0, 6);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromUnsplash(brand, model) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const query = `${brand} ${model} car`;
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`,
      {
        signal: ctrl.signal,
        headers: { Authorization: `Client-ID ${key}` }
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.results || [];

    return items.map((item) => ({
      url: item.urls?.regular || item.urls?.full,
      thumbnail: item.urls?.small,
      width: item.width || 1200,
      height: item.height || 800,
      title: item.description || item.alt_description || `${brand} ${model}`,
      source: "Unsplash",
      author: item.user?.name || "Unsplash Creator",
      licence: "Unsplash Free License"
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 2. SCORING ENGINE ----------

function scoreCandidate(candidate, brand, model) {
  if (!candidate || !candidate.url) return -100;

  let score = 0;
  const brandLower = brand.toLowerCase();
  const modelTokens = model.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const text = `${candidate.title} ${candidate.source} ${candidate.url}`.toLowerCase();

  // 1. Aspect Ratio (Landscape Preferred for car showcases)
  const ratio = candidate.width && candidate.height ? candidate.width / candidate.height : 1.5;
  if (ratio >= 1.25 && ratio <= 2.2) {
    score += 30; // Ideal landscape
  } else if (ratio > 2.2) {
    score += 15; // Wide banner
  } else if (ratio >= 0.95 && ratio < 1.25) {
    score += 5; // Near square
  } else {
    score -= 40; // Portrait (harsh penalty)
  }

  // 2. Resolution
  const width = candidate.width || 0;
  if (width >= 1920) {
    score += 30; // 1080p / 4K
  } else if (width >= 1200) {
    score += 20; // High Definition
  } else if (width >= 800) {
    score += 10;
  } else {
    score -= 30; // Blurry thumbnail
  }

  // 3. Keyword / Token Relevance
  if (text.includes(brandLower)) {
    score += 20;
  }
  let matchedModelTokens = 0;
  for (const token of modelTokens) {
    if (text.includes(token)) {
      matchedModelTokens++;
    }
  }
  if (modelTokens.length > 0) {
    score += Math.round((matchedModelTokens / modelTokens.length) * 25);
  }

  // 4. Spam & Non-Car Penalty
  const junkPatterns = ["diecast", "hot wheels", "scale model", "toy", "drawing", "render", "sketch", "crashed", "wreck", "watermark"];
  for (const pattern of junkPatterns) {
    if (text.includes(pattern)) {
      score -= 50;
    }
  }

  // 5. Source Quality Bonus
  if (candidate.source.includes("Google Images") || candidate.source.includes("Wikimedia")) {
    score += 10;
  }

  return score;
}

// ---------- 3. RUNNER & CACHE ----------

export async function findBestCarImage(db, specKey, brand, model) {
  const now = Date.now();

  // 1. Check SQLite Cache
  if (db) {
    const cached = await db.get("SELECT * FROM car_images WHERE spec_key = ?", [specKey]);
    if (cached && now - cached.fetched_at < THIRTY_DAYS_MS) {
      return {
        url: cached.url,
        source: cached.source,
        author: cached.author,
        licence: cached.licence,
        cached: true
      };
    }
  }

  // 2. In-flight Lock
  if (inFlightImageRequests.has(specKey)) {
    return await inFlightImageRequests.get(specKey);
  }

  const lookupPromise = (async () => {
    // 3. Fetch from all active providers in parallel
    const [serperResults, wikimediaResults, unsplashResults] = await Promise.allSettled([
      fetchFromSerper(brand, model),
      fetchFromWikimedia(brand, model),
      fetchFromUnsplash(brand, model)
    ]);

    const candidates = [
      ...(serperResults.status === "fulfilled" ? serperResults.value : []),
      ...(wikimediaResults.status === "fulfilled" ? wikimediaResults.value : []),
      ...(unsplashResults.status === "fulfilled" ? unsplashResults.value : [])
    ];

    if (candidates.length === 0) {
      return {
        url: null,
        source: null,
        author: null,
        licence: null,
        cached: false
      };
    }

    // 4. Score all candidates
    const scored = candidates
      .map((c) => ({ ...c, score: scoreCandidate(c, brand, model) }))
      .sort((a, b) => b.score - a.score);

    const winner = scored[0] && scored[0].score > 0 ? scored[0] : candidates[0];

    // 5. Save in SQLite
    if (db && winner?.url) {
      await db.run(
        `INSERT OR REPLACE INTO car_images (spec_key, url, source, author, licence, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [specKey, winner.url, winner.source, winner.author, winner.licence, now]
      );
    }

    return {
      url: winner?.url || null,
      source: winner?.source || null,
      author: winner?.author || null,
      licence: winner?.licence || null,
      score: winner?.score || 0,
      cached: false
    };
  })();

  inFlightImageRequests.set(specKey, lookupPromise);

  try {
    return await lookupPromise;
  } finally {
    inFlightImageRequests.delete(specKey);
  }
}
