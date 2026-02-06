import { supabase } from '../supabase';
import { Job } from '../../src/shared/types/Job';
import { JobFilters } from '../../src/shared/types/ScrapingLog';

export class SupabaseJobRepository {
    async getAll(filters: JobFilters = {}): Promise<Job[]> {
        const PAGE_SIZE = 1000;
        let allData: any[] = [];
        let from = 0;

        while (true) {
            let query = supabase.from('jobs').select('*');

            if (filters.source && filters.source !== 'all') {
                query = query.eq('source', filters.source);
            }

            if (filters.search) {
                const term = `%${filters.search}%`;
                query = query.or(
                    `company_name.ilike.${term},title.ilike.${term},description.ilike.${term},location_summary.ilike.${term}`
                );
            }

            if (filters.salaryMin !== undefined) {
                query = query.gte('salary_min', filters.salaryMin);
            }

            if (filters.salaryMax !== undefined) {
                query = query.lte('salary_max', filters.salaryMax);
            }

            if (filters.location) {
                query = query.ilike('location_summary', `%${filters.location}%`);
            }

            if (filters.isActive !== undefined) {
                query = query.eq('is_active', filters.isActive);
            }

            query = query.order('scraped_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) {
                console.error('[SupabaseJobRepo] getAll error:', error);
                break;
            }
            allData = allData.concat(data || []);
            if (!data || data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        // Supabase returns JSONB natively, but we need to map snake_case to camelCase
        return allData.map(row => this.deserialize(row));
    }

    async getById(id: string): Promise<Job | null> {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return this.deserialize(data);
    }

    async getByUrl(url: string): Promise<Job | null> {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('source_url', url)
            .single();

        if (error) return null;
        return this.deserialize(data);
    }

    async exists(url: string): Promise<boolean> {
        const { data } = await supabase
            .from('jobs')
            .select('id')
            .eq('source_url', url)
            .single();

        return !!data;
    }

    async insert(job: Job): Promise<void> {
        const row = this.serialize(job);

        const { error } = await supabase
            .from('jobs')
            .insert(row);

        if (error) {
            console.error('[SupabaseJobRepo] insert error:', error);
            throw error;
        }
    }

    async update(job: Job): Promise<void> {
        const row = this.serialize(job);
        // Remove id from update payload
        const { id, ...updateData } = row;

        const { error } = await supabase
            .from('jobs')
            .update(updateData)
            .eq('id', job.id);

        if (error) {
            console.error('[SupabaseJobRepo] update error:', error);
        }
    }

    async updateLastChecked(id: string, timestamp: string): Promise<void> {
        const { error } = await supabase
            .from('jobs')
            .update({ last_checked_at: timestamp })
            .eq('id', id);

        if (error) {
            console.error('[SupabaseJobRepo] updateLastChecked error:', error);
        }
    }

    async deactivate(id: string): Promise<void> {
        const { error } = await supabase
            .from('jobs')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            console.error('[SupabaseJobRepo] deactivate error:', error);
        }
    }

    async getStats(): Promise<{
        total: number;
        bySource: { source: string; count: number }[];
        active: number;
    }> {
        // Total count
        const { count: total } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true });

        // Active count
        const { count: active } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // By source (paginated fetch of all active jobs, group in JS)
        let allSourceData: any[] = [];
        let srcFrom = 0;
        const SRC_PAGE = 1000;
        while (true) {
            const { data: sourceData } = await supabase
                .from('jobs')
                .select('source')
                .eq('is_active', true)
                .range(srcFrom, srcFrom + SRC_PAGE - 1);
            allSourceData = allSourceData.concat(sourceData || []);
            if (!sourceData || sourceData.length < SRC_PAGE) break;
            srcFrom += SRC_PAGE;
        }

        const sourceCounts = new Map<string, number>();
        for (const row of allSourceData) {
            const s = row.source;
            sourceCounts.set(s, (sourceCounts.get(s) || 0) + 1);
        }

        const bySource = Array.from(sourceCounts.entries()).map(([source, count]) => ({ source, count }));

        return {
            total: total ?? 0,
            active: active ?? 0,
            bySource,
        };
    }

    /**
     * Upsert: insert or update based on existence
     */
    async upsert(job: Job): Promise<boolean> {
        const existing = await this.getById(job.id);

        if (!existing) {
            await this.insert(job);
            return true;
        }

        const needsUpdate = this.checkNeedsUpdate(existing, job);
        if (needsUpdate) {
            await this.update(job);
        } else {
            await this.updateLastChecked(job.id, new Date().toISOString());
        }
        return false;
    }

    private checkNeedsUpdate(existing: Job, newJob: Job): boolean {
        return (
            existing.title !== newJob.title ||
            existing.salaryMin !== newJob.salaryMin ||
            existing.salaryMax !== newJob.salaryMax ||
            existing.salaryText !== newJob.salaryText ||
            existing.description !== newJob.description ||
            existing.dateExpires !== newJob.dateExpires ||
            existing.isActive !== newJob.isActive ||
            existing.employmentType !== newJob.employmentType ||
            existing.locationSummary !== newJob.locationSummary
        );
    }

    // Convert camelCase Job to snake_case DB row
    private serialize(job: Job): Record<string, any> {
        return {
            id: job.id,
            source: job.source,
            source_job_id: job.sourceJobId,
            source_url: job.sourceUrl,
            company_name: job.companyName,
            company_url: job.companyUrl,
            company_logo: job.companyLogo,
            title: job.title,
            employment_type: job.employmentType,
            industry: job.industry,
            description: job.description,
            requirements: job.requirements,
            benefits: job.benefits,
            work_hours: job.workHours,
            salary_min: job.salaryMin,
            salary_max: job.salaryMax,
            salary_text: job.salaryText,
            locations: job.locations,       // JSONB: no stringify needed
            location_summary: job.locationSummary,
            labels: job.labels,             // JSONB
            keywords: job.keywords,         // JSONB
            date_posted: job.datePosted,
            date_expires: job.dateExpires,
            date_updated: job.dateUpdated,
            scraped_at: job.scrapedAt,
            last_checked_at: job.lastCheckedAt,
            is_active: job.isActive,
            ng_keyword_matches: job.ngKeywordMatches || [], // JSONB
        };
    }

    // Convert snake_case DB row to camelCase Job
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
            locations: row.locations || [],       // JSONB: already parsed
            locationSummary: row.location_summary,
            labels: row.labels || [],             // JSONB
            keywords: row.keywords || [],         // JSONB
            datePosted: row.date_posted,
            dateExpires: row.date_expires,
            dateUpdated: row.date_updated,
            scrapedAt: row.scraped_at,
            lastCheckedAt: row.last_checked_at,
            isActive: row.is_active,
            ngKeywordMatches: row.ng_keyword_matches || [],
        };
    }
}
