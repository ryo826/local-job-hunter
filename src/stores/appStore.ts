import { create } from 'zustand';
import type { Company, CompanyFilters, ScrapingProgress, ScrapingOptions, UpdateProgress, UpdateResult, BudgetRank } from '../types';

// スクレイピング設定の状態
export interface ScrapingSettingsState {
    keyword: string;
    selectedSites: {
        mynavi: boolean;
        rikunabi: boolean;
        doda: boolean;
    };
    selectedPrefectures: string[];
    selectedJobTypes: string[];
    selectedRanks: BudgetRank[];
    salaryFilter: string;
    employeesFilter: string;
    jobUpdatedFilter: string;
}

interface AppState {
    // Companies
    companies: Company[];
    filters: CompanyFilters;
    isLoading: boolean;
    setCompanies: (companies: Company[]) => void;
    setFilters: (filters: CompanyFilters) => void;
    setIsLoading: (isLoading: boolean) => void;

    // Scraping
    isScrapingRunning: boolean;
    scrapingProgress: ScrapingProgress | null;
    scrapingSettings: ScrapingSettingsState | null;
    setScrapingRunning: (isRunning: boolean) => void;
    setScrapingProgress: (progress: ScrapingProgress | null) => void;
    setScrapingSettings: (settings: ScrapingSettingsState | null) => void;

    // Update
    isUpdateRunning: boolean;
    updateProgress: UpdateProgress | null;
    lastUpdateResults: UpdateResult[] | null;
    setUpdateRunning: (isRunning: boolean) => void;
    setUpdateProgress: (progress: UpdateProgress | null) => void;
    setLastUpdateResults: (results: UpdateResult[] | null) => void;

    // Actions
    fetchCompanies: () => Promise<void>;
    updateCompany: (id: number, updates: Partial<Company>) => Promise<void>;
    startScraping: (options: ScrapingOptions) => Promise<void>;
    stopScraping: () => Promise<void>;
    setupScrapingListener: () => void;
    startUpdate: (companyIds?: number[]) => Promise<UpdateResult[] | null>;
    stopUpdate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    // Initial state
    companies: [],
    filters: {},
    isLoading: false,
    isScrapingRunning: false,
    scrapingProgress: null,
    scrapingSettings: null,
    isUpdateRunning: false,
    updateProgress: null,
    lastUpdateResults: null,

    // Setters
    setCompanies: (companies) => set({ companies }),
    setFilters: (filters) => set({ filters }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setScrapingRunning: (isScrapingRunning) => set({ isScrapingRunning }),
    setScrapingProgress: (scrapingProgress) => set({ scrapingProgress }),
    setScrapingSettings: (scrapingSettings) => set({ scrapingSettings }),
    setUpdateRunning: (isUpdateRunning) => set({ isUpdateRunning }),
    setUpdateProgress: (updateProgress) => set({ updateProgress }),
    setLastUpdateResults: (lastUpdateResults) => set({ lastUpdateResults }),

    // Actions
    fetchCompanies: async () => {
        set({ isLoading: true });
        try {
            const { filters } = get();
            const companies = await window.electronAPI.db.getCompanies(filters);
            set({ companies });
        } catch (error) {
            console.error('Failed to fetch companies:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    updateCompany: async (id, updates) => {
        try {
            await window.electronAPI.db.updateCompany(id, updates);
            // Refresh the list
            await get().fetchCompanies();
        } catch (error) {
            console.error('Failed to update company:', error);
        }
    },

    startScraping: async (options) => {
        console.log('[AppStore] Starting scraping with options:', options);
        set({ isScrapingRunning: true, scrapingProgress: null });

        // Set up progress listener
        window.electronAPI.scraper.onProgress((progress) => {
            console.log('[AppStore] Progress:', progress);
            set({ scrapingProgress: progress });
        });
        window.electronAPI.scraper.onLog((message) => {
            console.log('[AppStore] Log:', message);
        });

        try {
            console.log('[AppStore] Calling electronAPI.scraper.start...');
            const result = await window.electronAPI.scraper.start(options);
            console.log('[AppStore] Scraping result:', result);
            if (!result.success) {
                console.error('Scraping failed:', result.error);
                alert(`スクレイピングエラー: ${result.error}`);
            }
        } catch (error) {
            console.error('Scraping error:', error);
            alert(`スクレイピングエラー: ${error}`);
        } finally {
            window.electronAPI.scraper.offProgress();
            window.electronAPI.scraper.offLog();
            set({ isScrapingRunning: false, scrapingSettings: null });
            // Refresh companies after scraping
            await get().fetchCompanies();
        }
    },

    stopScraping: async () => {
        try {
            await window.electronAPI.scraper.stop();
        } catch (error) {
            console.error('Failed to stop scraping:', error);
        } finally {
            window.electronAPI.scraper.offProgress();
            set({ isScrapingRunning: false, scrapingProgress: null, scrapingSettings: null });
        }
    },

    setupScrapingListener: () => {
        window.electronAPI.scraper.onProgress((progress) => {
            set({ scrapingProgress: progress });
        });
    },

    startUpdate: async (companyIds) => {
        console.log('[AppStore] Starting update for:', companyIds ? `${companyIds.length} companies` : 'all companies');
        set({ isUpdateRunning: true, updateProgress: null, lastUpdateResults: null });

        // Set up progress listener
        window.electronAPI.update.onProgress((progress) => {
            console.log('[AppStore] Update progress:', progress);
            set({ updateProgress: progress });
        });
        window.electronAPI.update.onLog((message) => {
            console.log('[AppStore] Update log:', message);
        });

        try {
            const result = await window.electronAPI.update.startUpdate(companyIds);
            console.log('[AppStore] Update result:', result);
            if (result.success && result.results) {
                set({ lastUpdateResults: result.results });
                return result.results;
            } else if (!result.success) {
                console.error('Update failed:', result.error);
                alert(`更新エラー: ${result.error}`);
            }
            return null;
        } catch (error) {
            console.error('Update error:', error);
            alert(`更新エラー: ${error}`);
            return null;
        } finally {
            window.electronAPI.update.offProgress();
            window.electronAPI.update.offLog();
            set({ isUpdateRunning: false });
            // Refresh companies after update
            await get().fetchCompanies();
        }
    },

    stopUpdate: async () => {
        try {
            await window.electronAPI.update.stop();
        } catch (error) {
            console.error('Failed to stop update:', error);
        } finally {
            window.electronAPI.update.offProgress();
            set({ isUpdateRunning: false, updateProgress: null });
        }
    },
}));
