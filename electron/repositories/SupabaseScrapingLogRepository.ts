import { supabase } from '../supabase';
import { ScrapingLog } from '../../src/shared/types/ScrapingLog';

export class SupabaseScrapingLogRepository {
    async insert(log: Omit<ScrapingLog, 'id'>): Promise<void> {
        const { error } = await supabase.from('scraping_logs').insert({
            scrape_type: log.scrapeType,
            source: log.source,
            target_url: log.targetUrl ?? null,
            status: log.status,
            jobs_found: log.jobsFound,
            new_jobs: log.newJobs,
            updated_jobs: log.updatedJobs,
            errors: log.errors,
            error_message: log.errorMessage ?? null,
            duration_ms: log.durationMs,
            scraped_at: log.scrapedAt,
        });
        if (error) console.error('[ScrapingLog] insert error:', error.message);
    }

    async getRecent(limit: number = 50): Promise<ScrapingLog[]> {
        const { data, error } = await supabase
            .from('scraping_logs')
            .select('*')
            .order('scraped_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ScrapingLog] getRecent error:', error.message);
            return [];
        }
        return (data ?? []).map(row => this.deserialize(row));
    }

    async getLatestBySource(source: string): Promise<ScrapingLog | null> {
        const { data, error } = await supabase
            .from('scraping_logs')
            .select('*')
            .eq('source', source)
            .order('scraped_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // no rows
            console.error('[ScrapingLog] getLatestBySource error:', error.message);
            return null;
        }
        return this.deserialize(data);
    }

    async getStats(): Promise<{
        totalRuns: number;
        successRate: number;
        totalJobsFound: number;
        totalNewJobs: number;
    }> {
        const { data, error } = await supabase
            .from('scraping_logs')
            .select('status, jobs_found, new_jobs');

        if (error) {
            console.error('[ScrapingLog] getStats error:', error.message);
            return { totalRuns: 0, successRate: 0, totalJobsFound: 0, totalNewJobs: 0 };
        }

        const rows = data ?? [];
        const totalRuns = rows.length;
        const successCount = rows.filter(r => r.status === 'success').length;
        const totalJobsFound = rows.reduce((sum, r) => sum + (r.jobs_found ?? 0), 0);
        const totalNewJobs = rows.reduce((sum, r) => sum + (r.new_jobs ?? 0), 0);

        return {
            totalRuns,
            successRate: totalRuns > 0 ? (successCount / totalRuns) * 100 : 0,
            totalJobsFound,
            totalNewJobs,
        };
    }

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
            scrapedAt: row.scraped_at,
        };
    }
}
