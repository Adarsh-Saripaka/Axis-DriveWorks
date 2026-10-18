import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { registerReservationsRoutes } from "../lib/reservationsRoute.js";
import { registerAuthRoutes, SESSION_COOKIE_NAME } from "../lib/authRoute.js";
import { runMigrations } from "../lib/migrations.js";
import { csrfGuard } from "../lib/security.js";

const TEST_ADMIN_TOKEN = "super-secret-admin-token-123456";
const TEST_SESSION_ID = "valid-test-session-token-abcdef123456";
const TEST_USER = {
  uid: "firebase-uid-alice-123",
  email: "alice@example.com",
  name: "Alice Walker"
};

process.env.ADMIN_TOKEN = TEST_ADMIN_TOKEN;

let app;
let server;
let db;
let port;
let baseUrl;

before(async () => {
  // In-memory SQLite database
  db = await open({
    filename: ":memory:",
    driver: sqlite3.Database
  });

  // Run migrations
  await runMigrations(db);

  // Create and seed sample car_names
  await db.exec(`
    CREATE TABLE IF NOT EXISTS car_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      brand_slug TEXT,
      model_slug TEXT,
      search_key TEXT NOT NULL,
      has_3d_model INTEGER DEFAULT 0
    );
    INSERT INTO car_names (brand, model, brand_slug, model_slug, search_key, has_3d_model)
    VALUES 
      ('Audi', 'R8', 'audi', 'r8', 'audi r8', 1),
      ('Nissan', 'GT-R', 'nissan', 'gt-r', 'nissan gt-r', 1),
      ('Porsche', '911', 'porsche', '911', 'porsche 911', 0);
  `);

  // Seed test user session
  const now = Date.now();
  await db.run(
    `INSERT INTO user_sessions (session_id, uid, email, name, picture, created_at, last_active, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [TEST_SESSION_ID, TEST_USER.uid, TEST_USER.email, TEST_USER.name, null, now, now, now + 7 * 86400000]
  );

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", csrfGuard);

  registerAuthRoutes(app, () => db, () => true);
  registerReservationsRoutes(app, () => db, () => true);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});

test("GET /api/reservations without cookie/auth returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/reservations`);
  assert.equal(res.status, 401);
});

test("GET /api/reservations with query param ?token= is rejected with 400", async () => {
  const res = await fetch(`${baseUrl}/api/reservations?token=something`);
  assert.equal(res.status, 400);
});

test("GET /api/auth/me returns unauthenticated when no cookie provided", async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, false);
});

test("GET /api/auth/me returns user profile with valid session cookie", async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.user.email, TEST_USER.email);
  assert.equal(data.user.uid, TEST_USER.uid);
});

test("POST /api/reserve without session cookie rejects with 401", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Requested-With": "fetch"
    },
    body: JSON.stringify({
      car_brand: "Audi",
      car_model: "R8",
      name: "Guest User",
      date: "2099-01-01"
    })
  });
  assert.equal(res.status, 401);
});

test("POST /api/reserve rejects booking for nonexistent car with 404", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Nonexistent",
      car_model: "FakeCar",
      name: "Alice",
      date: "2099-01-01"
    })
  });
  assert.equal(res.status, 404);
});

test("POST /api/reserve rejects booking in the past with 400", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Audi",
      car_model: "R8",
      name: "Alice",
      date: "2000-01-01"
    })
  });
  assert.equal(res.status, 400);
});

let createdId;
let createdToken;

test("POST /api/reserve creates booking for authenticated user with verified email", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Nissan",
      car_model: "gt-r",
      name: "Alice Walker",
      date: "2099-05-15"
    })
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.id);
  assert.ok(data.manage_token);

  createdId = data.id;
  createdToken = data.manage_token;
});

test("GET /api/reservations with session cookie returns user reservations", async () => {
  const res = await fetch(`${baseUrl}/api/reservations`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].email, TEST_USER.email);
  assert.equal(rows[0].uid, TEST_USER.uid);
});

test("PUT /api/reservations/:id/reschedule updates date for owner session", async () => {
  const res = await fetch(`${baseUrl}/api/reservations/${createdId}/reschedule`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({ date: "2099-06-20" })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.date, "2099-06-20");
});

