import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Loader2,
    Download,
    ChevronDown,
    ChevronUp,
    Trash2,
    Search,
    Filter,
    RefreshCw,
    Phone,
    X,
    RotateCcw,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { Company } from '@/types';
import { cn } from '@/lib/utils';
import type { FilterTab, SortColumn, SortDirection } from './components/list/constants';
import { prefectureToRegion } from './components/list/constants';
import {
    formatJobPageUpdated,
    formatLastFetched,
    parseSalary,
    parseEmployees,
} from './components/list/utils';
import { CompanyFilters } from './components/list/CompanyFilters';
import { CompanyTable } from './components/list/CompanyTable';
import { CompanyDetailPanel } from './components/list/CompanyDetailPanel';
import { DeleteConfirmDialog, UpdateResultsDialog } from './components/list/CompanyDialogs';

interface ListPageProps {
    sidebarCollapsed?: boolean;
}

interface ColumnFilterState {
    industry: string;
    area: string;
    salary: string;
    employees: string;
    source: string;
    rank: string;
    status: string;
    jobPageUpdated: string;
    lastFetched: string;
    jobType: string;
}

const DEFAULT_COLUMN_FILTERS: ColumnFilterState = {
    industry: 'all',
    area: 'all',
    salary: 'all',
    employees: 'all',
    source: 'all',
    rank: 'all',
    status: 'all',
    jobPageUpdated: 'all',
    lastFetched: 'all',
    jobType: 'all',
};

