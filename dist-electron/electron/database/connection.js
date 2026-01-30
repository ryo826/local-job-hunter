"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
// database/connection.ts
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'local-job-hunter.db');
let db = null;
function getDatabase() {
    if (!db) {
        db = new better_sqlite3_1.default(dbPath);
        db.pragma('journal_mode = WAL');
        runMigrations(db);
    }
    return db;
}
function runMigrations(database) {
    const migrationsDir = path_1.default.join(__dirname, 'migrations');
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
        .map((row) => row.filename);
    // マイグレーションファイルを読み込んで実行
    const migrationFiles = fs_1.default.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
    for (const file of migrationFiles) {
        if (executedMigrations.includes(file)) {
            console.log(`[Migration] Skipping ${file} (already executed)`);
            continue;
        }
        console.log(`[Migration] Running ${file}...`);
        const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf-8');
        try {
            database.exec(sql);
            database.prepare('INSERT INTO migrations (filename, executed_at) VALUES (?, ?)').run(file, new Date().toISOString());
            console.log(`[Migration] ✓ ${file} completed`);
        }
        catch (error) {
            console.error(`[Migration] ✗ ${file} failed:`, error);
            throw error;
        }
    }
}
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
