import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { BudgetRank } from '@/types';
import type { SiteKey } from './constants';
import { getJobTypeCategoriesForSite, regionPrefectures, siteFilterSupport } from './constants';

export interface SearchFiltersState {
    selectedSite: SiteKey;  // 単一選択に変更
    selectedPrefectures: Set<string>;
    selectedJobTypes: Set<string>;
    selectedRanks: Set<BudgetRank>;
    salaryFilter: string;
    employeesFilter: string;
    jobUpdatedFilter: string;
}

export interface UseSearchFiltersReturn {
    state: SearchFiltersState;
    selectSite: (site: SiteKey) => void;  // toggleSiteからselectSiteに変更
    togglePrefecture: (prefecture: string) => void;
    toggleRegion: (region: string) => void;
    toggleJobType: (jobTypeId: string) => void;
    toggleRank: (rank: BudgetRank) => void;
    setSalaryFilter: (value: string) => void;
    setEmployeesFilter: (value: string) => void;
    setJobUpdatedFilter: (value: string) => void;
    clearPrefectures: () => void;
    clearJobTypes: () => void;
    getLocationSummary: () => string;
    getJobTypeSummary: () => string;
    isFilterSupported: (filter: 'salary' | 'employees' | 'jobUpdated') => boolean;
}

const DEFAULT_STATE: SearchFiltersState = {
    selectedSite: 'doda',  // デフォルトでdodaを選択（最も機能が充実）
    selectedPrefectures: new Set(),
    selectedJobTypes: new Set(),
    selectedRanks: new Set(['A', 'B', 'C'] as BudgetRank[]),
    salaryFilter: 'all',
    employeesFilter: 'all',
    jobUpdatedFilter: 'all',
};

export function useSearchFilters(): UseSearchFiltersReturn {
    const { isScrapingRunning, scrapingSettings } = useAppStore();

    const [state, setState] = useState<SearchFiltersState>(DEFAULT_STATE);

    // スクレイピング実行中の設定を復元
    useEffect(() => {
        if (isScrapingRunning && scrapingSettings) {
            setState({
                selectedSite: scrapingSettings.selectedSite || 'doda',
                selectedPrefectures: new Set(scrapingSettings.selectedPrefectures),
                selectedJobTypes: new Set(scrapingSettings.selectedJobTypes),
                selectedRanks: new Set(scrapingSettings.selectedRanks),
                salaryFilter: scrapingSettings.salaryFilter,
                employeesFilter: scrapingSettings.employeesFilter,
                jobUpdatedFilter: scrapingSettings.jobUpdatedFilter,
            });
        }
    }, []);

    // サイト選択（単一選択）- 非対応フィルターをリセット、職種もリセット
    const selectSite = useCallback((site: SiteKey) => {
        setState(prev => {
            const support = siteFilterSupport[site];
            return {
                ...prev,
                selectedSite: site,
                // サイト間でカテゴリIDが異なるため職種選択をリセット
                selectedJobTypes: new Set<string>(),
                // 非対応フィルターをリセット
                salaryFilter: support.salary ? prev.salaryFilter : 'all',
                employeesFilter: support.employees ? prev.employeesFilter : 'all',
                jobUpdatedFilter: support.jobUpdated ? prev.jobUpdatedFilter : 'all',
            };
        });
    }, []);

    const togglePrefecture = useCallback((prefecture: string) => {
        setState(prev => {
            const newSet = new Set(prev.selectedPrefectures);
            if (newSet.has(prefecture)) {
                newSet.delete(prefecture);
            } else {
                newSet.add(prefecture);
            }
            return { ...prev, selectedPrefectures: newSet };
        });
    }, []);

    const toggleRegion = useCallback((region: string) => {
        const prefectures = regionPrefectures[region];
        setState(prev => {
            const allSelected = prefectures.every(p => prev.selectedPrefectures.has(p));
            const newSet = new Set(prev.selectedPrefectures);

            if (allSelected) {
                prefectures.forEach(p => newSet.delete(p));
            } else {
                prefectures.forEach(p => newSet.add(p));
            }
            return { ...prev, selectedPrefectures: newSet };
        });
    }, []);

    const toggleJobType = useCallback((jobTypeId: string) => {
        setState(prev => {
            const newSet = new Set(prev.selectedJobTypes);
            if (newSet.has(jobTypeId)) {
                newSet.delete(jobTypeId);
            } else {
                newSet.add(jobTypeId);
            }
            return { ...prev, selectedJobTypes: newSet };
        });
    }, []);

    const toggleRank = useCallback((rank: BudgetRank) => {
        setState(prev => {
            const newSet = new Set(prev.selectedRanks);
            if (newSet.has(rank)) {
                if (newSet.size > 1) {
                    newSet.delete(rank);
                }
            } else {
                newSet.add(rank);
            }
            return { ...prev, selectedRanks: newSet };
        });
    }, []);

    const setSalaryFilter = useCallback((value: string) => {
        setState(prev => ({ ...prev, salaryFilter: value }));
    }, []);

    const setEmployeesFilter = useCallback((value: string) => {
        setState(prev => ({ ...prev, employeesFilter: value }));
    }, []);

    const setJobUpdatedFilter = useCallback((value: string) => {
        setState(prev => ({ ...prev, jobUpdatedFilter: value }));
    }, []);

    const clearPrefectures = useCallback(() => {
        setState(prev => ({ ...prev, selectedPrefectures: new Set() }));
    }, []);

    const clearJobTypes = useCallback(() => {
        setState(prev => ({ ...prev, selectedJobTypes: new Set() }));
    }, []);

    const getLocationSummary = useCallback(() => {
        if (state.selectedPrefectures.size === 0) return '選択してください';
        if (state.selectedPrefectures.size <= 3) {
            return Array.from(state.selectedPrefectures).join(', ');
        }
        return `${Array.from(state.selectedPrefectures).slice(0, 2).join(', ')} 他${state.selectedPrefectures.size - 2}件`;
    }, [state.selectedPrefectures]);

    const getJobTypeSummary = useCallback(() => {
        if (state.selectedJobTypes.size === 0) return '選択してください';
        const categories = getJobTypeCategoriesForSite(state.selectedSite);
        const selectedNames = categories
            .filter(cat => state.selectedJobTypes.has(cat.id))
            .map(cat => cat.name);
        if (selectedNames.length <= 2) {
            return selectedNames.join(', ');
        }
        return `${selectedNames.slice(0, 2).join(', ')} 他${selectedNames.length - 2}件`;
    }, [state.selectedJobTypes, state.selectedSite]);

    // 選択中のサイトで特定のフィルターがサポートされているか
    const isFilterSupported = useCallback((filter: 'salary' | 'employees' | 'jobUpdated') => {
        return siteFilterSupport[state.selectedSite][filter];
    }, [state.selectedSite]);

    return {
        state,
        selectSite,
        togglePrefecture,
        toggleRegion,
        toggleJobType,
        toggleRank,
        setSalaryFilter,
        setEmployeesFilter,
        setJobUpdatedFilter,
        clearPrefectures,
        clearJobTypes,
        getLocationSummary,
        getJobTypeSummary,
        isFilterSupported,
    };
}
