const PEXELS_BASE = "https://api.pexels.com/v1/search";
const PEXELS_KEY = (typeof import.meta !== "undefined" && import.meta.env) 
  ? (import.meta.env.VITE_PEXELS_API_KEY || import.meta.env.VITE_PEXELS_ACCESS_KEY) 
  : "";

// Automatically switch between production and development API endpoints
const RAW_BASE = (typeof import.meta !== "undefined" && import.meta.env)
  ? (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  : "http://localhost:5000";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api`;

// =============================================
// SESSION MANAGEMENT
// =============================================

const SESSION_KEY = "adw_session_token";
const SESSION_EMAIL_KEY = "adw_session_email";

export function getSessionToken() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function getSessionEmail() {
  return sessionStorage.getItem(SESSION_EMAIL_KEY);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EMAIL_KEY);
}

export function hasSession() {
  return !!getSessionToken();
}

export async function createSession(email) {
  try {
    const res = await fetch(`${BASE_URL}/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to create session");
    }

    const data = await res.json();
    sessionStorage.setItem(SESSION_KEY, data.token);
    sessionStorage.setItem(SESSION_EMAIL_KEY, data.email);
    return data;
  } catch (err) {
    console.error("Session creation failed:", err);
    throw err;
  }
}

function getAuthHeaders() {
  const token = getSessionToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// =============================================
// IMAGE FETCHING — DEDUPLICATED + CACHED
// =============================================

// Persistent image cache: brand-model → URL (prevents re-randomization and deduplication)
const imageCache = new Map();
// Track all used image URLs within a brand to avoid repeats
const usedImagesByBrand = new Map();

// Deterministic hash for consistent image selection per model
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Pexels request throttle — max 1 request per 200ms
let lastPexelsRequest = 0;
const PEXELS_THROTTLE_MS = 200;

async function throttledFetch(url, options) {
  const now = Date.now();
  const waitTime = Math.max(0, PEXELS_THROTTLE_MS - (now - lastPexelsRequest));
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastPexelsRequest = Date.now();
  return fetch(url, options);
}

// Exponential backoff retry for rate-limited responses
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await throttledFetch(url, options);

    if (response.status === 429) {
      if (attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
        const backoffMs = Math.min(retryAfter * 1000, (2 ** attempt) * 1000);
        console.warn(`Rate limited (Pexels). Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      return null; // Exhausted retries
    }

    if (!response.ok) return null;
    return response;
  }
  return null;
}

// Dynamic SVG banner generator for high-tech cyberpunk placeholder when no web photo is available
export function getCarPlaceholderSvg(carName, brand = "") {
  const brandName = brand || carName.split(" ")[0] || "Axis";
  const modelName = carName.replace(brandName, "").trim() || carName;
  const hash = hashString(carName);
  
  const accents = [
    { c1: "#00f2fe", c2: "#4facfe" },
    { c1: "#ff0844", c2: "#ffb199" },
    { c1: "#00ffff", c2: "#ff007f" },
    { c1: "#f12711", c2: "#f5af19" },
    { c1: "#7f00ff", c2: "#e100ff" },
    { c1: "#00c6ff", c2: "#0072ff" },
    { c1: "#38ef7d", c2: "#11998e" }
  ];
  const accent = accents[hash % accents.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b0e14" />
        <stop offset="50%" stop-color="#141923" />
        <stop offset="100%" stop-color="#07090c" />
      </linearGradient>
      <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accent.c1}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${accent.c2}" stop-opacity="0.8" />
      </linearGradient>
      <filter id="neon">
        <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="800" height="500" fill="url(#bgGrad)" />
    <rect width="800" height="500" fill="url(#grid)" />
    
    <!-- Horizon Glow -->
    <ellipse cx="400" cy="270" rx="320" ry="80" fill="${accent.c1}" opacity="0.08" filter="url(#neon)" />
    
    <!-- Cyber Car Silhouette -->
    <path d="M 180 320 L 220 280 L 310 240 L 490 240 L 580 280 L 620 320 L 590 325 L 560 300 L 470 300 L 440 325 L 360 325 L 330 300 L 240 300 L 210 325 Z" fill="none" stroke="url(#glowGrad)" stroke-width="2.5" filter="url(#neon)" />
    <circle cx="285" cy="315" r="28" fill="#0d1117" stroke="${accent.c1}" stroke-width="2" />
    <circle cx="285" cy="315" r="14" fill="none" stroke="${accent.c2}" stroke-width="1.5" />
    <circle cx="515" cy="315" r="28" fill="#0d1117" stroke="${accent.c1}" stroke-width="2" />
    <circle cx="515" cy="315" r="14" fill="none" stroke="${accent.c2}" stroke-width="1.5" />
    
    <!-- Sleek Neon Ground Line -->
    <line x1="120" y1="343" x2="680" y2="343" stroke="url(#glowGrad)" stroke-width="1.5" filter="url(#neon)" opacity="0.7"/>
    
    <!-- Brand / Model Text -->
    <text x="400" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="6" fill="${accent.c1}" text-anchor="middle" text-transform="uppercase" opacity="0.9">${brandName}</text>
    <text x="400" y="195" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" letter-spacing="2" fill="#ffffff" text-anchor="middle">${modelName}</text>
    <text x="400" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" letter-spacing="4" fill="rgba(255,255,255,0.4)" text-anchor="middle">AXIS DRIVEWORKS EDITION</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Fetch automotive image from Wikimedia Commons API (Free, open CORS, unblocked)
async function fetchWikimediaImage(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query + " car")}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.query || !data.query.pages) return null;

    const pages = Object.values(data.query.pages);
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const imgUrl = info?.thumburl || info?.url;
      // Filter out non-photo / svg / small icons
      if (imgUrl && !imgUrl.endsWith(".svg") && !imgUrl.endsWith(".ogg") && !imgUrl.endsWith(".pdf")) {
        return imgUrl;
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

export async function getCarImage(carName) {
  // Check cache first — same car always gets the same image
  const cacheKey = carName.trim().toLowerCase();
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  const brand = carName.split(" ")[0];
  if (!usedImagesByBrand.has(brand)) {
    usedImagesByBrand.set(brand, new Set());
  }
  const usedUrls = usedImagesByBrand.get(brand);

  // 1. Try Wikimedia Commons Open API first (High quality, reliable across networks)
  try {
    const wikiImg = await fetchWikimediaImage(carName);
    if (wikiImg && !usedUrls.has(wikiImg)) {
      usedUrls.add(wikiImg);
      imageCache.set(cacheKey, wikiImg);
      return wikiImg;
    }
  } catch (e) {
    // Ignore and proceed
  }

  // 2. If PEXELS_KEY is configured, try Pexels API
  if (PEXELS_KEY && PEXELS_KEY !== "undefined") {
    const fetchPexels = async (query, pickIndex) => {
      try {
        const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=10`;
        const response = await fetchWithRetry(url, {
          headers: { Authorization: PEXELS_KEY }
        });
        if (!response) return null;
        const data = await response.json();
        if (!data.photos || data.photos.length === 0) return null;

        const results = data.photos;
        const startIdx = pickIndex % results.length;
        for (let offset = 0; offset < results.length; offset++) {
          const idx = (startIdx + offset) % results.length;
          const candidateUrl = results[idx]?.src?.large2x || results[idx]?.src?.large;
          if (candidateUrl && !usedUrls.has(candidateUrl)) {
            usedUrls.add(candidateUrl);
            return candidateUrl;
          }
        }
        return results[startIdx]?.src?.large2x || results[startIdx]?.src?.large || null;
      } catch {
        return null;
      }
    };

    const hash = hashString(cacheKey);
    const pexelsImg = await fetchPexels(`${carName} car`, hash);
    if (pexelsImg) {
      imageCache.set(cacheKey, pexelsImg);
      return pexelsImg;
    }
  }

  // 3. Fallback to Wikimedia brand search if specific model had no result
  try {
    const brandImg = await fetchWikimediaImage(brand);
    if (brandImg) {
      imageCache.set(cacheKey, brandImg);
      return brandImg;
    }
  } catch (e) {
    // Ignore and proceed
  }

  // 4. Return custom Cyberpunk SVG card graphic tailored for this vehicle
  const fallbackSvg = getCarPlaceholderSvg(carName, brand);
  imageCache.set(cacheKey, fallbackSvg);
  return fallbackSvg;
}


