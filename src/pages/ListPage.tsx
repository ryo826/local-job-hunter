import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ExternalLink,
    Eye,
    Phone,
    Loader2,
    Download,
    ChevronDown,
    ChevronUp,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Trash2,
    Search,
    Filter,
    RefreshCw,
    Building2,
    MapPin,
    Briefcase,
    X,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { Company, BudgetRank } from '@/types';
import { formatCompanyData } from '@/utils/companyFormatter';
import { cn } from '@/lib/utils';

// ランク定義（ツールチップ用）
const RANK_DEFINITIONS = {
    A: {
        label: '高予算層',
        description: 'プレミアム枠・PR枠・Job Flair等の有料オプション使用',
    },
    B: {
        label: '中予算層',
        description: '1ページ目表示(上位30〜100件)',
    },
    C: {
        label: '低予算層',
        description: '2ページ目以降または下位表示',
    }
} as const;

// Rank badge config
const rankConfig: Record<BudgetRank, { label: string; className: string }> = {
    A: { label: 'A', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 font-bold' },
    B: { label: 'B', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-bold' },
    C: { label: 'C', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-bold' },
};

// Sort types
type SortColumn = 'industry' | 'area' | 'salary' | 'employees' | 'source' | null;
type SortDirection = 'asc' | 'desc';

// Filter tab options
type FilterTab = '勤務地' | '職種';

// Region checkbox options
const regionCheckboxOptions = [
    '北海道', '東北', '関東', '甲信越', '北陸',
    '東海', '関西', '中国', '四国', '九州・沖縄'
];

// Job type checkbox options
const jobTypeCheckboxOptions = [
    '営業・販売',
    '経営・事業企画・人事・事務',
    'IT・Web・ゲームエンジニア',
    'モノづくりエンジニア',
    'コンサルタント・士業・金融',
    'サービス・販売・接客',
    '不動産・建設',
    '物流・運輸・運転',
    'その他'
];

// Map prefectures to regions
const prefectureToRegion: Record<string, string> = {
    '北海道': '北海道',
    '青森県': '東北', '岩手県': '東北', '宮城県': '東北', '秋田県': '東北', '山形県': '東北', '福島県': '東北',
    '茨城県': '関東', '栃木県': '関東', '群馬県': '関東', '埼玉県': '関東', '千葉県': '関東', '東京都': '関東', '神奈川県': '関東',
    '新潟県': '甲信越', '山梨県': '甲信越', '長野県': '甲信越',
    '富山県': '北陸', '石川県': '北陸', '福井県': '北陸',
    '岐阜県': '東海', '静岡県': '東海', '愛知県': '東海', '三重県': '東海',
    '滋賀県': '関西', '京都府': '関西', '大阪府': '関西', '兵庫県': '関西', '奈良県': '関西', '和歌山県': '関西',
    '鳥取県': '中国', '島根県': '中国', '岡山県': '中国', '広島県': '中国', '山口県': '中国',
    '徳島県': '四国', '香川県': '四国', '愛媛県': '四国', '高知県': '四国',
    '福岡県': '九州・沖縄', '佐賀県': '九州・沖縄', '長崎県': '九州・沖縄', '熊本県': '九州・沖縄',
    '大分県': '九州・沖縄', '宮崎県': '九州・沖縄', '鹿児島県': '九州・沖縄', '沖縄県': '九州・沖縄',
};

// Source badge config
const sourceConfig: Record<string, { label: string; className: string }> = {
    mynavi: { label: 'マイナビ', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300' },
    rikunabi: { label: 'リクナビ', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
    doda: { label: 'doda', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
};

// Status badge config
const statusConfig: Record<string, { label: string; className: string }> = {
    new: { label: '新規', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    unreachable: { label: '不通', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
    promising: { label: '見込み', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    keyman: { label: 'キーマン', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    meeting: { label: '商談中', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
    won: { label: '成約', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    lost: { label: '失注', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
    ng: { label: 'NG', className: 'bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-300' },
};

export function ListPage() {
    const { companies, filters, setFilters, fetchCompanies, updateCompany } = useAppStore();

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [selectedJobTypes, setSelectedJobTypes] = useState<Set<string>>(new Set());
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [detailCompany, setDetailCompany] = useState<Company | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>('勤務地');
    const [isFilterExpanded, setIsFilterExpanded] = useState(false);

    // Phone enrichment state
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; companyName: string } | null>(null);
    const [enrichStats, setEnrichStats] = useState<{ withPhone: number; withoutPhone: number } | null>(null);

    // Delete state
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Column filters
    const [industryFilter, setIndustryFilter] = useState<string>('all');
    const [areaFilter, setAreaFilter] = useState<string>('all');
    const [salaryFilter, setSalaryFilter] = useState<string>('all');
    const [employeesFilter, setEmployeesFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [rankFilter, setRankFilter] = useState<string>('all');

    // Sorting state
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    useEffect(() => {
        fetchCompanies();
        loadEnrichStats();
    }, []);

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

        // Set up progress listener
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
                status: statusFilter !== 'all' ? statusFilter : undefined,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter]);

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

    // Generate unique filter options from data
    const filterOptions = useMemo(() => {
        const industries = new Set<string>();
        const areas = new Set<string>();
        const sources = new Set<string>();

        companies.forEach(company => {
            if (company.industry) {
                const shortIndustry = company.industry.substring(0, 20);
                industries.add(shortIndustry);
            }
            if (company.area) areas.add(company.area);
            if (company.source) sources.add(company.source);
        });

        return {
            industries: Array.from(industries).sort(),
            areas: Array.from(areas).sort(),
            sources: Array.from(sources).sort(),
            salaryRanges: ['300万未満', '300-500万', '500-700万', '700-1000万', '1000万以上'],
            employeeRanges: ['10人未満', '10-50人', '50-100人', '100-500人', '500人以上'],
        };
    }, [companies]);

    // Parse salary to number for comparison
    const parseSalary = (salaryText: string | null): number => {
        if (!salaryText) return 0;
        const match = salaryText.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    };

    // Parse employees to number for comparison
    const parseEmployees = (employeesText: string | null): number => {
        if (!employeesText) return 0;
        const match = employeesText.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
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

            // Job type filter
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
            if (industryFilter !== 'all' && !company.industry?.startsWith(industryFilter)) return false;
            if (areaFilter !== 'all' && company.area !== areaFilter) return false;
            if (sourceFilter !== 'all' && company.source !== sourceFilter) return false;
            if (!matchesSalaryFilter(company.salary_text, salaryFilter)) return false;
            if (!matchesEmployeesFilter(company.employees, employeesFilter)) return false;
            // ランクフィルター
            if (rankFilter !== 'all' && company.budget_rank !== rankFilter) return false;

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
                }

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }
                const comparison = String(aVal).localeCompare(String(bVal), 'ja');
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [companies, selectedRegions, selectedJobTypes, industryFilter, areaFilter, salaryFilter, employeesFilter, sourceFilter, rankFilter, sortColumn, sortDirection]);

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

    // Get sort icon for column
    const getSortIcon = (column: SortColumn) => {
        if (sortColumn !== column) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
            : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
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

    const getSourceBadge = (source: string) => {
        const config = sourceConfig[source] || { label: source, className: 'bg-slate-100 text-slate-700' };
        return (
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
                {config.label}
            </span>
        );
    };

    const getStatusBadge = (status: string) => {
        const config = statusConfig[status] || { label: status, className: 'bg-slate-100 text-slate-700' };
        return (
            <span className={cn('px-3 py-1 rounded-full text-xs font-medium', config.className)}>
                {config.label}
            </span>
        );
    };

    const getRankBadge = (rank: BudgetRank | null) => {
        if (!rank) {
            return <span className="text-muted-foreground text-xs">-</span>;
        }
        const config = rankConfig[rank];
        const definition = RANK_DEFINITIONS[rank];
        return (
            <span
                className={cn('px-2 py-0.5 rounded-full text-xs', config.className)}
                title={definition.description}
            >
                {config.label}
            </span>
        );
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

    const activeFiltersCount = selectedRegions.size + selectedJobTypes.size +
        (industryFilter !== 'all' ? 1 : 0) +
        (areaFilter !== 'all' ? 1 : 0) +
        (salaryFilter !== 'all' ? 1 : 0) +
        (employeesFilter !== 'all' ? 1 : 0) +
        (sourceFilter !== 'all' ? 1 : 0) +
        (rankFilter !== 'all' ? 1 : 0);

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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        onClick={() => fetchCompanies()}
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 h-11 rounded-xl">
                        <SelectValue placeholder="ステータス" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">すべて</SelectItem>
                        <SelectItem value="new">新規</SelectItem>
                        <SelectItem value="promising">見込み</SelectItem>
                        <SelectItem value="meeting">商談中</SelectItem>
                        <SelectItem value="won">成約</SelectItem>
                        <SelectItem value="ng">NG</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant={isFilterExpanded ? 'default' : 'outline'}
                    className={cn(
                        'h-11 rounded-xl gap-2',
                        activeFiltersCount > 0 && !isFilterExpanded && 'border-primary text-primary'
                    )}
                    onClick={() => setIsFilterExpanded(!isFilterExpanded)}
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

            {/* Expandable Filter Section */}
            {isFilterExpanded && (
                <Card className="p-5 rounded-2xl">
                    {/* Filter Tabs */}
                    <div className="flex gap-1 mb-4">
                        {(['勤務地', '職種'] as FilterTab[]).map(tab => (
                            <button
                                key={tab}
                                className={cn(
                                    'px-4 py-2 text-sm font-medium rounded-xl transition-all',
                                    activeFilterTab === tab
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                )}
                                onClick={() => setActiveFilterTab(tab)}
                            >
                                {tab === '勤務地' && <MapPin className="h-4 w-4 inline mr-1.5" />}
                                {tab === '職種' && <Briefcase className="h-4 w-4 inline mr-1.5" />}
                                {tab}
                                {tab === '勤務地' && selectedRegions.size > 0 && (
                                    <Badge className="ml-1.5 h-5 px-1.5 rounded-full text-xs">
                                        {selectedRegions.size}
                                    </Badge>
                                )}
                                {tab === '職種' && selectedJobTypes.size > 0 && (
                                    <Badge className="ml-1.5 h-5 px-1.5 rounded-full text-xs">
                                        {selectedJobTypes.size}
                                    </Badge>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Filter Content */}
                    <div className="min-h-[100px]">
                        {activeFilterTab === '勤務地' && (
                            <div className="grid grid-cols-5 gap-2">
                                {regionCheckboxOptions.map(region => (
                                    <label
                                        key={region}
                                        className={cn(
                                            'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                            selectedRegions.has(region)
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-muted-foreground/30'
                                        )}
                                    >
                                        <Checkbox
                                            checked={selectedRegions.has(region)}
                                            onCheckedChange={() => toggleRegion(region)}
                                        />
                                        <span className="text-sm">{region}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {activeFilterTab === '職種' && (
                            <div className="grid grid-cols-3 gap-2">
                                {jobTypeCheckboxOptions.map(jobType => (
                                    <label
                                        key={jobType}
                                        className={cn(
                                            'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                            selectedJobTypes.has(jobType)
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-muted-foreground/30'
                                        )}
                                    >
                                        <Checkbox
                                            checked={selectedJobTypes.has(jobType)}
                                            onCheckedChange={() => toggleJobType(jobType)}
                                        />
                                        <span className="text-sm">{jobType}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Clear Filters */}
                    {activeFiltersCount > 0 && (
                        <div className="mt-4 pt-4 border-t flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                    setSelectedRegions(new Set());
                                    setSelectedJobTypes(new Set());
                                    setIndustryFilter('all');
                                    setAreaFilter('all');
                                    setSalaryFilter('all');
                                    setEmployeesFilter('all');
                                    setSourceFilter('all');
                                    setRankFilter('all');
                                    setSortColumn(null);
                                }}
                            >
                                <X className="h-4 w-4 mr-1" />
                                すべてクリア
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            {/* Data Table */}
            <Card className="overflow-hidden rounded-2xl">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b sticky top-0 z-10">
                            <tr>
                                <th className="p-3 w-10 bg-muted/50">
                                    <Checkbox
                                        checked={selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0}
                                        onCheckedChange={toggleAllSelection}
                                    />
                                </th>
                                <th className="p-3 text-left font-medium w-[180px] bg-muted/50">会社名</th>
                                <th className="p-2 text-left font-medium w-[70px] bg-muted/50">
                                    <div className="space-y-1">
                                        <span>ランク</span>
                                        <Select value={rankFilter} onValueChange={setRankFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[60px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                <SelectItem value="A">A (高予算)</SelectItem>
                                                <SelectItem value="B">B (中予算)</SelectItem>
                                                <SelectItem value="C">C (低予算)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-3 text-left font-medium w-[50px] bg-muted/50">詳細</th>
                                <th className="p-3 text-left font-medium w-[110px] bg-muted/50">電話番号</th>
                                <th className="p-3 text-left font-medium w-[60px] bg-muted/50">HP</th>
                                <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-primary transition-colors"
                                            onClick={() => handleSort('industry')}
                                        >
                                            業種{getSortIcon('industry')}
                                        </button>
                                        <Select value={industryFilter} onValueChange={setIndustryFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.industries.slice(0, 20).map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-primary transition-colors"
                                            onClick={() => handleSort('area')}
                                        >
                                            エリア{getSortIcon('area')}
                                        </button>
                                        <Select value={areaFilter} onValueChange={setAreaFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.areas.map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-primary transition-colors"
                                            onClick={() => handleSort('salary')}
                                        >
                                            給与{getSortIcon('salary')}
                                        </button>
                                        <Select value={salaryFilter} onValueChange={setSalaryFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.salaryRanges.map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-primary transition-colors"
                                            onClick={() => handleSort('employees')}
                                        >
                                            規模{getSortIcon('employees')}
                                        </button>
                                        <Select value={employeesFilter} onValueChange={setEmployeesFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.employeeRanges.map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-primary transition-colors"
                                            onClick={() => handleSort('source')}
                                        >
                                            ソース{getSortIcon('source')}
                                        </button>
                                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                            <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.sources.map(opt => (
                                                    <SelectItem key={opt} value={opt}>
                                                        {sourceConfig[opt]?.label || opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-3 text-left font-medium w-[90px]">ステータス</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredCompanies.map((company) => {
                                const formatted = formatCompanyData(company);

                                return (
                                    <tr
                                        key={company.id}
                                        className={cn(
                                            'h-12 transition-colors',
                                            selectedRows.has(company.id)
                                                ? 'bg-primary/5'
                                                : 'hover:bg-muted/50'
                                        )}
                                    >
                                        <td className="p-3">
                                            <Checkbox
                                                checked={selectedRows.has(company.id)}
                                                onCheckedChange={() => toggleRowSelection(company.id)}
                                            />
                                        </td>

                                        <td className="p-3">
                                            <a
                                                href={company.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline truncate max-w-[160px] font-medium block"
                                                title={formatted.fullCompanyName}
                                            >
                                                {formatted.companyName}
                                            </a>
                                        </td>

                                        <td className="p-3 text-center">
                                            {getRankBadge(company.budget_rank)}
                                        </td>

                                        <td className="p-3">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg"
                                                onClick={() => handleViewDetail(company)}
                                                title="詳細"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </td>

                                        <td className="p-3">
                                            {company.phone ? (
                                                <span
                                                    className="text-primary cursor-pointer hover:underline truncate block max-w-[100px] font-mono text-xs"
                                                    onClick={() => navigator.clipboard.writeText(company.phone!)}
                                                    title={`${company.phone} (クリックでコピー)`}
                                                >
                                                    {company.phone}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        <td className="p-3">
                                            {company.homepage_url ? (
                                                <a
                                                    href={company.homepage_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                                    title={company.homepage_url}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                    <span className="text-xs">HP</span>
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        <td className="p-3 w-[100px]">
                                            <span
                                                className="text-muted-foreground truncate block max-w-[90px] text-xs"
                                                title={formatted.fullIndustry}
                                            >
                                                {formatted.industry}
                                            </span>
                                        </td>

                                        <td className="p-3 w-[100px]">
                                            <span className="text-muted-foreground truncate block max-w-[90px] text-xs">
                                                {formatted.area}
                                            </span>
                                        </td>

                                        <td className="p-3 w-[100px]">
                                            <span
                                                className="text-foreground truncate block max-w-[90px] text-xs"
                                                title={formatted.fullSalary}
                                            >
                                                {formatted.salary}
                                            </span>
                                        </td>

                                        <td className="p-3 w-[100px]">
                                            <span
                                                className="text-muted-foreground truncate block max-w-[90px] text-xs"
                                                title={formatted.fullScale}
                                            >
                                                {formatted.scale}
                                            </span>
                                        </td>

                                        <td className="p-3 w-[100px]">
                                            {getSourceBadge(company.source)}
                                        </td>

                                        <td className="p-3">
                                            <Select
                                                value={company.status}
                                                onValueChange={(value) => handleStatusChange(company.id, value)}
                                            >
                                                <SelectTrigger className="h-7 w-20 text-xs rounded-lg border-0 p-0 focus:ring-0">
                                                    {getStatusBadge(company.status)}
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">新規</SelectItem>
                                                    <SelectItem value="promising">見込み</SelectItem>
                                                    <SelectItem value="meeting">商談中</SelectItem>
                                                    <SelectItem value="won">成約</SelectItem>
                                                    <SelectItem value="ng">NG</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {companies.length === 0 ? (
                    <div className="text-center py-16">
                        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">データがありません</p>
                        <p className="text-sm text-muted-foreground mt-1">検索ページからスクレイピングを開始してください</p>
                    </div>
                ) : filteredCompanies.length === 0 ? (
                    <div className="text-center py-16">
                        <Filter className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">条件に一致するデータがありません</p>
                        <p className="text-sm text-muted-foreground mt-1">フィルターを変更してください</p>
                    </div>
                ) : null}
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>削除の確認</DialogTitle>
                        <DialogDescription>
                            選択した {selectedRows.size} 件の企業データを削除しますか？
                            この操作は取り消せません。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isDeleting}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="destructive"
                            className="rounded-xl"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                    削除中...
                                </>
                            ) : (
                                '削除する'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Detail Slide Panel */}
            <div
                className={cn(
                    'fixed left-64 right-0 bottom-0 h-1/2 bg-background border-t border-border shadow-2xl transition-transform duration-300 ease-out z-40',
                    isDetailOpen ? 'translate-y-0' : 'translate-y-full'
                )}
            >
                {/* Panel Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
                    <div>
                        <h3 className="text-lg font-semibold">{detailCompany?.company_name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {detailCompany && getSourceBadge(detailCompany.source)} からスクレイピング
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        onClick={() => setIsDetailOpen(false)}
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Panel Content */}
                {detailCompany && (
                    <div className="overflow-y-auto h-[calc(100%-73px)] p-6">
                        <div className="grid grid-cols-2 gap-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                                {/* 基本情報 */}
                                <section className="p-4 rounded-xl bg-muted/50">
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        基本情報
                                    </h4>
                                    <dl className="grid grid-cols-2 gap-2 text-sm">
                                        <dt className="text-muted-foreground">代表者</dt>
                                        <dd>{detailCompany.representative || '-'}</dd>
                                        <dt className="text-muted-foreground">設立</dt>
                                        <dd>{detailCompany.establishment || '-'}</dd>
                                        <dt className="text-muted-foreground">従業員数</dt>
                                        <dd>{detailCompany.employees || '-'}</dd>
                                        <dt className="text-muted-foreground">売上高</dt>
                                        <dd>{detailCompany.revenue || '-'}</dd>
                                        <dt className="text-muted-foreground">所在地</dt>
                                        <dd>{detailCompany.address || '-'}</dd>
                                    </dl>
                                </section>

                                {/* 事業内容 */}
                                <section className="p-4 rounded-xl bg-muted/50">
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Briefcase className="h-4 w-4" />
                                        事業内容
                                    </h4>
                                    <p className="text-sm whitespace-pre-wrap">{detailCompany.industry || '-'}</p>
                                </section>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                {/* 採用情報 */}
                                <section className="p-4 rounded-xl bg-muted/50">
                                    <h4 className="font-semibold mb-3">採用情報</h4>
                                    <dl className="grid grid-cols-2 gap-2 text-sm">
                                        <dt className="text-muted-foreground">職種</dt>
                                        <dd>{detailCompany.job_title || '-'}</dd>
                                        <dt className="text-muted-foreground">給与</dt>
                                        <dd className="whitespace-pre-wrap">{detailCompany.salary_text || '-'}</dd>
                                    </dl>
                                </section>

                                {/* リンク */}
                                <section className="p-4 rounded-xl bg-muted/50">
                                    <h4 className="font-semibold mb-3">リンク</h4>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl"
                                            onClick={() => window.open(detailCompany.url, '_blank')}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                            求人ページ
                                        </Button>
                                        {detailCompany.homepage_url && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => window.open(detailCompany.homepage_url!, '_blank')}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                                企業HP
                                            </Button>
                                        )}
                                        {detailCompany.contact_form_url && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => window.open(detailCompany.contact_form_url!, '_blank')}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                                問い合わせ
                                            </Button>
                                        )}
                                    </div>
                                </section>

                                {/* メモ */}
                                <section className="p-4 rounded-xl bg-muted/50">
                                    <h4 className="font-semibold mb-3">メモ</h4>
                                    <textarea
                                        className="w-full p-3 border rounded-xl text-sm min-h-[80px] bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                        placeholder="メモを入力..."
                                        defaultValue={detailCompany.note || ''}
                                        onBlur={(e) => updateCompany(detailCompany.id, { note: e.target.value })}
                                    />
                                </section>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
