// ============================================================================
// SECTION 1: CLIENT & CONFIGURATION
// ============================================================================

// Automatically switch between production and development API endpoints
const RAW_BASE = (typeof import.meta !== "undefined" && import.meta.env)
  ? (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  : "http://localhost:5000";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api`;

/**
 * Centralized API request wrapper with auto-retry, auth expiration dispatch, and uniform error handling.
 */
/**
 * Centralized API request wrapper with auto-retry, auth expiration dispatch, and uniform error handling.
 */
export async function apiRequest(path, { method = "GET", body, headers = {}, retries = 1, signal = null } = {}) {
  const url = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${BASE_URL}${path.startsWith("/api") ? path.slice(4) : (path.startsWith("/") ? path : `/${path}`)}`;

  for (let attempt = 0; ; attempt++) {
    try {
      const isJson = body && typeof body === "object" && !(body instanceof FormData);
      const reqHeaders = {
        "X-Requested-With": "fetch",
        ...(isJson ? { "Content-Type": "application/json" } : {}),
        ...headers
      };

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: reqHeaders,
        body: isJson ? JSON.stringify(body) : body,
        signal
      });

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth:expired"));
        }
        throw new Error("Session expired");
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const detailedMsg = errJson.issues?.[0]?.message || errJson.error || `HTTP ${res.status}`;
        throw new Error(detailedMsg);
      }

      return await res.json();
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      const retryable = method === "GET" && attempt < retries && err.message !== "Session expired";
      if (!retryable) {
        console.error(`[api] ${method} ${path}:`, err.message);
        throw err;
      }
    }
  }
}

// ============================================================================
// SECTION 2: DEVICE-BOUND BOOKING TOKENS
// ============================================================================

const MANAGE_TOKENS_KEY = "adw_manage_tokens";

/**
 * Retrieves stored user booking manage tokens from localStorage.
 * @returns {string[]}
 */
