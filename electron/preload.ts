import { contextBridge, ipcRenderer } from 'electron';

export interface CompanyFilters {
    search?: string;
    status?: string;
    source?: string;
}

export interface Company {
    id: number;
    url: string;
    company_name: string;
    source: string;
    homepage_url?: string;
    address?: string;
    area?: string;
    industry?: string;
    job_title?: string;
    salary_text?: string;
    representative?: string;
    establishment?: string;
    employees?: string;
    revenue?: string;
    phone?: string;
    email?: string;
    contact_form_url?: string;
    ai_summary?: string;
    ai_tags?: string;
    status: string;
    note?: string;
    last_seen_at?: string;
    created_at: string;
    updated_at: string;
}

export interface ScrapingProgress {
    current: number;
    total: number;
    status: string;
    source: string;
    newCount: number;
    duplicateCount: number;
}

export interface ScrapingOptions {
    sources: string[];
    keywords?: string;
    location?: string;
}

export interface EnrichProgress {
    current: number;
    total: number;
    companyName: string;
}

export interface EnrichStats {
    total: number;
    withPhone: number;
    withoutPhone: number;
}

export interface UpdateProgress {
    current: number;
    total: number;
    companyName: string;
    status: string;
    startTime?: number;
}

export interface UpdateResult {
    companyId: number;
    companyName: string;
    changes: {
        rank?: { old: string | null; new: string | null; direction?: 'upgrade' | 'downgrade' };
        jobCount?: { old: number; new: number; delta: number };
        status?: { old: string; new: string };
    };
    updatedAt: string;
    error?: string;
}

const electronAPI = {
    db: {
        getCompanies: (filters?: CompanyFilters): Promise<Company[]> =>
            ipcRenderer.invoke('db:getCompanies', filters),
        getCompany: (id: number): Promise<Company | null> =>
            ipcRenderer.invoke('db:getCompany', id),
        updateCompany: (id: number, updates: Partial<Company>): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('db:updateCompany', id, updates),
        deleteCompanies: (ids: number[]): Promise<{ success: boolean; deleted?: number; error?: string }> =>
            ipcRenderer.invoke('db:deleteCompanies', ids),
        exportCsv: (options?: { ids?: number[] }): Promise<{ success: boolean; error?: string; path?: string }> =>
            ipcRenderer.invoke('db:exportCsv', options),
    },
    scraper: {
        start: (options: ScrapingOptions): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('scraper:start', options),
        stop: (): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('scraper:stop'),
        onProgress: (callback: (progress: ScrapingProgress) => void) => {
            ipcRenderer.on('scraper:progress', (_event, progress) => callback(progress));
        },
        offProgress: () => {
            ipcRenderer.removeAllListeners('scraper:progress');
        },
        onLog: (callback: (message: string) => void) => {
            ipcRenderer.on('scraper:log', (_event, message) => callback(message));
        },
        offLog: () => {
            ipcRenderer.removeAllListeners('scraper:log');
        },
    },
    enrich: {
        startPhoneLookup: (): Promise<{ success: boolean; error?: string; updated?: number; total?: number }> =>
            ipcRenderer.invoke('enrich:startPhoneLookup'),
        getStats: (): Promise<EnrichStats> =>
            ipcRenderer.invoke('enrich:getStats'),
        onProgress: (callback: (progress: EnrichProgress) => void) => {
            ipcRenderer.on('enrich:progress', (_event, progress) => callback(progress));
        },
        offProgress: () => {
            ipcRenderer.removeAllListeners('enrich:progress');
        },
        onLog: (callback: (message: string) => void) => {
            ipcRenderer.on('enrich:log', (_event, message) => callback(message));
        },
        offLog: () => {
            ipcRenderer.removeAllListeners('enrich:log');
        },
    },
    update: {
        startUpdate: (companyIds?: number[]): Promise<{ success: boolean; error?: string; results?: UpdateResult[] }> =>
            ipcRenderer.invoke('update:start', companyIds),
        stop: (): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('update:stop'),
        onProgress: (callback: (progress: UpdateProgress) => void) => {
            ipcRenderer.on('update:progress', (_event, progress) => callback(progress));
        },
        offProgress: () => {
            ipcRenderer.removeAllListeners('update:progress');
        },
        onLog: (callback: (message: string) => void) => {
            ipcRenderer.on('update:log', (_event, message) => callback(message));
        },
        offLog: () => {
            ipcRenderer.removeAllListeners('update:log');
        },
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
