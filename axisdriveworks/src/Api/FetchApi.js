// ============================================================================
// SECTION 1: CLIENT & CONFIGURATION
// ============================================================================

// Automatically switch between production and development API endpoints
const RAW_BASE = (typeof import.meta !== "undefined" && import.meta.env)
  ? (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  : "http://localhost:5000";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api`;

// ============================================================================
// SECTION 2: SESSION MANAGEMENT
// ============================================================================

const SESSION_KEY = "adw_session_token";
const SESSION_EMAIL_KEY = "adw_session_email";
const SESSION_TS_KEY = "adw_session_ts";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Retrieves the current session token, automatically expiring sessions older than 24 hours.
 * @returns {string|null} Session token or null if missing/expired.
 */
export function getSessionToken() {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!token) return null;

  const tsStr = sessionStorage.getItem(SESSION_TS_KEY);
  if (tsStr) {
    const timestamp = parseInt(tsStr, 10);
    if (Date.now() - timestamp > SESSION_MAX_AGE_MS) {
      clearSession();
      return null;
    }
  }
  return token;
}

/**
 * Retrieves the active session user email.
 * @returns {string|null} Session email or null.
 */
export function getSessionEmail() {
  if (!getSessionToken()) return null;
  return sessionStorage.getItem(SESSION_EMAIL_KEY);
}

/**
 * Clears all active session storage items.
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EMAIL_KEY);
  sessionStorage.removeItem(SESSION_TS_KEY);
}

/**
 * Checks if a valid non-expired session exists.
 * @returns {boolean} True if active session exists.
 */
export function hasSession() {
  return !!getSessionToken();
}

/**
 * Creates a new session with backend authentication token.
 * @param {string} email User email address.
 * @returns {Promise<Object>} Session data.
 */
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
    sessionStorage.setItem(SESSION_TS_KEY, Date.now().toString());
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

// ============================================================================
// SECTION 3: IMAGE ENGINE (QUEUE, LRU CACHE, PROVIDERS)
// ============================================================================

// --- 3.1 LRU CACHE WITH LOCALSTORAGE PERSISTENCE ---

class LRUCache {
  constructor(limit = 200) {
    this.limit = limit;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }
}

const LOCAL_STORAGE_CACHE_KEY = "adw_image_cache_v1";
const imageCache = new LRUCache(200);
const inFlightRequests = new Map(); // Map<cacheKey, Promise<string>>

// Load persisted non-SVG image cache from localStorage on module init
(function initPersistedCache() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        for (const [k, v] of parsed) {
          if (typeof v === "string" && !v.startsWith("data:image/svg+xml")) {
            imageCache.set(k, v);
          }
        }
      }
    }
  } catch {
    // Ignore storage read failures
  }
})();

let saveTimeout = null;
function scheduleCacheSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      // Filter out SVG placeholders before saving
      const entriesToSave = [];
      for (const [k, v] of imageCache.cache.entries()) {
        if (typeof v === "string" && !v.startsWith("data:image/svg+xml")) {
          entriesToSave.push([k, v]);
        }
      }
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(entriesToSave));
    } catch {
      // Ignore storage write failures
    }
  }, 1000);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Dynamic SVG banner generator for high-tech cyberpunk placeholder when no web photo is available.
 * @param {string} carName Vehicle full name.
 * @param {string} [brand=""] Brand name.
 * @returns {string} Encoded SVG data URL.
 */
export function getCarPlaceholderSvg(carName, brand = "") {
  const brandNameRaw = brand || carName.split(" ")[0] || "Axis";
  const modelNameRaw = carName.replace(brandNameRaw, "").trim() || carName;

  const safeBrandName = escapeXml(brandNameRaw.toUpperCase());
  const safeModelName = escapeXml(modelNameRaw);
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
    <ellipse cx="400" cy="270" rx="320" ry="80" fill="${accent.c1}" opacity="0.08" filter="url(#neon)" />
    <path d="M 180 320 L 220 280 L 310 240 L 490 240 L 580 280 L 620 320 L 590 325 L 560 300 L 470 300 L 440 325 L 360 325 L 330 300 L 240 300 L 210 325 Z" fill="none" stroke="url(#glowGrad)" stroke-width="2.5" filter="url(#neon)" />
    <circle cx="285" cy="315" r="28" fill="#0d1117" stroke="${accent.c1}" stroke-width="2" />
    <circle cx="285" cy="315" r="14" fill="none" stroke="${accent.c2}" stroke-width="1.5" />
    <circle cx="515" cy="315" r="28" fill="#0d1117" stroke="${accent.c1}" stroke-width="2" />
    <circle cx="515" cy="315" r="14" fill="none" stroke="${accent.c2}" stroke-width="1.5" />
    <line x1="120" y1="343" x2="680" y2="343" stroke="url(#glowGrad)" stroke-width="1.5" filter="url(#neon)" opacity="0.7"/>
    <text x="400" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="6" fill="${accent.c1}" text-anchor="middle" opacity="0.9">${safeBrandName}</text>
    <text x="400" y="195" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" letter-spacing="2" fill="#ffffff" text-anchor="middle">${safeModelName}</text>
    <text x="400" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" letter-spacing="4" fill="rgba(255,255,255,0.4)" text-anchor="middle">AXIS DRIVEWORKS EDITION</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Fetches an optimal car photo using priority providers (Pexels -> Unsplash -> Pixabay -> Wikimedia).
 * Features in-flight deduplication, race-safe URL reservation, LRU caching, and abort signal support.
 * @param {string} carName Vehicle name.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<string>} Image URL or SVG data URL fallback.
 */
export async function getCarImage(carName, signal = null) {
  const cacheKey = carName.trim().toLowerCase();

  // 1. Check LRU Cache
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  // 2. In-flight Deduplication
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const res = await apiRequest(`${BASE_URL}/images?q=${encodeURIComponent(carName)}`, {}, signal);
      if (res && res.ok) {
        const data = await res.json();
        if (data?.url) {
          imageCache.set(cacheKey, data.url);
          scheduleCacheSave();
          return data.url;
        }
      }
    } catch {
      // Quiet fail to fallback
    }

    // Fallback: Cyberpunk SVG
    const brand = carName.split(" ")[0] || "Car";
    const fallbackSvg = getCarPlaceholderSvg(carName, brand);
    imageCache.set(cacheKey, fallbackSvg);
    return fallbackSvg;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// ============================================================================
// SECTION 4: CAR DATA API (PUBLIC)
// ============================================================================

async function apiRequest(url, options = {}, signal = null) {
  const fetchOpts = signal ? { ...options, signal } : options;
  try {
    let res = await fetch(url, fetchOpts);

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = data.retryAfter || 5;
      console.warn(`Backend rate limited. Retrying after ${retryAfter}s once...`);

      await new Promise(r => setTimeout(r, retryAfter * 1000));
      res = await fetch(url, fetchOpts);

      if (res.status === 429) {
        return { rateLimited: true, retryAfter };
      }
    }

    if (res.status === 401) {
      clearSession();
      return { authError: true };
    }

    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      return { aborted: true };
    }
    console.error("API request failed:", err);
    return null;
  }
}

/**
 * Fetches vehicle suggestions for autocomplete.
 * @param {string} query Search input.
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<Array>} List of suggestion objects.
 */
export async function fetchSuggestions(query, signal = null) {
  try {
    const trimmed = String(query || "").trim();
    if (trimmed.length < 2) return [];

    const res = await apiRequest(
      `${BASE_URL}/suggest?q=${encodeURIComponent(trimmed)}`,
      {},
      signal
    );

    if (!res || res.rateLimited || res.authError || res.aborted) return [];
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err?.name === "AbortError") return [];
    console.error("Suggest request failed:", err);
    return [];
  }
}

/**
 * Fetches paginated cars for a specific brand.
 * @param {string} brand Brand name.
 * @param {number} [page=1] Page number.
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<{brand: string, page: number, total: number, totalPages: number, cars: Array}>}
 */
export async function fetchBrandCars(brand, page = 1, signal = null) {
  try {
    const res = await apiRequest(
      `${BASE_URL}/brand/${encodeURIComponent(brand)}/cars?page=${page}`,
      {},
      signal
    );

    if (!res || res.rateLimited || res.authError || res.aborted) {
      return { brand, page: 1, total: 0, totalPages: 1, cars: [] };
    }
    if (!res.ok) {
      return { brand, page: 1, total: 0, totalPages: 1, cars: [] };
    }

    const data = await res.json();
    return data || { brand, page: 1, total: 0, totalPages: 1, cars: [] };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { brand, page: 1, total: 0, totalPages: 1, cars: [] };
    }
    console.error("Fetch brand cars failed:", err);
    return { brand, page: 1, total: 0, totalPages: 1, cars: [] };
  }
}

/**
 * Fetches verified specifications for a vehicle (cached 90 days).
 * @param {string} brand Vehicle brand.
 * @param {string} model Vehicle model.
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<Object|null>}
 */
export async function fetchCarSpecs(brand, model, signal = null) {
  try {
    const res = await apiRequest(
      `${BASE_URL}/car-specs?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`,
      {},
      signal
    );

    if (!res || res.rateLimited || res.authError || res.aborted) return null;
    if (!res.ok) return null;

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") return null;
    console.error("Fetch car specs failed:", err);
    return null;
  }
}

/**
 * Submits a user report for incorrect specification data.
 * @param {string} specKey Stable spec_key.
 * @param {string} message Description of error.
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
export async function reportCarSpecs(specKey, message, signal = null) {
  try {
    const res = await apiRequest(
      `${BASE_URL}/car-specs/report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec_key: specKey, message })
      },
      signal
    );

    if (!res || !res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, message: data.message };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false };
    console.error("Report car specs failed:", err);
    return { ok: false };
  }
}

