import Database from 'better-sqlite3';
import { ScrapingLog } from '../../src/shared/types/ScrapingLog';

export class ScrapingLogRepository {
    constructor(private db: Database.Database) { }

    /**
     * ログを挿入
     */
    insert(log: Omit<ScrapingLog, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO scraping_logs (
                scrape_type, source, target_url, status,
                jobs_found, new_jobs, updated_jobs, errors,
                error_message, duration_ms, scraped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            log.scrapeType,
            log.source,
            log.targetUrl,
            log.status,
            log.jobsFound,
            log.newJobs,
            log.updatedJobs,
            log.errors,
            log.errorMessage,
            log.durationMs,
            log.scrapedAt
        );

        return result.lastInsertRowid as number;
    }

    /**
     * 最新のログを取得
     */
    getRecent(limit: number = 50): ScrapingLog[] {
        const rows = this.db.prepare(`
            SELECT * FROM scraping_logs
            ORDER BY scraped_at DESC
            LIMIT ?
        `).all(limit) as any[];

        return rows.map(row => this.deserialize(row));
    }

    /**
     * ソース別の最新ログを取得
     */
    getLatestBySource(source: string): ScrapingLog | null {
        const row = this.db.prepare(`
            SELECT * FROM scraping_logs
            WHERE source = ?
            ORDER BY scraped_at DESC
            LIMIT 1
        `).get(source) as any;

        return row ? this.deserialize(row) : null;
    }

    /**
     * 統計情報を取得
     */
    getStats(): {
        totalRuns: number;
        successRate: number;
        totalJobsFound: number;
        totalNewJobs: number;
    } {
        const stats = this.db.prepare(`
            SELECT
                COUNT(*) as total_runs,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(jobs_found) as total_jobs_found,
                SUM(new_jobs) as total_new_jobs
            FROM scraping_logs
        `).get() as any;

        return {
            totalRuns: stats.total_runs || 0,
            successRate: stats.total_runs > 0 ? (stats.success_count / stats.total_runs) * 100 : 0,
            totalJobsFound: stats.total_jobs_found || 0,
            totalNewJobs: stats.total_new_jobs || 0
        };
    }

    /**
     * データベース行からScrapingLogオブジェクトに変換
     */
    private deserialize(row: any): ScrapingLog {
        return {
            id: row.id,
            scrapeType: row.scrape_type,
            source: row.source,
            targetUrl: row.target_url,
            status: row.status,
            jobsFound: row.jobs_found,
            newJobs: row.new_jobs,
            updatedJobs: row.updated_jobs,
            errors: row.errors,
            errorMessage: row.error_message,
            durationMs: row.duration_ms,
            scrapedAt: row.scraped_at
        };
    }
}
