"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobRepository = void 0;
const connection_1 = require("../connection");
class JobRepository {
    db;
    constructor() {
        this.db = (0, connection_1.getDatabase)();
    }
    /**
     * Safe Upsert: 既存の求人と比較して更新の必要性を判定
     * @returns true if new job, false if updated existing job
     */
    upsert(job) {
        const existing = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
        if (!existing) {
            // 新規求人
            this.insert(job);
            return true;
        }
        // 既存求人の更新判定
        const needsUpdate = this.checkNeedsUpdate(existing, job);
        if (needsUpdate) {
            this.update(job);
        }
        else {
            // 更新不要でもlast_checked_atは更新
            this.db.prepare('UPDATE jobs SET last_checked_at = ? WHERE id = ?').run(new Date().toISOString(), job.id);
        }
        return false;
    }
    checkNeedsUpdate(existing, newJob) {
        // 重要フィールドの変更をチェック
        return (existing.title !== newJob.title ||
            existing.salary_min !== newJob.salaryMin ||
            existing.salary_max !== newJob.salaryMax ||
            existing.description !== newJob.description ||
            existing.date_expires !== newJob.dateExpires?.toISOString() ||
            existing.is_active !== (newJob.isActive ? 1 : 0));
    }
    insert(job) {
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
        stmt.run(job.id, job.source, job.sourceJobId, job.sourceUrl, job.companyName, job.companyUrl, job.companyLogo, job.title, job.employmentType, job.industry, job.description, job.requirements, job.benefits, job.workHours, job.salaryMin, job.salaryMax, job.salaryText, JSON.stringify(job.locations), job.locationSummary, JSON.stringify(job.labels), JSON.stringify(job.keywords), job.datePosted.toISOString(), job.dateExpires?.toISOString(), job.dateUpdated?.toISOString(), job.scrapedAt.toISOString(), job.lastCheckedAt.toISOString(), job.isActive ? 1 : 0, JSON.stringify(job.ngKeywordMatches || []));
    }
    update(job) {
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
        stmt.run(job.companyName, job.companyUrl, job.companyLogo, job.title, job.employmentType, job.industry, job.description, job.requirements, job.benefits, job.workHours, job.salaryMin, job.salaryMax, job.salaryText, JSON.stringify(job.locations), job.locationSummary, JSON.stringify(job.labels), JSON.stringify(job.keywords), job.datePosted.toISOString(), job.dateExpires?.toISOString(), job.dateUpdated?.toISOString(), job.lastCheckedAt.toISOString(), job.isActive ? 1 : 0, JSON.stringify(job.ngKeywordMatches || []), job.id);
    }
    findById(id) {
        const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
        return row ? this.rowToJob(row) : null;
    }
    findAll(filters) {
        let query = 'SELECT * FROM jobs WHERE 1=1';
        const params = [];
        if (filters?.source) {
            query += ' AND source = ?';
            params.push(filters.source);
        }
        if (filters?.isActive !== undefined) {
            query += ' AND is_active = ?';
            params.push(filters.isActive ? 1 : 0);
        }
        query += ' ORDER BY scraped_at DESC';
        const rows = this.db.prepare(query).all(...params);
        return rows.map(row => this.rowToJob(row));
    }
    rowToJob(row) {
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
            locations: JSON.parse(row.locations || '[]'),
            locationSummary: row.location_summary,
            labels: JSON.parse(row.labels || '[]'),
            keywords: JSON.parse(row.keywords || '[]'),
            datePosted: new Date(row.date_posted),
            dateExpires: row.date_expires ? new Date(row.date_expires) : undefined,
            dateUpdated: row.date_updated ? new Date(row.date_updated) : undefined,
            scrapedAt: new Date(row.scraped_at),
            lastCheckedAt: new Date(row.last_checked_at),
            isActive: row.is_active === 1,
            ngKeywordMatches: JSON.parse(row.ng_keyword_matches || '[]')
        };
    }
}
exports.JobRepository = JobRepository;
