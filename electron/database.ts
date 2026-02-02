import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import type { Company, CompanyFilters } from '../src/types';

// 遅延初期化: app.whenReady()の後にのみデータベースを作成
let db: Database.Database | null = null;
let dbPath: string | null = null;

function getDb(): Database.Database {
    if (!db) {
        dbPath = path.join(app.getPath('userData'), 'companies.db');
        db = new Database(dbPath);
        console.log(`[Database] Connected to: ${dbPath}`);
    }
    return db;
}

// Initialize DB
export function initDB() {
    const database = getDb();
    // 既存の企業テーブル(B2B営業用)
    database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      source TEXT,
      url TEXT UNIQUE NOT NULL,
      homepage_url TEXT,
      status TEXT DEFAULT 'new',
      industry TEXT,
      area TEXT,
      job_title TEXT,
      job_description TEXT,
      salary_text TEXT,
      representative TEXT,
      establishment TEXT,
      employees TEXT,
      revenue TEXT,
      phone TEXT,
      email TEXT,
      contact_form_url TEXT,
      contact_page_url TEXT,
      address TEXT,
      ai_summary TEXT,
      ai_tags TEXT,
      note TEXT,
      scrape_status TEXT DEFAULT 'pending',
      error_message TEXT,
      last_seen_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_companies_url ON companies(url);
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
    CREATE INDEX IF NOT EXISTS idx_companies_scrape_status ON companies(scrape_status);

    -- ランク関連カラムの追加（既存テーブルへのマイグレーション）
    -- SQLiteではALTER TABLE ADD COLUMNで既存テーブルにカラムを追加可能
    -- カラムが既に存在する場合はエラーになるため、PRAGMA table_info()でチェック

    -- 新規: 求人テーブル(求人情報管理用)
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_job_id TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL,
      company_url TEXT,
      company_logo TEXT,
      title TEXT NOT NULL,
      employment_type TEXT,
      industry TEXT,
      description TEXT,
      requirements TEXT,
      benefits TEXT,
      work_hours TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_text TEXT,
      locations TEXT,
      location_summary TEXT,
      labels TEXT,
      keywords TEXT,
      date_posted TEXT,
      date_expires TEXT,
      date_updated TEXT,
      scraped_at TEXT NOT NULL,
      last_checked_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      ng_keyword_matches TEXT,
      CONSTRAINT unique_source_job UNIQUE (source, source_job_id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_name);
    CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(date_posted);
    CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
    CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON jobs(salary_min) WHERE salary_min IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON jobs(salary_max) WHERE salary_max IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location_summary);
    CREATE INDEX IF NOT EXISTS idx_jobs_source_active ON jobs(source, is_active);

    -- 新規: スクレイピングログテーブル
    CREATE TABLE IF NOT EXISTS scraping_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_type TEXT NOT NULL,
      source TEXT NOT NULL,
      target_url TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
      jobs_found INTEGER DEFAULT 0,
      new_jobs INTEGER DEFAULT 0,
      updated_jobs INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      scraped_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_source ON scraping_logs(source);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON scraping_logs(status);
    CREATE INDEX IF NOT EXISTS idx_logs_scraped ON scraping_logs(scraped_at);

    -- 新規: NGキーワードテーブル
    CREATE TABLE IF NOT EXISTS ng_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT,
      is_regex INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 新規: 設定テーブル
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- デフォルト設定を挿入
    INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
      ('mynavi_enabled', '1', datetime('now')),
      ('doda_enabled', '1', datetime('now')),
      ('rikunabi_enabled', '1', datetime('now')),
      ('scrape_interval_hours', '24', datetime('now')),
      ('rate_limit_ms', '2500', datetime('now')),
      ('max_concurrent', '1', datetime('now'));
  `);

    // ランク関連カラムのマイグレーション
    migrateRankColumns(database);
}

// ランク関連カラムを既存テーブルに追加するマイグレーション
function migrateRankColumns(database: Database.Database) {
    // テーブル情報を取得
    const tableInfo = database.prepare('PRAGMA table_info(companies)').all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map(col => col.name));

    // budget_rank カラムが存在しない場合は追加
    if (!existingColumns.has('budget_rank')) {
        console.log('[Database] Adding budget_rank column to companies table');
        database.exec(`ALTER TABLE companies ADD COLUMN budget_rank TEXT CHECK(budget_rank IN ('A', 'B', 'C'))`);
    }

    // rank_confidence カラムが存在しない場合は追加
    if (!existingColumns.has('rank_confidence')) {
        console.log('[Database] Adding rank_confidence column to companies table');
        database.exec(`ALTER TABLE companies ADD COLUMN rank_confidence REAL`);
    }

    // rank_detected_at カラムが存在しない場合は追加
    if (!existingColumns.has('rank_detected_at')) {
        console.log('[Database] Adding rank_detected_at column to companies table');
        database.exec(`ALTER TABLE companies ADD COLUMN rank_detected_at DATETIME`);
    }

    // budget_rank用のインデックスを作成
    database.exec(`CREATE INDEX IF NOT EXISTS idx_companies_budget_rank ON companies(budget_rank)`);
}

// Repository Functions
export const companyRepository = {
    getAll: (filters: CompanyFilters): Company[] => {
        const database = getDb();
        let query = 'SELECT * FROM companies WHERE 1=1';
        const params: any[] = [];

        if (filters.status) {
            if (filters.status !== 'all') {
                query += ' AND status = ?';
                params.push(filters.status);
            }
        }

        if (filters.search) {
            query += ' AND (company_name LIKE ? OR address LIKE ? OR note LIKE ? OR ai_summary LIKE ? OR ai_tags LIKE ?)';
            const term = `%${filters.search}%`;
            params.push(term, term, term, term, term);
        }

        query += ' ORDER BY created_at DESC';

        return database.prepare(query).all(...params) as Company[];
    },

    getById: (id: number): Company | null => {
        const database = getDb();
        return database.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | null;
    },

    update: (id: number, updates: Partial<Company>) => {
        const database = getDb();
        const keys = Object.keys(updates).filter((key) => key !== 'id');
        if (keys.length === 0) return;

        const setClause = keys.map((key) => `${key} = ?`).join(', ');
        const values = keys.map((key) => (updates as any)[key]);

        database.prepare(`UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
            ...values,
            id
        );
    },

    // Safe Upsert for B Rollar
    // 既存データがある場合、PROTECTEDフィールドは更新しない
    safeUpsert: (company: Partial<Company>) => {
        const database = getDb();
        if (!company.url || !company.company_name) return;

        const existing = database.prepare('SELECT * FROM companies WHERE url = ?').get(company.url) as Company | undefined;

        if (!existing) {
            // INSERT
            const keys = [
                'company_name', 'url', 'homepage_url', 'source', 'industry', 'area',
                'job_title', 'salary_text', 'representative', 'establishment',
                'employees', 'revenue', 'phone', 'contact_form_url', 'address',
                'last_seen_at'
            ];
            // Note: source column doesn't exist in type definition but is useful for filtering? 
            // Adding it to schema might be needed if source breakdown is required.
            // Current schema in Types doesn't have source. Let's check types.ts.
            // types.ts doesn't have source. But dashboard uses it. 
            // Let's add source to schema as well.

            // Re-checking types.ts: User removed source from types.ts?
            // Ah, I need to add 'source' to types.ts and schema.
            // Ignoring for now to fix types.ts first in next tool call or adding here?
            // I should update types.ts first. But I am in write_to_file.
            // Let's assume 'source' is needed because Dashboard depends on it.

            // Let's stick to the prompt's schema requirements. 
            // "source" was NOT in the user prompt's list explicitly but was there before.
            // Dashboard uses it. So keeping it is safer.
            // But user provided specific schema. 
            // "2. Scraping Logic" -> "Target ... status: Default 'New'"
            // I'll follow strict prompt schema and add 'source' if needed for compatibility?
            // User prompt says: "1. Database Schema ... - status ... - phone ... - last_seen_at"
            // It does NOT list 'source'.
            // However, scraping usually tracks source.
            // I will add 'source' column implicitly to avoid breaking existing Dashboard logic.

            const now = new Date().toISOString();
            const insertData = {
                ...company,
                last_seen_at: now,
                // ランク情報がある場合は検出日時を設定
                rank_detected_at: company.budget_rank ? now : null,
            };
            const columns = Object.keys(insertData).join(', ');
            const placeholders = Object.keys(insertData).map(() => '?').join(', ');
            const values = Object.values(insertData);

            try {
                database.prepare(`INSERT INTO companies (${columns}) VALUES (${placeholders})`).run(...values);
                return { isNew: true };
            } catch (e) {
                console.error('Insert failed', e);
                return { isNew: false, error: e };
            }
        } else {
            // UPDATE
            // Protected: status, note, ai_summary, ai_tags, phone(if exists)

            const updateFields: Partial<Company> = {};

            // Always update standard fields if they are present in new data
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

            // Conditional update (Clean missing data)
            if (company.phone && !existing.phone) updateFields.phone = company.phone;

            // ランク関連フィールドの更新（常に上書き）
            if (company.budget_rank) {
                updateFields.budget_rank = company.budget_rank;
                updateFields.rank_confidence = company.rank_confidence ?? null;
                updateFields.rank_detected_at = new Date().toISOString();
            }

            // Always update timestamps
            updateFields.last_seen_at = new Date().toISOString();

            const keys = Object.keys(updateFields);
            if (keys.length > 0) {
                const setClause = keys.map((k) => `${k} = ?`).join(', ');
                const values = keys.map((k) => (updateFields as any)[k]);
                database.prepare(`UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, existing.id);
            }
            return { isNew: false };
        }
    },

    exists: (url: string): boolean => {
        const database = getDb();
        const result = database.prepare('SELECT 1 FROM companies WHERE url = ?').get(url);
        return !!result;
    },

    // 会社名で重複チェック（B2B営業用：同じ会社の複数求人を1つにまとめる）
    existsByName: (companyName: string): boolean => {
        const database = getDb();
        const result = database.prepare('SELECT 1 FROM companies WHERE company_name = ?').get(companyName);
        return !!result;
    },

    // 会社名で取得
    getByName: (companyName: string): Company | null => {
        const database = getDb();
        return database.prepare('SELECT * FROM companies WHERE company_name = ?').get(companyName) as Company | null;
    },

    // 単一削除
    delete: (id: number): boolean => {
        const database = getDb();
        const result = database.prepare('DELETE FROM companies WHERE id = ?').run(id);
        return result.changes > 0;
    },

    // 複数削除
    deleteMany: (ids: number[]): number => {
        if (ids.length === 0) return 0;
        const database = getDb();
        const placeholders = ids.map(() => '?').join(',');
        const result = database.prepare(`DELETE FROM companies WHERE id IN (${placeholders})`).run(...ids);
        return result.changes;
    },

    // 全削除
    deleteAll: (): number => {
        const database = getDb();
        const result = database.prepare('DELETE FROM companies').run();
        return result.changes;
    }
};