// =============================================
// CAR DATA API (Public)
// =============================================

async function apiRequest(url, options = {}) {
  try {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = data.retryAfter || 5;
      console.warn(`Backend rate limited. Retry after ${retryAfter}s`);
      // Return a special object so callers can handle it
      return { rateLimited: true, retryAfter };
    }

    if (res.status === 401) {
      // Session expired — clear it
      clearSession();
      return { authError: true };
    }

    return res;
  } catch (err) {
    console.error("API request failed:", err);
    return null;
  }
}

export async function searchCars(query) {
  try {
    const res = await apiRequest(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`
    );

    if (!res || res.rateLimited || res.authError) return [];
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Search request failed:", err);
    return [];
  }
}

export async function getAllBrands() {
  try {
    const res = await apiRequest(`${BASE_URL}/brands`);
    if (!res || res.rateLimited || res.authError) return [];
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

// =============================================
// RESERVATIONS API (Authenticated)
// =============================================

export async function bookTestDrive(data) {
  try {
    // Ensure session exists
    if (!hasSession()) {
      throw new Error("No active session. Please authenticate first.");
    }

    const res = await apiRequest(`${BASE_URL}/reserve`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!res) return false;
    if (res.rateLimited) return false;
    if (res.authError) return false;
    return res.ok;
  } catch (err) {
    console.error("Booking failed:", err);
    return false;
  }
}

export async function getReservations() {
  try {
    if (!hasSession()) return [];

    const res = await apiRequest(`${BASE_URL}/reservations`, {
      headers: getAuthHeaders()
    });

    if (!res || res.rateLimited || res.authError) return [];
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch reservations:", err);
    return [];
  }
}

export async function markReservationComplete(id) {
  try {
    if (!hasSession()) return;

    await apiRequest(`${BASE_URL}/reservations/${id}/complete`, {
      method: "PUT",
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error("Failed to update reservation:", err);
  }
}

export async function clearCompletedReservations() {
  try {
    if (!hasSession()) return;

    await apiRequest(`${BASE_URL}/reservations/completed`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error("Failed to clear reservations:", err);
  }
}