// SECTION 5: RESERVATIONS API (AUTHENTICATED)
// ============================================================================

/**
 * Submits a test drive reservation.
 * @param {Object} data Reservation details.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, error?: string}>} Structured result status.
 */
export async function bookTestDrive(data, signal = null) {
  try {
    if (!hasSession()) {
      return { ok: false, error: "auth" };
    }

    const res = await apiRequest(`${BASE_URL}/reserve`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    }, signal);

    if (!res) return { ok: false, error: "network" };
    if (res.aborted) return { ok: false, error: "aborted" };
    if (res.rateLimited) return { ok: false, error: "rate_limited" };
    if (res.authError) return { ok: false, error: "auth" };

    if (!res.ok) return { ok: false, error: "server" };
    return { ok: true };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "aborted" };
    console.error("Booking failed:", err);
    return { ok: false, error: "network" };
  }
}

/**
 * Fetches user's current reservations.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<Array>} List of reservation objects.
 */
export async function getReservations(signal = null) {
  try {
    if (!hasSession()) return [];

    const res = await apiRequest(`${BASE_URL}/reservations`, {
      headers: getAuthHeaders()
    }, signal);

    if (!res || res.rateLimited || res.authError || res.aborted) return [];
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") return [];
    console.error("Failed to fetch reservations:", err);
    return [];
  }
}

