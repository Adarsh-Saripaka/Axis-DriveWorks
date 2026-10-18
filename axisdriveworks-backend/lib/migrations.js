import { slugify } from "./slug.js";

/**
 * Database migrations module for Axis DriveWorks
 * Runs on server startup with CREATE TABLE IF NOT EXISTS
 * Single source of truth for all database tables and indexes.
 */
export async function runMigrations(db) {
  await db.exec(`
    -- Cached vehicle specs (90-day TTL)
    CREATE TABLE IF NOT EXISTS car_specs (
      spec_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      source_urls TEXT NOT NULL,
      confidence TEXT NOT NULL,
      grounded INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'gemini',
      prompt_version TEXT DEFAULT 'v1',
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_car_specs_fetched ON car_specs(fetched_at);

    -- Cost guard: tracks daily AI lookup count
    CREATE TABLE IF NOT EXISTS usage_counter (
      day TEXT PRIMARY KEY,
      lookups INTEGER NOT NULL DEFAULT 0
    );

    -- User reports for incorrect data (Moderation Queue)
    CREATE TABLE IF NOT EXISTS spec_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spec_key TEXT NOT NULL,
      field TEXT NOT NULL DEFAULT 'general',
      proposed_value TEXT,
      message TEXT NOT NULL,
      reporter_uid TEXT,
      reporter_email TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );


    -- Cached vehicle images (multi-API scoring engine)
    CREATE TABLE IF NOT EXISTS car_images (
      spec_key TEXT PRIMARY KEY,
      url TEXT,
      source TEXT,
      author TEXT,
      licence TEXT,
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_car_images_fetched ON car_images(fetched_at);

    -- Reservations table with secure management tokens
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER,
      car_brand TEXT NOT NULL,
      car_model TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      uid TEXT,
      date TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      manage_token TEXT NOT NULL,
      spec_key TEXT,
      created_at INTEGER NOT NULL
    );

    -- User sessions (Hardened HttpOnly cookie sessions)
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_uid ON user_sessions(uid);

    -- User registry (Source of truth for accounts and roles)
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  // Ensure columns exist on legacy/existing reservations table
  const resColumns = await db.all("PRAGMA table_info(reservations)");
  const resColNames = new Set(resColumns.map((c) => c.name));

  if (!resColNames.has("manage_token")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN manage_token TEXT;");
  }
  if (!resColNames.has("created_at")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN created_at INTEGER;");
  }
  if (!resColNames.has("spec_key")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN spec_key TEXT;");
  }
  if (!resColNames.has("uid")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN uid TEXT;");
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reservations_token ON reservations(manage_token);
    CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_reservations_uid ON reservations(uid);
    CREATE INDEX IF NOT EXISTS idx_reservations_completed ON reservations(completed);
  `);

  // Ensure columns exist on car_specs table
  const specsColumns = await db.all("PRAGMA table_info(car_specs)");
  const specsColNames = new Set(specsColumns.map((c) => c.name));
  if (!specsColNames.has("grounded")) {
    await db.exec("ALTER TABLE car_specs ADD COLUMN grounded INTEGER DEFAULT 1;");
  }
  if (!specsColNames.has("provider")) {
    await db.exec("ALTER TABLE car_specs ADD COLUMN provider TEXT DEFAULT 'gemini';");
  }
  if (!specsColNames.has("prompt_version")) {
    await db.exec("ALTER TABLE car_specs ADD COLUMN prompt_version TEXT DEFAULT 'v1';");
  }

  // Ensure columns exist on spec_reports table
  const reportColumns = await db.all("PRAGMA table_info(spec_reports)");
  const reportColNames = new Set(reportColumns.map((c) => c.name));
  if (!reportColNames.has("field")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN field TEXT DEFAULT 'general';");
  }
  if (!reportColNames.has("proposed_value")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN proposed_value TEXT;");
  }
  if (!reportColNames.has("reporter_uid")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN reporter_uid TEXT;");
  }
  if (!reportColNames.has("reporter_email")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN reporter_email TEXT;");
  }
  if (!reportColNames.has("status")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN status TEXT DEFAULT 'pending';");
  }
  if (!reportColNames.has("updated_at")) {
    await db.exec("ALTER TABLE spec_reports ADD COLUMN updated_at INTEGER;");
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_spec_reports_key ON spec_reports(spec_key);
    CREATE INDEX IF NOT EXISTS idx_spec_reports_uid ON spec_reports(reporter_uid);
    CREATE INDEX IF NOT EXISTS idx_spec_reports_status ON spec_reports(status);
  `);

  // Ensure slug columns exist on car_names table
  const carNamesTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='car_names'");
  if (carNamesTable) {
    const carNamesColumns = await db.all("PRAGMA table_info(car_names)");
    const carNamesColNames = new Set(carNamesColumns.map((c) => c.name));

    if (!carNamesColNames.has("brand_slug")) {
      await db.exec("ALTER TABLE car_names ADD COLUMN brand_slug TEXT;");
    }
    if (!carNamesColNames.has("model_slug")) {
      await db.exec("ALTER TABLE car_names ADD COLUMN model_slug TEXT;");
    }

    // Populate brand_slug and model_slug if any are NULL
    const unpopulated = await db.all("SELECT id, brand, model FROM car_names WHERE brand_slug IS NULL OR model_slug IS NULL");
    if (unpopulated.length > 0) {
      await db.exec("BEGIN");
      const updateStmt = await db.prepare("UPDATE car_names SET brand_slug = ?, model_slug = ? WHERE id = ?");
      for (const row of unpopulated) {
        await updateStmt.run(slugify(row.brand), slugify(row.model), row.id);
      }
      await updateStmt.finalize();
      await db.exec("COMMIT");
    }

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_names_slugs ON car_names(brand_slug, model_slug);`);
  }
}
