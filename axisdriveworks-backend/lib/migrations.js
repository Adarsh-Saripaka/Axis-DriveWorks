/**
 * Database migrations module for Axis DriveWorks
 * Runs on server startup with CREATE TABLE IF NOT EXISTS
 */
export async function runMigrations(db) {
  await db.exec(`
    -- Cached vehicle specs (90-day TTL)
    CREATE TABLE IF NOT EXISTS car_specs (
      spec_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      source_urls TEXT NOT NULL,
      confidence TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_car_specs_fetched ON car_specs(fetched_at);

    -- Cost guard: tracks daily AI lookup count
    CREATE TABLE IF NOT EXISTS usage_counter (
      day TEXT PRIMARY KEY,
      lookups INTEGER NOT NULL DEFAULT 0
    );

    -- User reports for incorrect data
    CREATE TABLE IF NOT EXISTS spec_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spec_key TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spec_reports_key ON spec_reports(spec_key);

    -- Cached vehicle images (multi-API scoring engine)
    CREATE TABLE IF NOT EXISTS car_images (
      spec_key TEXT PRIMARY KEY,
      url TEXT NOT NULL,
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
      car_brand TEXT,
      car_model TEXT,
      name TEXT,
      email TEXT,
      date TEXT,
      completed INTEGER DEFAULT 0,
      manage_token TEXT,
      created_at INTEGER
    );
  `);

  // Ensure manage_token and created_at columns exist on legacy tables
  const columns = await db.all("PRAGMA table_info(reservations)");
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("manage_token")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN manage_token TEXT;");
  }
  if (!colNames.has("created_at")) {
    await db.exec("ALTER TABLE reservations ADD COLUMN created_at INTEGER;");
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reservations_token ON reservations(manage_token);
    CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email COLLATE NOCASE);
  `);
}
