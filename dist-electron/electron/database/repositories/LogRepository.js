"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogRepository = void 0;
const connection_1 = require("../connection");
class LogRepository {
    db;
    constructor() {
        this.db = (0, connection_1.getDatabase)();
    }
    insert(log) {
        const stmt = this.db.prepare(`
      INSERT INTO scraping_logs (
        scrape_type, source, target_url, status,
        jobs_found, new_jobs, updated_jobs, errors,
        error_message, duration_ms, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(log.scrape_type, log.source, log.target_url, log.status, log.jobs_found, log.new_jobs, log.updated_jobs, log.errors, log.error_message, log.duration_ms, log.scraped_at);
        return result.lastInsertRowid;
    }
    findRecent(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT * FROM scraping_logs
      ORDER BY scraped_at DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    findBySource(source, limit = 50) {
        const stmt = this.db.prepare(`
      SELECT * FROM scraping_logs
      WHERE source = ?
      ORDER BY scraped_at DESC
      LIMIT ?
    `);
        return stmt.all(source, limit);
    }
    getStats(source) {
        let query = `
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate,
        SUM(jobs_found) as total_jobs_found,
        SUM(new_jobs) as total_new_jobs,
        SUM(errors) as total_errors
      FROM scraping_logs
    `;
        const params = [];
        if (source) {
            query += ' WHERE source = ?';
            params.push(source);
        }
        const stmt = this.db.prepare(query);
        return stmt.get(...params);
    }
}
exports.LogRepository = LogRepository;