export function getManageTokens() {
  try {
    const raw = localStorage.getItem(MANAGE_TOKENS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persists a new booking manage token to localStorage.
 * @param {string} token
 */
export function saveManageToken(token) {
  if (!token || typeof token !== "string") return;
  try {
    const tokens = getManageTokens();
    if (!tokens.includes(token)) {
      tokens.unshift(token);
      localStorage.setItem(MANAGE_TOKENS_KEY, JSON.stringify(tokens.slice(0, 50)));
    }
  } catch (err) {
    console.warn("Failed to store manage_token:", err);
  }
}

/**
 * Removes a specific booking manage token from localStorage.
 * @param {string} token
 */
export function removeManageToken(token) {
  if (!token) return;
  try {
    const tokens = getManageTokens().filter((t) => t !== token);
    localStorage.setItem(MANAGE_TOKENS_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.warn("Failed to remove manage_token:", err);
  }
}

/**
 * Clears all stored booking manage tokens from this device.
 */
export function clearAllManageTokens() {
  localStorage.removeItem(MANAGE_TOKENS_KEY);
}

/**
 * Checks if this device has any stored booking tokens.
 * @returns {boolean}
 */
export function hasStoredTokens() {
  return getManageTokens().length > 0;
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
      const data = await apiRequest(`/images?q=${encodeURIComponent(carName)}`, { signal });
      if (data?.url) {
        imageCache.set(cacheKey, data.url);
        scheduleCacheSave();
        return data.url;
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

    const data = await apiRequest(`/suggest?q=${encodeURIComponent(trimmed)}`, { signal });
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
    const data = await apiRequest(`/brand/${encodeURIComponent(brand)}/cars?page=${page}`, { signal });
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
    return await apiRequest(
      `/car-specs?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`,
      { method: "GET", retries: 1, signal }
    );
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
 * @param {string} [field="general"] Target field name.
 * @param {string} [proposedValue=""] Proposed correction.
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
export async function reportCarSpecs(specKey, message, field = "general", proposedValue = "", signal = null) {
  try {
    const payload = {
      spec_key: specKey,
      field: field || "general",
      message: message.trim()
    };
    if (proposedValue) {
      payload.proposed_value = proposedValue.trim();
    }

    const data = await apiRequest("/car-specs/report", {
      method: "POST",
      body: payload,
      signal
    });

    return { ok: true, message: data.message };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false };
    console.error("Report car specs failed:", err);
    return { ok: false, error: err.message };
  }
}

// ============================================================================
// SECTION 5: RESERVATIONS API (AUTHENTICATED VIA MANAGE TOKENS)
// ============================================================================

/**
 * Pre-fetches vehicle specs and image into server cache on card hover.
 * @param {string} brand
 * @param {string} model
 */
export function prefetchCarSpecs(brand, model) {
  if (!brand || !model) return;
  apiRequest(`/car-specs?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`).catch(() => {});
}

/**
 * Submits a test drive reservation. Returns manage_token.
 * @param {Object} data Reservation details.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, id?: number, manage_token?: string, error?: string}>}
 */
export async function bookTestDrive(data, signal = null) {
  try {
    const result = await apiRequest("/reserve", {
      method: "POST",
      body: data,
      signal
    });

    if (result.manage_token) {
      saveManageToken(result.manage_token);
    }

    return {
      ok: true,
      id: result.id,
      manage_token: result.manage_token,
      message: result.message
    };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "aborted" };
    return { ok: false, error: err.message || "Network error" };
  }
}

/**
 * Fetches user's current reservations stored on this device or in session.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<Array>} List of reservation objects.
 */
export async function getReservations(signal = null) {
  try {
    const tokens = getManageTokens();
    const data = await apiRequest("/reservations/lookup", {
      method: "POST",
      body: { tokens },
      signal
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err?.name === "AbortError") return [];
    console.error("Failed to fetch reservations:", err);
    return [];
  }
}

/**
 * Cancels a reservation by ID.
 * @param {string|number} id
 * @param {string} [token=null]
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function cancelReservation(id, token = null, signal = null) {
  try {
    const effectiveToken = token || getManageTokens()[0];
    const headers = effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};

    await apiRequest(`/reservations/${id}`, {
      method: "DELETE",
      headers,
      signal
    });

    if (effectiveToken) {
      removeManageToken(effectiveToken);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || "Network error" };
  }
}

/**
 * Reschedules a reservation to a new date.
 * @param {string|number} id
 * @param {string} newDate YYYY-MM-DD
 * @param {string} [token=null]
 * @param {AbortSignal} [signal=null]
 * @returns {Promise<{ok: boolean, date?: string, error?: string}>}
 */
export async function rescheduleReservation(id, newDate, token = null, signal = null) {
  try {
    const effectiveToken = token || getManageTokens()[0];
    const headers = effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};

    await apiRequest(`/reservations/${id}/reschedule`, {
      method: "PUT",
      headers,
      body: { date: newDate },
      signal
    });

    return { ok: true, date: newDate };
  } catch (err) {
    return { ok: false, error: err.message || "Network error" };
  }
}

/**
 * Marks a specific reservation complete.
 * @param {string|number} id Reservation ID.
 * @param {string} [token=null]
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function markReservationComplete(id, token = null, signal = null) {
  try {
    const effectiveToken = token || getManageTokens()[0];
    const headers = effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};

    await apiRequest(`/reservations/${id}/complete`, {
      method: "PUT",
      headers,
      signal
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Clears all completed user reservations for stored device tokens or active session.
 * @param {AbortSignal} [signal=null] Optional AbortSignal.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function clearCompletedReservations(signal = null) {
  try {
    const tokens = getManageTokens();
    await apiRequest("/reservations/clear-completed", {
      method: "POST",
      body: { tokens },
      signal
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Requests a single-use magic login link sent to the user's email.
 * @param {string} email
 * @returns {Promise<{ok: boolean, message?: string, debugUrl?: string, error?: string}>}
 */
export async function requestMagicLink(email) {
  try {
    return await apiRequest("/auth/magic-link", {
      method: "POST",
      body: { email }
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Exchanges a single-use magic token for an authenticated HttpOnly session cookie.
 * @param {string} magicToken
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
export async function verifyMagicToken(magicToken) {
  try {
    return await apiRequest("/auth/verify-magic", {
      method: "POST",
      body: { magicToken }
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

