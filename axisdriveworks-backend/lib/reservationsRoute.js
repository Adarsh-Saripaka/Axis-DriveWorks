import crypto from "crypto";
import { resolveCarBySlugs, makeSpecKey } from "./slug.js";
import { resolveUserFromSession, createAuthMiddleware } from "./authRoute.js";
import {
  verifyAdminToken,
  isValidEmail,
  validateReservationPayload,
  logSecurityAudit
} from "./security.js";

/**
 * Resolves authorization from Bearer token only.
 * URL query parameters (?token=) are explicitly rejected for security.
 */
function resolveAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Check ADMIN_TOKEN via timing-safe constant-time comparison
  if (verifyAdminToken(token)) {
    return { isAdmin: true, role: "admin" };
  }

  // 2. Check manage_token format (alphanumeric string, 16-64 chars)
  if (/^[a-zA-Z0-9_-]{16,64}$/.test(token)) {
    return { isUser: true, manageToken: token, role: "token" };
  }

  return null;
}

/**
 * Pure authorization check for reservation ownership.
 * Grants access if user is admin, matches owner UID/email, or possesses reservation manage_token.
 */
export function canAccessReservation(user, reservation, manageToken = null) {
  if (!user && !manageToken) return false;
  if (user?.role === "admin" || user?.isAdmin) return true;
  if (user?.uid && reservation.uid === user.uid) return true;
  if (user?.email && reservation.email && user.email.toLowerCase() === reservation.email.toLowerCase()) return true;
  if (manageToken && reservation.manage_token === manageToken) return true;
  return false;
}

