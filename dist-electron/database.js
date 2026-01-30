"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyRepository = void 0;
exports.initDB = initDB;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'companies.db');
const db = new better_sqlite3_1.default(dbPath);
// Initialize DB
function initDB() {
    // B Rollar 新スキーマ
    db.exec(`
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
      salary_text TEXT,
      representative TEXT,
      establishment TEXT,
      employees TEXT,
      revenue TEXT,
      phone TEXT,
      contact_form_url TEXT,
      address TEXT,
      ai_summary TEXT,
      ai_tags TEXT,
      note TEXT,
      last_seen_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_companies_url ON companies(url);
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
  `);
}
// Repository Functions
exports.companyRepository = {
    getAll: (filters) => {
        let query = 'SELECT * FROM companies WHERE 1=1';
        const params = [];
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
        return db.prepare(query).all(...params);
    },
    getById: (id) => {
        return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    },
    update: (id, updates) => {
        const keys = Object.keys(updates).filter((key) => key !== 'id');
        if (keys.length === 0)
            return;
        const setClause = keys.map((key) => `${key} = ?`).join(', ');
        const values = keys.map((key) => updates[key]);
        db.prepare(`UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
    },
    // Safe Upsert for B Rollar
    // 既存データがある場合、PROTECTEDフィールドは更新しない
    safeUpsert: (company) => {
        if (!company.url || !company.company_name)
            return;
        const existing = db.prepare('SELECT * FROM companies WHERE url = ?').get(company.url);
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
            const insertData = { ...company, last_seen_at: new Date().toISOString() };
            const columns = Object.keys(insertData).join(', ');
            const placeholders = Object.keys(insertData).map(() => '?').join(', ');
            const values = Object.values(insertData);
            try {
                db.prepare(`INSERT INTO companies (${columns}) VALUES (${placeholders})`).run(...values);
                return { isNew: true };
            }
            catch (e) {
                console.error('Insert failed', e);
                return { isNew: false, error: e };
            }
        }
        else {
            // UPDATE
            // Protected: status, note, ai_summary, ai_tags, phone(if exists)
            const updateFields = {};
            // Always update standard fields if they are present in new data
            if (company.company_name)
                updateFields.company_name = company.company_name;
            if (company.homepage_url)
                updateFields.homepage_url = company.homepage_url;
            if (company.industry)
                updateFields.industry = company.industry;
            if (company.area)
                updateFields.area = company.area;
            if (company.job_title)
                updateFields.job_title = company.job_title;
            if (company.salary_text)
                updateFields.salary_text = company.salary_text;
            if (company.representative)
                updateFields.representative = company.representative;
            if (company.establishment)
                updateFields.establishment = company.establishment;
            if (company.employees)
                updateFields.employees = company.employees;
            if (company.revenue)
                updateFields.revenue = company.revenue;
            if (company.contact_form_url)
                updateFields.contact_form_url = company.contact_form_url;
            if (company.address)
                updateFields.address = company.address;
            // Conditional update (Clean missing data)
            if (company.phone && !existing.phone)
                updateFields.phone = company.phone;
            // Always update timestamps
            updateFields.last_seen_at = new Date().toISOString();
            const keys = Object.keys(updateFields);
            if (keys.length > 0) {
                const setClause = keys.map((k) => `${k} = ?`).join(', ');
                const values = keys.map((k) => updateFields[k]);
                db.prepare(`UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, existing.id);
            }
            return { isNew: false };
        }
    },
    exists: (url) => {
        const result = db.prepare('SELECT 1 FROM companies WHERE url = ?').get(url);
        return !!result;
    }
};
