import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyAdminToken, logSecurityAudit } from "./security.js";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export const SESSION_COOKIE_NAME = "adw_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days absolute expiry
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

/**
 * Verifies a Firebase ID token using Google's public JWKS.
 * Validates issuer, audience, and expiration.
 */
export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing ID token");
  }

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is not configured in server environment");
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId
  });

  return {
    uid: payload.sub || payload.user_id,
    email: payload.email?.toLowerCase().trim(),
    name: payload.name || payload.email?.split("@")[0] || "User",
    picture: payload.picture || null,
    email_verified: !!payload.email_verified
  };
}

/**
 * Resolves authenticated user from:
 * 1. ADMIN_TOKEN header
 * 2. Hardened session cookie (adw_session)
 * 3. Authorization: Bearer <sessionId>
 */
export async function resolveUserFromSession(req, db) {
  // Check Admin Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (verifyAdminToken(bearer)) {
      return { isAdmin: true, role: "admin", uid: "admin", email: "admin@axisdriveworks.internal", name: "Administrator" };
    }
  }

  // Extract session ID from cookie or bearer
  let sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  if (!sessionId && authHeader && authHeader.startsWith("Bearer ")) {
    sessionId = authHeader.slice(7).trim();
  }

  if (!sessionId || typeof sessionId !== "string") {
    return null;
  }

  try {
    const session = await db.get(
      `SELECT s.session_id, s.uid, s.email, s.name, s.picture, s.created_at, s.last_active, s.expires_at, u.role 
       FROM user_sessions s 
       LEFT JOIN users u ON s.uid = u.uid 
       WHERE s.session_id = ?`,
      [sessionId]
    );

    if (!session) return null;

    const now = Date.now();

    // Check absolute expiration (7 days)
    if (now > session.expires_at) {
      await db.run("DELETE FROM user_sessions WHERE session_id = ?", [sessionId]);
      return null;
    }

    // Check idle timeout (30 minutes)
    if (now - session.last_active > SESSION_IDLE_TIMEOUT_MS) {
      await db.run("DELETE FROM user_sessions WHERE session_id = ?", [sessionId]);
      return null;
    }

    // Update last_active timestamp
    await db.run("UPDATE user_sessions SET last_active = ? WHERE session_id = ?", [now, sessionId]);

    const role = session.role || "user";
    return {
      sessionId: session.session_id,
      uid: session.uid,
      email: session.email,
      name: session.name,
      picture: session.picture,
      role,
      isAdmin: role === "admin"
    };
  } catch (err) {
    console.error("Session lookup error:", err);
    return null;
  }
}

/**
 * Express middleware generator for authentication and role authorization.
 * Binds req.user when authenticated.
 */
export function createAuthMiddleware(getDb) {
  const requireAuth = async (req, res, next) => {
    const db = getDb();
    const user = await resolveUserFromSession(req, db);

    if (!user) {
      return res.status(401).json({
        error: "Authentication required. Please sign in to continue."
      });
    }

    req.user = user;
    next();
  };

  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const currentRole = req.user.role || (req.user.isAdmin ? "admin" : "user");
    if (!roles.includes(currentRole)) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges." });
    }

    next();
  };

  const optionalAuth = async (req, res, next) => {
    const db = getDb();
    const user = await resolveUserFromSession(req, db);
    if (user) {
      req.user = user;
    }
    next();
  };

  return { requireAuth, requireRole, optionalAuth };
}