/**
 * Marks a specific reservation complete.
 * @param {string|number} id Reservation ID.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, error?: string}>} Structured result status.
 */
export async function markReservationComplete(id, signal = null) {
  try {
    if (!hasSession()) {
      return { ok: false, error: "auth" };
    }

    const res = await apiRequest(`${BASE_URL}/reservations/${id}/complete`, {
      method: "PUT",
      headers: getAuthHeaders()
    }, signal);

    if (!res) return { ok: false, error: "network" };
    if (res.aborted) return { ok: false, error: "aborted" };
    if (res.rateLimited) return { ok: false, error: "rate_limited" };
    if (res.authError) return { ok: false, error: "auth" };
    if (!res.ok) return { ok: false, error: "server" };

    return { ok: true };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "aborted" };
    console.error("Failed to update reservation:", err);
    return { ok: false, error: "network" };
  }
}

/**
 * Clears all completed user reservations.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, error?: string}>} Structured result status.
 */
export async function clearCompletedReservations(signal = null) {
  try {
    if (!hasSession()) {
      return { ok: false, error: "auth" };
    }

    const res = await apiRequest(`${BASE_URL}/reservations/completed`, {
      method: "DELETE",
      headers: getAuthHeaders()
    }, signal);

    if (!res) return { ok: false, error: "network" };
    if (res.aborted) return { ok: false, error: "aborted" };
    if (res.rateLimited) return { ok: false, error: "rate_limited" };
    if (res.authError) return { ok: false, error: "auth" };
    if (!res.ok) return { ok: false, error: "server" };

    return { ok: true };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "aborted" };
    console.error("Failed to clear reservations:", err);
    return { ok: false, error: "network" };
  }
}