test("PUT /api/reservations/:id/complete marks completed for owner session", async () => {
  const res = await fetch(`${baseUrl}/api/reservations/${createdId}/complete`, {
    method: "PUT",
    headers: {
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
});

test("POST /api/reservations/clear-completed clears completed for owner session", async () => {
  const res = await fetch(`${baseUrl}/api/reservations/clear-completed`, {
    method: "POST",
    headers: {
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  // Check that completed reservations are cleared
  const check = await fetch(`${baseUrl}/api/reservations`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  const rows = await check.json();
  assert.equal(rows.length, 0);
});

test("ADMIN access with Authorization Bearer ADMIN_TOKEN succeeds", async () => {
  const res = await fetch(`${baseUrl}/api/reservations`, {
    headers: {
      Authorization: `Bearer ${TEST_ADMIN_TOKEN}`
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test("GET /api/reservations does NOT expose manage_token in query results", async () => {
  // Re-create a booking to check returned fields
  const bookRes = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Audi",
      car_model: "R8",
      name: "Alice Walker",
      date: "2099-11-20"
    })
  });
  assert.equal(bookRes.status, 201);
  const bookData = await bookRes.json();
  const resId = bookData.id;
  const initialToken = bookData.manage_token;
  assert.ok(initialToken, "manage_token must be returned once on creation");

  // Query reservations via session
  const getRes = await fetch(`${baseUrl}/api/reservations`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  const rows = await getRes.json();
  assert.ok(rows.length > 0);
  const target = rows.find((r) => r.id === resId);
  assert.ok(target);
  assert.equal(target.manage_token, undefined, "manage_token must NOT be present in query responses");

  // Rotate manage token
  const rotateRes = await fetch(`${baseUrl}/api/reservations/${resId}/rotate-token`, {
    method: "POST",
    headers: {
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    }
  });
  assert.equal(rotateRes.status, 200);
  const rotateData = await rotateRes.json();
  assert.equal(rotateData.ok, true);
  assert.ok(rotateData.manage_token);
  assert.notEqual(rotateData.manage_token, initialToken, "Rotated token must be different from initial token");
});

test("POST /api/reserve ignores spoofed email/uid in body and binds authenticated session identity", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Porsche",
      car_model: "911",
      date: "2099-12-01",
      email: "spoofed-hacker@attacker.com",
      uid: "spoofed-hacker-uid",
      name: "Spoofer"
    })
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.ok, true);

  // Verify in database that the reservation has Alice's UID and email, NOT spoofed values
  const row = await db.get("SELECT email, uid FROM reservations WHERE id = ?", [data.id]);
  assert.equal(row.uid, TEST_USER.uid);
  assert.equal(row.email, TEST_USER.email);
});

test("POST /api/reserve rejects duplicate booking for same user + car + date with 409", async () => {
  // First booking for Porsche 911 on 2099-12-05
  const res1 = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Porsche",
      car_model: "911",
      date: "2099-12-05",
      name: "Alice"
    })
  });
  assert.equal(res1.status, 201);

  // Duplicate booking attempt
  const res2 = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
    },
    body: JSON.stringify({
      car_brand: "Porsche",
      car_model: "911",
      date: "2099-12-05",
      name: "Alice"
    })
  });
  assert.equal(res2.status, 409);
  const err = await res2.json();
  assert.match(err.error, /already have an active test drive reservation/i);
});

test("POST /api/reserve without X-Requested-With header fails with 403 CSRF", async () => {
  const res = await fetch(`${baseUrl}/api/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`
      // Omit X-Requested-With
    },
    body: JSON.stringify({
      car_brand: "Porsche",
      car_model: "911",
      name: "Alice",
      date: "2099-07-01"
    })
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /CSRF/i);
});

test("POST /api/auth/logout with session cookie clears session from database", async () => {
  const logoutSessionId = "temp-logout-session-id-123456";
  const now = Date.now();
  await db.run(
    `INSERT INTO user_sessions (session_id, uid, email, name, picture, created_at, last_active, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [logoutSessionId, "temp-user", "temp@example.com", "Temp", null, now, now, now + 86400000]
  );

  const res = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      "X-Requested-With": "fetch",
      Cookie: `${SESSION_COOKIE_NAME}=${logoutSessionId}`
    }
  });
  assert.equal(res.status, 200);

  const sessionRow = await db.get("SELECT session_id FROM user_sessions WHERE session_id = ?", [logoutSessionId]);
  assert.equal(sessionRow, undefined);
});


