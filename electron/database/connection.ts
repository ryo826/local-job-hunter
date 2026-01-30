// database/connection.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const dbPath = path.join(app.getPath('userData'), 'local-job-hunter.db');
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
  }
  return db;
}

function runMigrations(database: Database.Database) {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // マイグレーション管理テーブルを作成
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL
    )
  `);
  
  // 実行済みマイグレーションを取得
  const executedMigrations = database
    .prepare('SELECT filename FROM migrations')
    .all()
    .map((row: any) => row.filename);
  
  // マイグレーションファイルを読み込んで実行
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  for (const file of migrationFiles) {
    if (executedMigrations.includes(file)) {
      console.log(`[Migration] Skipping ${file} (already executed)`);
      continue;
    }
    
    console.log(`[Migration] Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    
    try {
      database.exec(sql);
      database.prepare('INSERT INTO migrations (filename, executed_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString()
      );
      console.log(`[Migration] ✓ ${file} completed`);
    } catch (error) {
      console.error(`[Migration] ✗ ${file} failed:`, error);
      throw error;
    }
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
