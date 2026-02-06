import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// Local SQLite: settings, scraping_logs, ng_keywords only
// Companies and jobs are now in Supabase
let db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!db) {
        const dbPath = path.join(app.getPath('userData'), 'companies.db');
        db = new Database(dbPath);
        console.log(`[Database] Connected to local SQLite: ${dbPath}`);
    }
    return db;
}

export function initDB() {
    const database = getDb();

    database.exec(`
    -- スクレイピングログテーブル
    CREATE TABLE IF NOT EXISTS scraping_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_type TEXT NOT NULL,
      source TEXT NOT NULL,
      target_url TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
      jobs_found INTEGER DEFAULT 0,
      new_jobs INTEGER DEFAULT 0,
      updated_jobs INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      scraped_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_source ON scraping_logs(source);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON scraping_logs(status);
    CREATE INDEX IF NOT EXISTS idx_logs_scraped ON scraping_logs(scraped_at);

    -- NGキーワードテーブル
    CREATE TABLE IF NOT EXISTS ng_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT,
      is_regex INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 設定テーブル
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- デフォルト設定を挿入
    INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
      ('mynavi_enabled', '1', datetime('now')),
      ('doda_enabled', '1', datetime('now')),
      ('rikunabi_enabled', '1', datetime('now')),
      ('scrape_interval_hours', '24', datetime('now')),
      ('rate_limit_ms', '2500', datetime('now')),
      ('max_concurrent', '1', datetime('now'));
  `);
}