export function registerReservationsRoutes(app, getDb, isReady) {
  const { requireAuth, requireRole, optionalAuth } = createAuthMiddleware(getDb);

  // Reject tokens passed in query string to prevent credential leaking in logs/history
  app.use("/api/reservations", (req, res, next) => {
    if (req.query.token) {
      return res.status(400).json({ error: "Tokens must be provided in the Authorization header, not in the URL." });
    }
    next();
  });

  // POST /api/reserve: Book a test drive (requires authenticated Google session or Admin)
  app.post("/api/reserve", requireAuth, async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    // Strict schema & type validation
    const payloadValidation = validateReservationPayload(req.body);
    if (!payloadValidation.valid) {
      return res.status(400).json({ error: payloadValidation.error });
    }

    const db = getDb();
    const sessionUser = req.user;

    const { car_brand, car_model, name, date } = req.body;
    // Guaranteed verified identity bound strictly from verified req.user (ignores any client spoofing)
    const userEmail = sessionUser.email;
    const userUid = sessionUser.uid;

    if (!userEmail || !isValidEmail(userEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const cleanName = (typeof name === "string" && name.trim()) ? name.trim() : (sessionUser.name || "Test Driver");

    // Compare date against today using localized ISO date string (YYYY-MM-DD)
    const today = new Date().toLocaleDateString("en-CA");
    if (date < today) {
      return res.status(400).json({ error: "Cannot book a test drive in the past." });
    }

    // Verify the car exists in the catalogue
    const carRow = await resolveCarBySlugs(db, car_brand, car_model);
    if (!carRow) {
      return res.status(404).json({ error: "Car not found in catalog. Please select an existing model." });
    }

    const cleanBrand = carRow.brand;
    const cleanModel = carRow.model;
    const specKey = req.body.spec_key || makeSpecKey(cleanBrand, cleanModel);

    // Duplicate booking prevention (Flaw #9): check if same user/vehicle/date already has an active booking
    const duplicate = await db.get(
      `SELECT id FROM reservations 
       WHERE (uid = ? OR email = ? COLLATE NOCASE) 
         AND car_brand = ? COLLATE NOCASE 
         AND car_model = ? COLLATE NOCASE 
         AND date = ? 
         AND completed = 0`,
      [userUid, userEmail, cleanBrand, cleanModel, date]
    );
    if (duplicate) {
      return res.status(409).json({
        error: "You already have an active test drive reservation for this vehicle on this date."
      });
    }

    // Cryptographically secure manage_token — generated once, returned only upon creation
    const manageToken = crypto.randomBytes(24).toString("hex");
    const createdAt = Date.now();

    try {
      const result = await db.run(
        `INSERT INTO reservations 
         (car_id, car_brand, car_model, name, email, uid, date, completed, manage_token, spec_key, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [carRow.id, cleanBrand, cleanModel, cleanName, userEmail, userUid, date, manageToken, specKey, createdAt]
      );

      logSecurityAudit("RESERVATION_CREATED", {
        reservationId: result.lastID,
        uid: userUid,
        email: userEmail,
        car: `${cleanBrand} ${cleanModel}`,
        date,
        ip: req.ip
      });

      res.status(201).json({
        ok: true,
        success: true,
        id: result.lastID,
        manage_token: manageToken,
        message: "Reservation confirmed successfully."
      });
    } catch (err) {
      console.error("Reservation insert error:", err);
      res.status(500).json({ error: "Failed to create reservation." });
    }
  });

  // POST /api/reservations/lookup: Retrieve reservations for tokens or authenticated session
  // Note: manage_token is deliberately omitted from SELECT results to prevent token leakage
  app.post("/api/reservations/lookup", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);

    if (sessionUser?.isAdmin) {
      const allRows = await db.all(
        "SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at FROM reservations ORDER BY date ASC, id DESC"
      );
      return res.json(allRows);
    }

    if (sessionUser) {
      const rows = await db.all(
        `SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at 
           FROM reservations 
          WHERE uid = ? OR email = ? COLLATE NOCASE 
          ORDER BY date ASC, id DESC`,
        [sessionUser.uid, sessionUser.email]
      );
      return res.json(rows);
    }

    const rawTokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
    const validTokens = rawTokens
      .filter((t) => typeof t === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(t))
      .slice(0, 50);

    if (validTokens.length === 0) {
      return res.json([]);
    }

    try {
      const placeholders = validTokens.map(() => "?").join(",");
      const rows = await db.all(
        `SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at 
           FROM reservations 
          WHERE manage_token IN (${placeholders}) 
          ORDER BY date ASC, id DESC`,
        validTokens
      );
      res.json(rows);
    } catch (err) {
      console.error("Reservations lookup error:", err);
      res.status(500).json({ error: "Failed to lookup reservations." });
    }
  });

  // GET /api/reservations: Fetch reservations for session user or Bearer manage_token / ADMIN_TOKEN
  // Note: manage_token is deliberately omitted from SELECT results to prevent token leakage
  app.get("/api/reservations", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    if (!sessionUser && !headerAuth) {
      return res.status(401).json({ error: "Authentication or valid booking manage token required." });
    }

    try {
      if (sessionUser?.isAdmin || headerAuth?.isAdmin) {
        const rows = await db.all(
          "SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at FROM reservations ORDER BY date ASC, id DESC"
        );
        return res.json(rows);
      }

      if (sessionUser) {
        const rows = await db.all(
          "SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at FROM reservations WHERE uid = ? OR email = ? COLLATE NOCASE ORDER BY date ASC, id DESC",
          [sessionUser.uid, sessionUser.email]
        );
        return res.json(rows);
      }

      const rows = await db.all(
        "SELECT id, car_id, car_brand, car_model, name, email, uid, date, completed, spec_key, created_at FROM reservations WHERE manage_token = ? ORDER BY date ASC, id DESC",
        [headerAuth.manageToken]
      );
      res.json(rows);
    } catch (err) {
      console.error("Reservations query error:", err);
      res.status(500).json({ error: "Failed to fetch reservations." });
    }
  });

  // POST /api/reservations/clear-completed: Clear completed reservations
  app.post("/api/reservations/clear-completed", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    try {
      if (sessionUser?.isAdmin || headerAuth?.isAdmin) {
        await db.run("DELETE FROM reservations WHERE completed = 1");
        return res.json({ ok: true, success: true });
      }

      if (sessionUser) {
        await db.run("DELETE FROM reservations WHERE completed = 1 AND (uid = ? OR email = ? COLLATE NOCASE)", [
          sessionUser.uid,
          sessionUser.email
        ]);
        return res.json({ ok: true, success: true });
      }

      if (headerAuth?.manageToken) {
        await db.run("DELETE FROM reservations WHERE completed = 1 AND manage_token = ?", [headerAuth.manageToken]);
        return res.json({ ok: true, success: true });
      }

      const rawTokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
      const validTokens = rawTokens
        .filter((t) => typeof t === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(t))
        .slice(0, 50);

      if (validTokens.length > 0) {
        const placeholders = validTokens.map(() => "?").join(",");
        await db.run(
          `DELETE FROM reservations WHERE completed = 1 AND manage_token IN (${placeholders})`,
          validTokens
        );
        return res.json({ ok: true, success: true });
      }

      return res.status(401).json({ error: "Authentication or booking tokens required." });
    } catch (err) {
      console.error("Clear completed error:", err);
      res.status(500).json({ error: "Failed to clear completed reservations." });
    }
  });

  // Helper to check ownership of reservation
  async function findUserReservation(db, id, sessionUser, headerAuth) {
    const reservation = await db.get("SELECT * FROM reservations WHERE id = ?", [id]);
    if (!reservation) return null;
    if (canAccessReservation(sessionUser, reservation, headerAuth?.manageToken)) {
      return reservation;
    }
    return null;
  }

  // POST /api/reservations/:id/rotate-token: Rotates a manage_token securely
  app.post("/api/reservations/:id/rotate-token", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid reservation ID." });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    if (!sessionUser && !headerAuth) {
      return res.status(401).json({ error: "Authentication or valid manage token required." });
    }

    try {
      const reservation = await findUserReservation(db, id, sessionUser, headerAuth);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found." });
      }

      const newManageToken = crypto.randomBytes(24).toString("hex");
      await db.run("UPDATE reservations SET manage_token = ? WHERE id = ?", [newManageToken, id]);

      logSecurityAudit("TOKEN_ROTATED", {
        reservationId: id,
        user: sessionUser?.uid || "token-bearer",
        ip: req.ip
      });

      res.json({
        ok: true,
        success: true,
        id,
        manage_token: newManageToken,
        message: "Booking manage token rotated successfully."
      });
    } catch (err) {
      console.error("Rotate token error:", err);
      res.status(500).json({ error: "Failed to rotate token." });
    }
  });

  // PUT /api/reservations/:id/complete: Mark reservation as completed
  app.put("/api/reservations/:id/complete", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid reservation ID." });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    if (!sessionUser && !headerAuth) {
      return res.status(401).json({ error: "Authentication or valid manage token required." });
    }

    try {
      const reservation = await findUserReservation(db, id, sessionUser, headerAuth);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found." });
      }

      await db.run("UPDATE reservations SET completed = 1 WHERE id = ?", [id]);

      logSecurityAudit("RESERVATION_COMPLETED", {
        reservationId: id,
        user: sessionUser?.uid || "token-bearer",
        ip: req.ip
      });

      res.json({ ok: true, success: true, message: "Reservation marked as completed." });
    } catch (err) {
      console.error("Complete reservation error:", err);
      res.status(500).json({ error: "Failed to update reservation." });
    }
  });

  // PUT /api/reservations/:id/reschedule: Reschedule reservation date
  app.put("/api/reservations/:id/reschedule", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid reservation ID." });

    const { date } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Valid date in YYYY-MM-DD format is required." });
    }

    const today = new Date().toLocaleDateString("en-CA");
    if (date < today) {
      return res.status(400).json({ error: "Cannot reschedule to a past date." });
    }

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    if (!sessionUser && !headerAuth) {
      return res.status(401).json({ error: "Authentication or valid manage token required." });
    }

    try {
      const reservation = await findUserReservation(db, id, sessionUser, headerAuth);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found." });
      }

      await db.run("UPDATE reservations SET date = ?, completed = 0 WHERE id = ?", [date, id]);

      logSecurityAudit("RESERVATION_RESCHEDULED", {
        reservationId: id,
        newDate: date,
        user: sessionUser?.uid || "token-bearer",
        ip: req.ip
      });

      res.json({ ok: true, success: true, date, message: "Reservation rescheduled successfully." });
    } catch (err) {
      console.error("Reschedule reservation error:", err);
      res.status(500).json({ error: "Failed to reschedule reservation." });
    }
  });

  // DELETE /api/reservations/:id: Cancel reservation
  app.delete("/api/reservations/:id", async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Database Loading" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid reservation ID." });

    const db = getDb();
    const sessionUser = await resolveUserFromSession(req, db);
    const headerAuth = resolveAuthHeader(req);

    if (!sessionUser && !headerAuth) {
      return res.status(401).json({ error: "Authentication or valid manage token required." });
    }

    try {
      const reservation = await findUserReservation(db, id, sessionUser, headerAuth);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found." });
      }

      await db.run("DELETE FROM reservations WHERE id = ?", [id]);

      logSecurityAudit("RESERVATION_CANCELLED", {
        reservationId: id,
        user: sessionUser?.uid || "token-bearer",
        ip: req.ip
      });

      res.json({ ok: true, success: true, message: "Reservation cancelled successfully." });
    } catch (err) {
      console.error("Cancel reservation error:", err);
      res.status(500).json({ error: "Failed to cancel reservation." });
    }
  });
}
