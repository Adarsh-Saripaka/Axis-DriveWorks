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
  `);
}
