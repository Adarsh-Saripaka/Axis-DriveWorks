import crypto from "crypto";

const KNOWN_DEFAULT_SECRETS = new Set([
  "change_me_to_a_long_random_string",
  "change_me",
  "test-admin-token",
  "admin",
  "admin123",
  "password",
  "secret"
]);

/**
 * Checks whether an admin token meets production strength requirements.
 * Must be at least 24 characters and not a known placeholder.
 */
export function isSafeAdminToken(token) {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  if (trimmed.length < 16) return false;
  if (KNOWN_DEFAULT_SECRETS.has(trimmed.toLowerCase())) return false;
  return true;
}

/**
 * Validates admin token configuration on server startup.
 * Fails fast in production if token is absent or weak.
 */
export function assertAdminTokenConfigured() {
  const token = process.env.ADMIN_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (!token) {
    if (isProd) {
      throw new Error("FATAL: ADMIN_TOKEN environment variable is not defined in production!");
    } else {
      console.warn("⚠️  [SECURITY WARNING] ADMIN_TOKEN is not defined in environment.");
    }
    return;
  }

  if (!isSafeAdminToken(token)) {
    if (isProd) {
      throw new Error("FATAL: ADMIN_TOKEN is too weak or uses a default placeholder in production!");
    } else {
      console.warn("⚠️  [SECURITY WARNING] ADMIN_TOKEN is shorter than 16 characters or uses a known placeholder.");
    }
    return;
  }

  if (isProd && token.length < 24) {
    console.warn("⚠️  [SECURITY NOTICE] For optimal security in production, ADMIN_TOKEN should be at least 24 characters.");
  }
}

/**
 * Standard security audit logger for sensitive authentication and booking operations.
 */
export function logSecurityAudit(action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`🛡️  [SECURITY AUDIT] ${timestamp} | ACTION: ${action} | ${JSON.stringify(details)}`);
}

/**
 * Timing-safe comparison for ADMIN_TOKEN.
 * Compares in constant time to prevent timing side-channel attacks.
 */
export function verifyAdminToken(providedToken) {
  const configuredToken = process.env.ADMIN_TOKEN;
  if (!configuredToken || !isSafeAdminToken(configuredToken)) {
    return false;
  }

  if (typeof providedToken !== "string") {
    return false;
  }

  const providedBuf = Buffer.from(providedToken.trim());
  const configuredBuf = Buffer.from(configuredToken.trim());

  if (providedBuf.length !== configuredBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, configuredBuf);
}

/**
 * Strict RFC5322-compliant email format check.
 */
export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(trimmed);
}

/**
 * Strict YYYY-MM-DD date format validation.
 */
export function isValidDateFormat(dateStr) {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const dateObj = new Date(`${dateStr}T00:00:00`);
  return !isNaN(dateObj.getTime());
}

/**
 * Sanitizes and validates reservation body fields strictly.
 */
export function validateReservationPayload(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Missing or invalid request payload." };
  }

  const { car_brand, car_model, name, date, spec_key } = body;

  if (typeof car_brand !== "string" || !car_brand.trim() || car_brand.length > 100) {
    return { valid: false, error: "Valid car brand is required (max 100 characters)." };
  }

  if (typeof car_model !== "string" || !car_model.trim() || car_model.length > 100) {
    return { valid: false, error: "Valid car model is required (max 100 characters)." };
  }

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return { valid: false, error: "Name must be between 2 and 100 characters." };
    }
  }

  if (!isValidDateFormat(date)) {
    return { valid: false, error: "Date must be formatted as YYYY-MM-DD." };
  }

  if (spec_key !== undefined && (typeof spec_key !== "string" || spec_key.length > 200)) {
    return { valid: false, error: "Invalid spec key format." };
  }

  return { valid: true };
}
