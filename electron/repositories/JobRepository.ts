import Database from 'better-sqlite3';
import { Job } from '../../src/shared/types/Job';
import { JobFilters } from '../../src/shared/types/ScrapingLog';

export class JobRepository {
    constructor(private db: Database.Database) { }

    /**
     * 全求人を取得(フィルター対応)
     */
    getAll(filters: JobFilters = {}): Job[] {
        let query = 'SELECT * FROM jobs WHERE 1=1';
        const params: any[] = [];

        if (filters.source && filters.source !== 'all') {
            query += ' AND source = ?';
            params.push(filters.source);
        }

        if (filters.search) {
            query += ' AND (company_name LIKE ? OR title LIKE ? OR description LIKE ? OR location_summary LIKE ?)';
            const term = `%${filters.search}%`;
            params.push(term, term, term, term);
        }

        if (filters.salaryMin !== undefined) {
            query += ' AND salary_min >= ?';
            params.push(filters.salaryMin);
        }

        if (filters.salaryMax !== undefined) {
            query += ' AND salary_max <= ?';
            params.push(filters.salaryMax);
        }

        if (filters.location) {
            query += ' AND location_summary LIKE ?';
            params.push(`%${filters.location}%`);
        }

        if (filters.isActive !== undefined) {
            query += ' AND is_active = ?';
            params.push(filters.isActive ? 1 : 0);
        }

        query += ' ORDER BY scraped_at DESC';

        const rows = this.db.prepare(query).all(...params) as any[];
        return rows.map(row => this.deserialize(row));
    }

    /**
     * IDで求人を取得
     */
    getById(id: string): Job | null {
        const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
        return row ? this.deserialize(row) : null;
    }

    /**
     * URLで求人を取得
     */
    getByUrl(url: string): Job | null {
        const row = this.db.prepare('SELECT * FROM jobs WHERE source_url = ?').get(url) as any;
        return row ? this.deserialize(row) : null;
    }

    /**
     * 求人が存在するかチェック
     */
    exists(url: string): boolean {
        const result = this.db.prepare('SELECT 1 FROM jobs WHERE source_url = ?').get(url);
        return !!result;
    }

    /**
     * 求人を挿入
     */
    insert(job: Job): void {
        const stmt = this.db.prepare(`
            INSERT INTO jobs (
                id, source, source_job_id, source_url,
                company_name, company_url, company_logo,
                title, employment_type, industry,
                description, requirements, benefits, work_hours,
                salary_min, salary_max, salary_text,
                locations, location_summary,
                labels, keywords,
                date_posted, date_expires, date_updated,
                scraped_at, last_checked_at, is_active,
                ng_keyword_matches
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);

        stmt.run(
            job.id, job.source, job.sourceJobId, job.sourceUrl,
            job.companyName, job.companyUrl, job.companyLogo,
            job.title, job.employmentType, job.industry,
            job.description, job.requirements, job.benefits, job.workHours,
            job.salaryMin, job.salaryMax, job.salaryText,
            JSON.stringify(job.locations), job.locationSummary,
            JSON.stringify(job.labels), JSON.stringify(job.keywords),
            job.datePosted, job.dateExpires, job.dateUpdated,
            job.scrapedAt, job.lastCheckedAt, job.isActive ? 1 : 0,
            JSON.stringify(job.ngKeywordMatches || [])
        );
    }

    /**
     * 求人を更新
     */
    update(job: Job): void {
        const stmt = this.db.prepare(`
            UPDATE jobs SET
                company_name = ?, company_url = ?, company_logo = ?,
                title = ?, employment_type = ?, industry = ?,
                description = ?, requirements = ?, benefits = ?, work_hours = ?,
                salary_min = ?, salary_max = ?, salary_text = ?,
                locations = ?, location_summary = ?,
                labels = ?, keywords = ?,
                date_posted = ?, date_expires = ?, date_updated = ?,
                last_checked_at = ?, is_active = ?,
                ng_keyword_matches = ?
            WHERE id = ?
        `);

        stmt.run(
            job.companyName, job.companyUrl, job.companyLogo,
            job.title, job.employmentType, job.industry,
            job.description, job.requirements, job.benefits, job.workHours,
            job.salaryMin, job.salaryMax, job.salaryText,
            JSON.stringify(job.locations), job.locationSummary,
            JSON.stringify(job.labels), JSON.stringify(job.keywords),
            job.datePosted, job.dateExpires, job.dateUpdated,
            job.lastCheckedAt, job.isActive ? 1 : 0,
            JSON.stringify(job.ngKeywordMatches || []),
            job.id
        );
    }

    /**
     * last_checked_atのみ更新
     */
    updateLastChecked(id: string, timestamp: string): void {
        this.db.prepare('UPDATE jobs SET last_checked_at = ? WHERE id = ?').run(timestamp, id);
    }

    /**
     * 求人を削除(論理削除)
     */
    deactivate(id: string): void {
        this.db.prepare('UPDATE jobs SET is_active = 0 WHERE id = ?').run(id);
    }

    /**
     * 統計情報を取得
     */
    getStats(): {
        total: number;
        bySource: { source: string; count: number }[];
        active: number;
    } {
        const total = (this.db.prepare('SELECT COUNT(*) as count FROM jobs').get() as any).count;
        const active = (this.db.prepare('SELECT COUNT(*) as count FROM jobs WHERE is_active = 1').get() as any).count;
        const bySource = this.db.prepare(`
            SELECT source, COUNT(*) as count
            FROM jobs
            WHERE is_active = 1
            GROUP BY source
        `).all() as any[];

        return { total, active, bySource };
    }

    /**
     * データベース行からJobオブジェクトに変換
     */
    private deserialize(row: any): Job {
        return {
            id: row.id,
            source: row.source,
            sourceJobId: row.source_job_id,
            sourceUrl: row.source_url,
            companyName: row.company_name,
            companyUrl: row.company_url,
            companyLogo: row.company_logo,
            title: row.title,
            employmentType: row.employment_type,
            industry: row.industry,
            description: row.description,
            requirements: row.requirements,
            benefits: row.benefits,
            workHours: row.work_hours,
            salaryMin: row.salary_min,
            salaryMax: row.salary_max,
            salaryText: row.salary_text,
            locations: row.locations ? JSON.parse(row.locations) : [],
            locationSummary: row.location_summary,
            labels: row.labels ? JSON.parse(row.labels) : [],
            keywords: row.keywords ? JSON.parse(row.keywords) : [],
            datePosted: row.date_posted,
            dateExpires: row.date_expires,
            dateUpdated: row.date_updated,
            scrapedAt: row.scraped_at,
            lastCheckedAt: row.last_checked_at,
            isActive: row.is_active === 1,
            ngKeywordMatches: row.ng_keyword_matches ? JSON.parse(row.ng_keyword_matches) : []
        };
    }
}
