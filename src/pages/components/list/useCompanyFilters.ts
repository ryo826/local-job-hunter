import { useState, useMemo, useCallback } from 'react';
import type { Company, BudgetRank } from '@/types';
import type { SortColumn, SortDirection } from './constants';
import { prefectureToRegion } from './constants';

export interface FilterState {
    searchQuery: string;
    selectedStatus: string;
    selectedRanks: Set<BudgetRank>;
    selectedRegions: Set<string>;
    selectedJobTypes: Set<string>;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    currentPage: number;
    perPage: number;
}

export interface UseCompanyFiltersReturn {
    filterState: FilterState;
    setSearchQuery: (query: string) => void;
    setSelectedStatus: (status: string) => void;
    toggleRank: (rank: BudgetRank) => void;
    toggleRegion: (region: string) => void;
    toggleJobType: (jobType: string) => void;
    setSort: (column: SortColumn) => void;
    setCurrentPage: (page: number) => void;
    setPerPage: (perPage: number) => void;
    resetFilters: () => void;
    filteredCompanies: Company[];
    paginatedCompanies: Company[];
    totalPages: number;
    activeFilterCount: number;
}

const DEFAULT_FILTER_STATE: FilterState = {
    searchQuery: '',
    selectedStatus: 'all',
    selectedRanks: new Set(['A', 'B', 'C'] as BudgetRank[]),
    selectedRegions: new Set<string>(),
    selectedJobTypes: new Set<string>(),
    sortColumn: null,
    sortDirection: 'desc',
    currentPage: 1,
    perPage: 50,
};

export function useCompanyFilters(companies: Company[]): UseCompanyFiltersReturn {
    const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);

    const setSearchQuery = useCallback((query: string) => {
        setFilterState(prev => ({ ...prev, searchQuery: query, currentPage: 1 }));
    }, []);

    const setSelectedStatus = useCallback((status: string) => {
        setFilterState(prev => ({ ...prev, selectedStatus: status, currentPage: 1 }));
    }, []);

    const toggleRank = useCallback((rank: BudgetRank) => {
        setFilterState(prev => {
            const newRanks = new Set(prev.selectedRanks);
            if (newRanks.has(rank)) {
                if (newRanks.size > 1) {
                    newRanks.delete(rank);
                }
            } else {
                newRanks.add(rank);
            }
            return { ...prev, selectedRanks: newRanks, currentPage: 1 };
        });
    }, []);

    const toggleRegion = useCallback((region: string) => {
        setFilterState(prev => {
            const newRegions = new Set(prev.selectedRegions);
            if (newRegions.has(region)) {
                newRegions.delete(region);
            } else {
                newRegions.add(region);
            }
            return { ...prev, selectedRegions: newRegions, currentPage: 1 };
        });
    }, []);

    const toggleJobType = useCallback((jobType: string) => {
        setFilterState(prev => {
            const newJobTypes = new Set(prev.selectedJobTypes);
            if (newJobTypes.has(jobType)) {
                newJobTypes.delete(jobType);
            } else {
                newJobTypes.add(jobType);
            }
            return { ...prev, selectedJobTypes: newJobTypes, currentPage: 1 };
        });
    }, []);

    const setSort = useCallback((column: SortColumn) => {
        setFilterState(prev => {
            if (prev.sortColumn === column) {
                return {
                    ...prev,
                    sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc',
                };
            }
            return { ...prev, sortColumn: column, sortDirection: 'desc' };
        });
    }, []);

    const setCurrentPage = useCallback((page: number) => {
        setFilterState(prev => ({ ...prev, currentPage: page }));
    }, []);

    const setPerPage = useCallback((perPage: number) => {
        setFilterState(prev => ({ ...prev, perPage, currentPage: 1 }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilterState(DEFAULT_FILTER_STATE);
    }, []);

    // フィルタリングとソート
    const filteredCompanies = useMemo(() => {
        let result = [...companies];
        const { searchQuery, selectedStatus, selectedRanks, selectedRegions, selectedJobTypes, sortColumn, sortDirection } = filterState;

        // 検索フィルター
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(company =>
                company.company_name?.toLowerCase().includes(query) ||
                company.industry?.toLowerCase().includes(query) ||
                company.area?.toLowerCase().includes(query) ||
                company.job_title?.toLowerCase().includes(query)
            );
        }

        // ステータスフィルター
        if (selectedStatus !== 'all') {
            result = result.filter(company => company.status === selectedStatus);
        }

        // ランクフィルター
        if (selectedRanks.size < 3) {
            result = result.filter(company =>
                company.budget_rank && selectedRanks.has(company.budget_rank)
            );
        }

        // 地域フィルター
        if (selectedRegions.size > 0) {
            result = result.filter(company => {
                const region = prefectureToRegion[company.area || ''];
                return region && selectedRegions.has(region);
            });
        }

        // 職種フィルター
        if (selectedJobTypes.size > 0) {
            result = result.filter(company =>
                company.job_type && selectedJobTypes.has(company.job_type)
            );
        }

        // ソート
        if (sortColumn) {
            result.sort((a, b) => {
                let aVal: any, bVal: any;
                switch (sortColumn) {
                    case 'industry':
                        aVal = a.industry || '';
                        bVal = b.industry || '';
                        break;
                    case 'area':
                        aVal = a.area || '';
                        bVal = b.area || '';
                        break;
                    case 'salary':
                        aVal = a.salary_text || '';
                        bVal = b.salary_text || '';
                        break;
                    case 'employees':
                        aVal = parseInt(a.employees || '0') || 0;
                        bVal = parseInt(b.employees || '0') || 0;
                        break;
                    case 'source':
                        aVal = a.source || '';
                        bVal = b.source || '';
                        break;
                    case 'jobPageUpdated':
                        aVal = a.job_page_updated_at || '';
                        bVal = b.job_page_updated_at || '';
                        break;
                    case 'lastFetched':
                        aVal = a.last_updated_at || a.created_at || '';
                        bVal = b.last_updated_at || b.created_at || '';
                        break;
                    case 'status':
                        aVal = a.status || '';
                        bVal = b.status || '';
                        break;
                    case 'jobType':
                        aVal = a.job_type || '';
                        bVal = b.job_type || '';
                        break;
                    default:
                        return 0;
                }
                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [companies, filterState]);

    // ページネーション
    const paginatedCompanies = useMemo(() => {
        const { currentPage, perPage } = filterState;
        const start = (currentPage - 1) * perPage;
        return filteredCompanies.slice(start, start + perPage);
    }, [filteredCompanies, filterState.currentPage, filterState.perPage]);

    const totalPages = Math.ceil(filteredCompanies.length / filterState.perPage);

    // アクティブフィルター数
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filterState.searchQuery) count++;
        if (filterState.selectedStatus !== 'all') count++;
        if (filterState.selectedRanks.size < 3) count++;
        if (filterState.selectedRegions.size > 0) count++;
        if (filterState.selectedJobTypes.size > 0) count++;
        return count;
    }, [filterState]);

    return {
        filterState,
        setSearchQuery,
        setSelectedStatus,
        toggleRank,
        toggleRegion,
        toggleJobType,
        setSort,
        setCurrentPage,
        setPerPage,
        resetFilters,
        filteredCompanies,
        paginatedCompanies,
        totalPages,
        activeFilterCount,
    };
}