export function registerAuthRoutes(app, getDb, isReady) {
  const isProd = process.env.NODE_ENV === "production";

  // POST /api/auth/session: Exchange Firebase ID token for hardened session cookie
  app.post("/api/auth/session", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const { idToken } = req.body || {};
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ error: "Firebase ID token is required." });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({
        error: "Server configuration missing: FIREBASE_PROJECT_ID is not configured in .env"
      });
    }

    try {
      const decodedUser = await verifyFirebaseIdToken(idToken, projectId);
      const db = getDb();

      // Create new server-side session
      const sessionId = crypto.randomBytes(32).toString("hex");
      const now = Date.now();
      const expiresAt = now + SESSION_MAX_AGE_MS;

      // Upsert into user registry
      await db.run(
        `INSERT INTO users (uid, email, name, picture, role, created_at, last_login_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?)
         ON CONFLICT(uid) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           picture = excluded.picture,
           last_login_at = excluded.last_login_at`,
        [decodedUser.uid, decodedUser.email, decodedUser.name, decodedUser.picture, now, now]
      );

      await db.run(
        `INSERT INTO user_sessions (session_id, uid, email, name, picture, created_at, last_active, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, decodedUser.uid, decodedUser.email, decodedUser.name, decodedUser.picture, now, now, expiresAt]
      );

      // Set hardened HttpOnly cookie
      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: SESSION_MAX_AGE_MS,
        path: "/"
      });

      res.json({
        ok: true,
        user: {
          uid: decodedUser.uid,
          email: decodedUser.email,
          name: decodedUser.name,
          picture: decodedUser.picture
        }
      });
    } catch (err) {
      console.error("Firebase auth verification failed:", err);
      return res.status(401).json({ error: "Invalid or expired Firebase ID token." });
    }
  });

  // GET /api/auth/me: Retrieve current authenticated user profile
  app.get("/api/auth/me", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const db = getDb();
    const user = await resolveUserFromSession(req, db);

    if (!user) {
      return res.json({ authenticated: false, user: null });
    }

    res.json({
      authenticated: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isAdmin: !!user.isAdmin
      }
    });
  });

  // POST /api/auth/logout: Destroy server session and clear cookie
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId && isReady()) {
      try {
        const db = getDb();
        await db.run("DELETE FROM user_sessions WHERE session_id = ?", [sessionId]);
      } catch (err) {
        console.error("Logout session deletion error:", err);
      }
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/"
    });

    res.json({ ok: true, message: "Logged out successfully." });
  });

  // POST /api/auth/magic-link: Issue single-use magic login link
  app.post("/api/auth/magic-link", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minutes TTL

    try {
      const db = getDb();
      await db.run(
        `INSERT INTO magic_links (token, email, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`,
        [token, cleanEmail, expiresAt, now]
      );

      const frontendBase = process.env.FRONTEND_URL || "http://localhost:5173";
      const magicUrl = `${frontendBase}/bookings?magic_token=${token}`;

      console.log("\n=======================================================");
      console.log(`✨ [MAGIC LINK GENERATED] For: ${cleanEmail}`);
      console.log(`👉 Link: ${magicUrl}`);
      console.log(`⏰ Expires in: 15 minutes`);
      console.log("=======================================================\n");

      logSecurityAudit("MAGIC_LINK_REQUESTED", {
        email: cleanEmail,
        ip: req.ip
      });

      res.json({
        ok: true,
        message: "Magic access link generated! Please check your inbox or use the link below.",
        debugUrl: !isProd ? magicUrl : undefined
      });
    } catch (err) {
      console.error("Magic link generation error:", err);
      res.status(500).json({ error: "Failed to generate magic link." });
    }
  });

  // POST /api/auth/verify-magic: Exchange magic token for an authenticated HttpOnly session cookie
  app.post("/api/auth/verify-magic", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const { magicToken } = req.body || {};
    if (!magicToken || typeof magicToken !== "string") {
      return res.status(400).json({ error: "Magic token is required." });
    }

    try {
      const db = getDb();
      const link = await db.get(
        `SELECT token, email, expires_at, used FROM magic_links WHERE token = ?`,
        [magicToken.trim()]
      );

      if (!link) {
        return res.status(404).json({ error: "Invalid magic link or link not found." });
      }

      if (link.used) {
        return res.status(410).json({ error: "This magic link has already been used. Please request a new one." });
      }

      const now = Date.now();
      if (now > link.expires_at) {
        return res.status(410).json({ error: "This magic link has expired. Please request a new one." });
      }

      // Mark link as consumed
      await db.run("UPDATE magic_links SET used = 1 WHERE token = ?", [link.token]);

      const email = link.email.toLowerCase().trim();

      // Find or create user
      let user = await db.get("SELECT uid, email, name, picture, role FROM users WHERE email = ? COLLATE NOCASE", [email]);
      if (!user) {
        const uid = "user_" + crypto.randomBytes(12).toString("hex");
        const name = email.split("@")[0];
        await db.run(
          `INSERT INTO users (uid, email, name, picture, role, created_at, last_login_at)
           VALUES (?, ?, ?, NULL, 'user', ?, ?)`,
          [uid, email, name, now, now]
        );
        user = { uid, email, name, picture: null, role: "user" };
      } else {
        await db.run("UPDATE users SET last_login_at = ? WHERE uid = ?", [now, user.uid]);
      }

      // Associate unlinked reservations for this email to this user's UID
      await db.run(
        "UPDATE reservations SET uid = ? WHERE email = ? COLLATE NOCASE AND (uid IS NULL OR uid = '')",
        [user.uid, email]
      );

      // Create hardened server-side session
      const sessionId = crypto.randomBytes(32).toString("hex");
      const expiresAt = now + SESSION_MAX_AGE_MS;

      await db.run(
        `INSERT INTO user_sessions (session_id, uid, email, name, picture, created_at, last_active, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, user.uid, user.email, user.name, user.picture, now, now, expiresAt]
      );

      // Set hardened HttpOnly cookie
      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: SESSION_MAX_AGE_MS,
        path: "/"
      });

      logSecurityAudit("MAGIC_LINK_VERIFIED", {
        uid: user.uid,
        email: user.email,
        ip: req.ip
      });

      res.json({
        ok: true,
        authenticated: true,
        user: {
          uid: user.uid,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (err) {
      console.error("Magic link verification error:", err);
      res.status(500).json({ error: "Failed to verify magic link." });
    }
  });
}
