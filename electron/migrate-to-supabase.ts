import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { getSupabase } from './supabase';

export async function migrateToSupabase(): Promise<void> {
    const supabase = getSupabase();
    const dbPath = path.join(app.getPath('userData'), 'companies.db');

    let db: Database.Database;
    try {
        db = new Database(dbPath);
    } catch (e) {
        console.log('[Migration] No local SQLite found, skipping');
        return;
    }

    // Check if Supabase already has data
    const { count } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

    if (count && count > 0) {
        console.log(`[Migration] Supabase already has ${count} companies, skipping`);
        return;
    }

    // Check if local SQLite has companies table with data
    let localCount: number;
    try {
        const row = db.prepare('SELECT COUNT(*) as c FROM companies').get() as any;
        localCount = row.c;
    } catch {
        console.log('[Migration] No companies table in local SQLite, skipping');
        return;
    }

    if (localCount === 0) {
        console.log('[Migration] No local data to migrate');
        return;
    }

    console.log(`[Migration] Migrating ${localCount} companies from SQLite to Supabase...`);

    // Migrate companies in batches of 100
    const companies = db.prepare('SELECT * FROM companies').all() as any[];
    const batchSize = 100;

    for (let i = 0; i < companies.length; i += batchSize) {
        const batch = companies.slice(i, i + batchSize).map(c => {
            // Remove SQLite id (Supabase will auto-generate)
            const { id, ...rest } = c;
            return rest;
        });

        const { error } = await supabase.from('companies').insert(batch);
        if (error) {
            console.error(`[Migration] Batch ${i / batchSize + 1} error:`, error.message);
        } else {
            console.log(`[Migration] Companies: ${Math.min(i + batchSize, companies.length)}/${companies.length}`);
        }
    }

    // Migrate jobs
    let jobCount: number;
    try {
        const row = db.prepare('SELECT COUNT(*) as c FROM jobs').get() as any;
        jobCount = row.c;
    } catch {
        console.log('[Migration] No jobs table, skipping jobs');
        return;
    }

    if (jobCount > 0) {
        console.log(`[Migration] Migrating ${jobCount} jobs...`);
        const jobs = db.prepare('SELECT * FROM jobs').all() as any[];

        for (let i = 0; i < jobs.length; i += batchSize) {
            const batch = jobs.slice(i, i + batchSize).map(j => ({
                ...j,
                // SQLite stores JSONB as TEXT, parse for Supabase
                locations: j.locations ? JSON.parse(j.locations) : null,
                labels: j.labels ? JSON.parse(j.labels) : null,
                keywords: j.keywords ? JSON.parse(j.keywords) : null,
                ng_keyword_matches: j.ng_keyword_matches ? JSON.parse(j.ng_keyword_matches) : null,
                // SQLite stores boolean as 0/1
                is_active: j.is_active === 1,
            }));

            const { error } = await supabase.from('jobs').insert(batch);
            if (error) {
                console.error(`[Migration] Jobs batch ${i / batchSize + 1} error:`, error.message);
            } else {
                console.log(`[Migration] Jobs: ${Math.min(i + batchSize, jobs.length)}/${jobs.length}`);
            }
        }
    }

    console.log('[Migration] Complete!');
}