export function ListPage({ sidebarCollapsed = false }: ListPageProps) {
    const {
        companies,
        filters,
        setFilters,
        fetchCompanies,
        updateCompany,
        isUpdateRunning,
        updateProgress,
        lastUpdateResults,
        startUpdate,
        stopUpdate,
    } = useAppStore();

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [selectedJobTypes, setSelectedJobTypes] = useState<Set<string>>(new Set());
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [detailCompany, setDetailCompany] = useState<Company | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>('勤務地');
    const [isFilterExpanded, setIsFilterExpanded] = useState(false);

    // Refs for click outside detection
    const detailPanelRef = useRef<HTMLDivElement>(null);
    const filterPanelRef = useRef<HTMLDivElement>(null);

    // Phone enrichment state
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; companyName: string } | null>(null);
    const [enrichStats, setEnrichStats] = useState<{ withPhone: number; withoutPhone: number } | null>(null);

    // Delete state
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Update results dialog state
    const [showUpdateResults, setShowUpdateResults] = useState(false);

    // Column filters
    const [columnFilters, setColumnFilters] = useState<ColumnFilterState>(DEFAULT_COLUMN_FILTERS);

    // Sorting state
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    useEffect(() => {
        fetchCompanies();
        loadEnrichStats();
    }, []);

    // Click outside handler for detail panel
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isDetailOpen && detailPanelRef.current && !detailPanelRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (!target.closest('[data-detail-trigger]')) {
                    setIsDetailOpen(false);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDetailOpen]);

    // Click outside handler for filter panel
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isFilterExpanded && filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (!target.closest('[data-filter-trigger]')) {
                    setIsFilterExpanded(false);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isFilterExpanded]);

    // Load phone enrichment stats
    const loadEnrichStats = async () => {
        const stats = await window.electronAPI.enrich.getStats();
        setEnrichStats({ withPhone: stats.withPhone, withoutPhone: stats.withoutPhone });
    };

    // Handle phone number lookup via Google Maps API
    const handlePhoneLookup = async () => {
        if (isEnriching) return;

        setIsEnriching(true);
        setEnrichProgress(null);

        window.electronAPI.enrich.onProgress((progress) => {
            setEnrichProgress(progress);
        });

        try {
            const result = await window.electronAPI.enrich.startPhoneLookup();

            if (result.success) {
                alert(`電話番号取得完了: ${result.updated}/${result.total} 件更新`);
                fetchCompanies();
                loadEnrichStats();
            } else {
                alert(`エラー: ${result.error}`);
            }
        } catch (error) {
            alert(`エラー: ${error}`);
        } finally {
            setIsEnriching(false);
            setEnrichProgress(null);
            window.electronAPI.enrich.offProgress();
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters({
                search: searchQuery || undefined,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Handle CSV export
    const handleExport = async () => {
        if (isExporting) return;
        setIsExporting(true);

        try {
            const options = selectedRows.size > 0 ? { ids: Array.from(selectedRows) } : undefined;
            const result = await window.electronAPI.db.exportCsv(options);

            if (result.success) {
                alert(`エクスポート完了: ${result.path}`);
            } else if (result.error !== 'キャンセルされました') {
                alert(`エラー: ${result.error}`);
            }
        } catch (error) {
            alert(`エラー: ${error}`);
        } finally {
            setIsExporting(false);
        }
    };

    // Handle delete selected companies
    const handleDelete = async () => {
        if (isDeleting || selectedRows.size === 0) return;
        setIsDeleting(true);

        try {
            const ids = Array.from(selectedRows);
            const result = await window.electronAPI.db.deleteCompanies(ids);

            if (result.success) {
                setSelectedRows(new Set());
                fetchCompanies();
                loadEnrichStats();
                setShowDeleteConfirm(false);
            } else {
                alert(`削除エラー: ${result.error}`);
            }
        } catch (error) {
            alert(`エラー: ${error}`);
        } finally {
            setIsDeleting(false);
        }
    };

    // Reset all filters
    const resetAllFilters = () => {
        setSelectedRegions(new Set());
        setSelectedJobTypes(new Set());
        setColumnFilters(DEFAULT_COLUMN_FILTERS);
        setSortColumn(null);
        setSortDirection('asc');
    };

    // Toggle checkbox selection
    const toggleRegion = (region: string) => {
        setSelectedRegions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(region)) {
                newSet.delete(region);
            } else {
                newSet.add(region);
            }
            return newSet;
        });
    };

    const toggleJobType = (jobType: string) => {
        setSelectedJobTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(jobType)) {
                newSet.delete(jobType);
            } else {
                newSet.add(jobType);
            }
            return newSet;
        });
    };

    // Check if salary matches filter
    const matchesSalaryFilter = (salaryText: string | null, filter: string): boolean => {
        if (filter === 'all') return true;
        const salary = parseSalary(salaryText);
        switch (filter) {
            case '300万未満': return salary < 300;
            case '300-500万': return salary >= 300 && salary < 500;
            case '500-700万': return salary >= 500 && salary < 700;
            case '700-1000万': return salary >= 700 && salary < 1000;
            case '1000万以上': return salary >= 1000;
            default: return true;
        }
    };

    // Check if employees matches filter
    const matchesEmployeesFilter = (employeesText: string | null, filter: string): boolean => {
        if (filter === 'all') return true;
        const employees = parseEmployees(employeesText);
        switch (filter) {
            case '10人未満': return employees < 10;
            case '10-50人': return employees >= 10 && employees < 50;
            case '50-100人': return employees >= 50 && employees < 100;
            case '100-500人': return employees >= 100 && employees < 500;
            case '500人以上': return employees >= 500;
            default: return true;
        }
    };

    // Check if job page updated matches filter
    const matchesJobPageUpdatedFilter = (dateStr: string | null, filter: string): boolean => {
        if (filter === 'all') return true;
        if (!dateStr) return filter === '14日以上';
        const { daysAgo } = formatJobPageUpdated(dateStr);
        switch (filter) {
            case '3日以内': return daysAgo >= 0 && daysAgo <= 3;
            case '7日以内': return daysAgo >= 0 && daysAgo <= 7;
            case '14日以内': return daysAgo >= 0 && daysAgo <= 14;
            case '14日以上': return daysAgo < 0 || daysAgo > 14;
            default: return true;
        }
    };

    // Check if last fetched matches filter
    const matchesLastFetchedFilter = (dateStr: string | null, filter: string): boolean => {
        if (filter === 'all') return true;
        if (!dateStr) return filter === '7日以上';
        const { daysAgo } = formatLastFetched(dateStr);
        switch (filter) {
            case '今日': return daysAgo === 0;
            case '3日以内': return daysAgo >= 0 && daysAgo <= 3;
            case '7日以内': return daysAgo >= 0 && daysAgo <= 7;
            case '7日以上': return daysAgo < 0 || daysAgo > 7;
            default: return true;
        }
    };

    // Filter companies
    const filteredCompanies = useMemo(() => {
        let result = companies.filter(company => {
            // Region filter
            if (selectedRegions.size > 0) {
                const companyRegion = company.area ? prefectureToRegion[company.area] : null;
                if (!companyRegion || !selectedRegions.has(companyRegion)) {
                    return false;
                }
            }

            // Job type filter (from checkbox panel)
            if (selectedJobTypes.size > 0) {
                const jobTitle = company.job_title?.toLowerCase() || '';
                const industry = company.industry?.toLowerCase() || '';
                const searchText = jobTitle + ' ' + industry;

                const jobTypeKeywords: Record<string, string[]> = {
                    '営業・販売': ['営業', '販売', 'セールス', 'sales'],
                    '経営・事業企画・人事・事務': ['経営', '事業企画', '人事', '事務', '経理', '総務', '管理'],
                    'IT・Web・ゲームエンジニア': ['it', 'web', 'エンジニア', 'プログラマ', 'システム', '開発', 'ゲーム'],
                    'モノづくりエンジニア': ['製造', '工場', '機械', '電気', '電子', '設計', '品質'],
                    'コンサルタント・士業・金融': ['コンサル', '士業', '金融', '銀行', '証券', '保険', '会計'],
                    'サービス・販売・接客': ['サービス', '販売', '接客', '飲食', 'ホテル', '店舗'],
                    '不動産・建設': ['不動産', '建設', '建築', '土木', '施工'],
                    '物流・運輸・運転': ['物流', '運輸', '運転', 'ドライバー', '配送', '倉庫'],
                };

                const matchesAnySelected = Array.from(selectedJobTypes).some(selectedType => {
                    const keywords = jobTypeKeywords[selectedType];
                    if (keywords) {
                        return keywords.some(kw => searchText.includes(kw));
                    } else if (selectedType === 'その他') {
                        const allKeywords = Object.values(jobTypeKeywords).flat();
                        return !allKeywords.some(kw => searchText.includes(kw));
                    }
                    return false;
                });

                if (!matchesAnySelected) return false;
            }

            // Column filters
            if (columnFilters.industry !== 'all' && !company.industry?.startsWith(columnFilters.industry)) return false;
            if (columnFilters.area !== 'all' && company.area !== columnFilters.area) return false;
            if (columnFilters.source !== 'all' && company.source !== columnFilters.source) return false;
            if (!matchesSalaryFilter(company.salary_text, columnFilters.salary)) return false;
            if (!matchesEmployeesFilter(company.employees, columnFilters.employees)) return false;
            if (columnFilters.rank !== 'all' && company.budget_rank !== columnFilters.rank) return false;
            if (columnFilters.status !== 'all' && company.status !== columnFilters.status) return false;
            if (!matchesJobPageUpdatedFilter(company.job_page_updated_at, columnFilters.jobPageUpdated)) return false;
            if (!matchesLastFetchedFilter(company.last_updated_at || company.created_at, columnFilters.lastFetched)) return false;
            if (columnFilters.jobType !== 'all' && company.job_type !== columnFilters.jobType) return false;

            return true;
        });

        // Apply sorting
        if (sortColumn) {
            result = [...result].sort((a, b) => {
                let aVal: string | number = '';
                let bVal: string | number = '';

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
                        aVal = parseSalary(a.salary_text);
                        bVal = parseSalary(b.salary_text);
                        break;
                    case 'employees':
                        aVal = parseEmployees(a.employees);
                        bVal = parseEmployees(b.employees);
                        break;
                    case 'source':
                        aVal = a.source || '';
                        bVal = b.source || '';
                        break;
                    case 'jobPageUpdated':
                        aVal = a.job_page_updated_at ? new Date(a.job_page_updated_at).getTime() : 0;
                        bVal = b.job_page_updated_at ? new Date(b.job_page_updated_at).getTime() : 0;
                        break;
                    case 'lastFetched':
                        aVal = (a.last_updated_at || a.created_at) ? new Date(a.last_updated_at || a.created_at!).getTime() : 0;
                        bVal = (b.last_updated_at || b.created_at) ? new Date(b.last_updated_at || b.created_at!).getTime() : 0;
                        break;
                    case 'status':
                        aVal = a.status || '';
                        bVal = b.status || '';
                        break;
                    case 'jobType':
                        aVal = a.job_type || '';
                        bVal = b.job_type || '';
                        break;
                }

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }
                const comparison = String(aVal).localeCompare(String(bVal), 'ja');
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [companies, selectedRegions, selectedJobTypes, columnFilters, sortColumn, sortDirection]);

    // Handle sort column click
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else {
                setSortColumn(null);
                setSortDirection('asc');
            }
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const toggleRowSelection = (id: number) => {
        setSelectedRows((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleAllSelection = () => {
        if (selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredCompanies.map((c) => c.id)));
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        await updateCompany(id, { status: newStatus });
        fetchCompanies();
    };

    const handleViewDetail = async (company: Company) => {
        const fullCompany = await window.electronAPI.db.getCompany(company.id);
        if (fullCompany) {
            setDetailCompany(fullCompany);
            setIsDetailOpen(true);
        }
    };

    const handleUpdateNote = async (id: number, note: string) => {
        await updateCompany(id, { note });
    };

    const handleColumnFilterChange = (column: keyof ColumnFilterState, value: string) => {
        setColumnFilters(prev => ({ ...prev, [column]: value }));
    };

    const activeFiltersCount = selectedRegions.size + selectedJobTypes.size +
        Object.values(columnFilters).filter(v => v !== 'all').length;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Company List</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {filteredCompanies.length}件表示 / 全{companies.length}件
                        {enrichStats && (
                            <span className="ml-2 text-xs">
                                (Phone: <span className="text-green-600 dark:text-green-400">{enrichStats.withPhone}</span> / None: {enrichStats.withoutPhone})
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Delete Button */}
                    {selectedRows.size > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-1.5" />
                            )}
                            Delete ({selectedRows.size})
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={handleExport}
                        disabled={isExporting || companies.length === 0}
                    >
                        {isExporting ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-1.5" />
                        )}
                        {selectedRows.size > 0 ? `Export (${selectedRows.size})` : 'Export CSV'}
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        className="rounded-xl bg-green-600 hover:bg-green-700"
                        onClick={handlePhoneLookup}
                        disabled={isEnriching || (enrichStats?.withoutPhone === 0)}
                    >
                        {isEnriching ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                {enrichProgress ? `${enrichProgress.current}/${enrichProgress.total}` : '準備中...'}
                            </>
                        ) : (
                            <>
                                <Phone className="h-4 w-4 mr-1.5" />
                                電話番号取得
                            </>
                        )}
                    </Button>
                    {/* Update Buttons */}
                    {selectedRows.size > 0 ? (
                        <Button
                            variant="default"
                            size="sm"
                            className="rounded-xl bg-blue-600 hover:bg-blue-700"
                            onClick={() => startUpdate(Array.from(selectedRows)).then((results) => {
                                if (results && results.length > 0) {
                                    setShowUpdateResults(true);
                                }
                            })}
                            disabled={isUpdateRunning}
                        >
                            {isUpdateRunning ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                    更新中...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-1.5" />
                                    選択更新 ({selectedRows.size})
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            className="rounded-xl bg-blue-600 hover:bg-blue-700"
                            onClick={() => startUpdate().then((results) => {
                                if (results && results.length > 0) {
                                    setShowUpdateResults(true);
                                }
                            })}
                            disabled={isUpdateRunning || companies.length === 0}
                        >
                            {isUpdateRunning ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                    更新中...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-1.5" />
                                    全件更新
                                </>
                            )}
                        </Button>
                    )}
                    {isUpdateRunning && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-xl"
                            onClick={stopUpdate}
                        >
                            <X className="h-4 w-4 mr-1.5" />
                            停止
                        </Button>
                    )}
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-10 h-11 rounded-xl"
                        placeholder="会社名・住所・メモで検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {activeFiltersCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 rounded-xl text-destructive hover:text-destructive"
                        onClick={resetAllFilters}
                        title="フィルターをリセット"
                    >
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        リセット
                    </Button>
                )}
                <Button
                    variant={isFilterExpanded ? 'default' : 'outline'}
                    className={cn(
                        'h-11 rounded-xl gap-2',
                        activeFiltersCount > 0 && !isFilterExpanded && 'border-primary text-primary'
                    )}
                    onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                    data-filter-trigger
                >
                    <Filter className="h-4 w-4" />
                    フィルター
                    {activeFiltersCount > 0 && (
                        <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-xs">
                            {activeFiltersCount}
                        </Badge>
                    )}
                    {isFilterExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>

            {/* Selection Bar */}
            {selectedRows.size > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <span className="text-sm font-medium text-primary">
                        {selectedRows.size} 件選択中
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => setSelectedRows(new Set())}
                    >
                        選択解除
                    </Button>
                </div>
            )}

            {/* Update Progress Bar */}
            {isUpdateRunning && updateProgress && (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            更新中: {updateProgress.companyName}
                        </span>
                        <span className="text-sm text-blue-600 dark:text-blue-400">
                            {updateProgress.current}/{updateProgress.total} 件
                        </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${(updateProgress.current / updateProgress.total) * 100}%` }}
                        />
                    </div>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                        {updateProgress.status}
                    </p>
                </div>
            )}

            {/* Expandable Filter Section */}
            {isFilterExpanded && (
                <CompanyFilters
                    activeFilterTab={activeFilterTab}
                    setActiveFilterTab={setActiveFilterTab}
                    selectedRegions={selectedRegions}
                    toggleRegion={toggleRegion}
                    selectedJobTypes={selectedJobTypes}
                    toggleJobType={toggleJobType}
                    activeFiltersCount={activeFiltersCount}
                    resetAllFilters={resetAllFilters}
                    filterPanelRef={filterPanelRef}
                />
            )}

            {/* Data Table */}
            <CompanyTable
                companies={companies}
                filteredCompanies={filteredCompanies}
                selectedRows={selectedRows}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                columnFilters={columnFilters}
                onToggleRow={toggleRowSelection}
                onToggleAll={toggleAllSelection}
                onSort={handleSort}
                onColumnFilterChange={handleColumnFilterChange}
                onViewDetail={handleViewDetail}
                onStatusChange={handleStatusChange}
            />

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                selectedCount={selectedRows.size}
                isDeleting={isDeleting}
                onDelete={handleDelete}
            />

            {/* Update Results Dialog */}
            <UpdateResultsDialog
                isOpen={showUpdateResults}
                onClose={() => setShowUpdateResults(false)}
                results={lastUpdateResults}
            />

            {/* Detail Slide Panel */}
            <CompanyDetailPanel
                isOpen={isDetailOpen}
                company={detailCompany}
                sidebarCollapsed={sidebarCollapsed}
                onClose={() => setIsDetailOpen(false)}
                onUpdateNote={handleUpdateNote}
                panelRef={detailPanelRef}
            />
        </div>
    );
}
