import { supabase } from '../supabase';
import type { Company, CompanyFilters } from '../../src/types';

export class SupabaseCompanyRepository {
    async getAll(filters: CompanyFilters): Promise<Company[]> {
        const PAGE_SIZE = 1000;
        let allData: any[] = [];
        let from = 0;

        while (true) {
            let query = supabase.from('companies').select('*');

            if (filters.status && filters.status !== 'all') {
                query = query.eq('status', filters.status);
            }

            if (filters.search) {
                const term = `%${filters.search}%`;
                query = query.or(
                    `company_name.ilike.${term},address.ilike.${term},note.ilike.${term},ai_summary.ilike.${term},ai_tags.ilike.${term}`
                );
            }

            query = query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) {
                console.error('[SupabaseCompanyRepo] getAll error:', error);
                break;
            }
            allData = allData.concat(data || []);
            if (!data || data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        return allData as Company[];
    }

    async getById(id: number): Promise<Company | null> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return data as Company;
    }

    async update(id: number, updates: Partial<Company>): Promise<void> {
        const keys = Object.keys(updates).filter(key => key !== 'id');
        if (keys.length === 0) return;

        const updateData: Record<string, any> = {};
        for (const key of keys) {
            updateData[key] = (updates as any)[key];
        }
        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase
            .from('companies')
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error('[SupabaseCompanyRepo] update error:', error);
        }
    }

    async safeUpsert(company: Partial<Company>): Promise<{ isNew: boolean; error?: any }> {
        if (!company.url || !company.company_name) return { isNew: false };

        const { data: existing } = await supabase
            .from('companies')
            .select('*')
            .eq('url', company.url)
            .single();

        if (!existing) {
            // INSERT
            const now = new Date().toISOString();
            const insertData = {
                ...company,
                last_seen_at: now,
                rank_detected_at: company.budget_rank ? now : null,
            };
            // Remove id to let Supabase auto-generate
            delete (insertData as any).id;

            const { error } = await supabase
                .from('companies')
                .insert(insertData);

            if (error) {
                console.error('[SupabaseCompanyRepo] insert error:', error);
                return { isNew: false, error };
            }
            return { isNew: true };
        } else {
            // UPDATE - protected fields: status, note, ai_summary, ai_tags, phone(if exists)
            const updateFields: Record<string, any> = {};

            if (company.company_name) updateFields.company_name = company.company_name;
            if (company.homepage_url) updateFields.homepage_url = company.homepage_url;
            if (company.industry) updateFields.industry = company.industry;
            if (company.area) updateFields.area = company.area;
            if (company.job_title) updateFields.job_title = company.job_title;
            if (company.salary_text) updateFields.salary_text = company.salary_text;
            if (company.representative) updateFields.representative = company.representative;
            if (company.establishment) updateFields.establishment = company.establishment;
            if (company.employees) updateFields.employees = company.employees;
            if (company.revenue) updateFields.revenue = company.revenue;
            if (company.contact_form_url) updateFields.contact_form_url = company.contact_form_url;
            if (company.address) updateFields.address = company.address;

            // Conditional: only fill phone if missing
            if (company.phone && !existing.phone) updateFields.phone = company.phone;

            // Rank fields (always overwrite)
            if (company.budget_rank) {
                updateFields.budget_rank = company.budget_rank;
                updateFields.rank_confidence = company.rank_confidence ?? null;
                updateFields.rank_detected_at = new Date().toISOString();
            }

            // Job page date fields
            if (company.job_page_updated_at) updateFields.job_page_updated_at = company.job_page_updated_at;
            if (company.job_page_end_date) updateFields.job_page_end_date = company.job_page_end_date;

            // Job type
            if (company.job_type) updateFields.job_type = company.job_type;

            // Timestamps
            updateFields.last_seen_at = new Date().toISOString();
            updateFields.updated_at = new Date().toISOString();

            if (Object.keys(updateFields).length > 0) {
                const { error } = await supabase
                    .from('companies')
                    .update(updateFields)
                    .eq('id', existing.id);

                if (error) {
                    console.error('[SupabaseCompanyRepo] update error:', error);
                }
            }
            return { isNew: false };
        }
    }

    async exists(url: string): Promise<boolean> {
        const { data } = await supabase
            .from('companies')
            .select('id')
            .eq('url', url)
            .single();

        return !!data;
    }

    async existsByName(companyName: string): Promise<boolean> {
        const { data } = await supabase
            .from('companies')
            .select('id')
            .eq('company_name', companyName)
            .single();

        return !!data;
    }

    async getByName(companyName: string): Promise<Company | null> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('company_name', companyName)
            .single();

        if (error) return null;
        return data as Company;
    }

    async delete(id: number): Promise<boolean> {
        const { error, count } = await supabase
            .from('companies')
            .delete()
            .eq('id', id);

        return !error;
    }

    async deleteMany(ids: number[]): Promise<number> {
        if (ids.length === 0) return 0;

        const { error, count } = await supabase
            .from('companies')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('[SupabaseCompanyRepo] deleteMany error:', error);
            return 0;
        }
        return count ?? ids.length;
    }

    async getDistinctAreas(): Promise<string[]> {
        const { data, error } = await supabase
            .from('companies')
            .select('area');
        if (error || !data) return [];
        const areas = [...new Set(data.map(r => r.area).filter(Boolean))] as string[];
        return areas.sort();
    }

    async getDistinctJobTitles(): Promise<string[]> {
        const { data, error } = await supabase
            .from('companies')
            .select('job_title');
        if (error || !data) return [];
        const titles = [...new Set(data.map(r => r.job_title).filter(Boolean))] as string[];
        return titles.sort();
    }

    async deleteAll(): Promise<number> {
        // Delete all by matching all rows
        const { error, count } = await supabase
            .from('companies')
            .delete()
            .gte('id', 0);

        if (error) {
            console.error('[SupabaseCompanyRepo] deleteAll error:', error);
            return 0;
        }
        return count ?? 0;
    }
}
