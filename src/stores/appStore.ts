import { create } from 'zustand';
import type { Company, CompanyFilters, ScrapingProgress, ScrapingOptions } from '../types';

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
    setScrapingRunning: (isRunning: boolean) => void;
    setScrapingProgress: (progress: ScrapingProgress | null) => void;

    // Actions
    fetchCompanies: () => Promise<void>;
    updateCompany: (id: number, updates: Partial<Company>) => Promise<void>;
    startScraping: (options: ScrapingOptions) => Promise<void>;
    stopScraping: () => Promise<void>;
    setupScrapingListener: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
    // Initial state
    companies: [],
    filters: {},
    isLoading: false,
    isScrapingRunning: false,
    scrapingProgress: null,

    // Setters
    setCompanies: (companies) => set({ companies }),
    setFilters: (filters) => set({ filters }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setScrapingRunning: (isScrapingRunning) => set({ isScrapingRunning }),
    setScrapingProgress: (scrapingProgress) => set({ scrapingProgress }),

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
            set({ isScrapingRunning: false });
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
            set({ isScrapingRunning: false, scrapingProgress: null });
        }
    },

    setupScrapingListener: () => {
        window.electronAPI.scraper.onProgress((progress) => {
            set({ scrapingProgress: progress });
        });
    },
}));
