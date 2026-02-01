import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ExternalLink, Eye, Phone, Loader2, Download, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { Company } from '@/types';
import { formatCompanyData } from '@/utils/companyFormatter';

// Sort types
type SortColumn = 'industry' | 'area' | 'salary' | 'employees' | 'source' | null;
type SortDirection = 'asc' | 'desc';

// Filter tab options
type FilterTab = '勤務地' | '職種' | 'こだわり条件' | '雇用形態' | '年収';

// Region checkbox options
const regionCheckboxOptions = [
    '北海道', '東北', '関東', '甲信越', '北陸',
    '東海', '関西', '中国', '四国', '九州・沖縄'
];

// Job type checkbox options (based on screenshot)
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
    const [isFilterExpanded, setIsFilterExpanded] = useState(true);

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
                // 業種は最初の20文字程度で区切る
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

    // Filter companies by region, job type, and column filters (client-side filtering)
    const filteredCompanies = useMemo(() => {
        let result = companies.filter(company => {
            // Region filter (if any regions selected)
            if (selectedRegions.size > 0) {
                const companyRegion = company.area ? prefectureToRegion[company.area] : null;
                if (!companyRegion || !selectedRegions.has(companyRegion)) {
                    return false;
                }
            }

            // Job type filter (if any job types selected)
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
    }, [companies, selectedRegions, selectedJobTypes, industryFilter, areaFilter, salaryFilter, employeesFilter, sourceFilter, sortColumn, sortDirection]);

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
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" />
            : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
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
        const sourceMap: Record<string, { label: string; className: string }> = {
            mynavi: { label: 'マイナビ', className: 'bg-blue-600 text-white' },
            rikunabi: { label: 'リクナビ', className: 'bg-green-600 text-white' },
            doda: { label: 'doda', className: 'bg-orange-500 text-white' },
        };
        const config = sourceMap[source] || { label: source, className: 'bg-gray-500 text-white' };
        return <span className={`px-1.5 py-0.5 rounded text-[10px] ${config.className}`}>{config.label}</span>;
    };

    const getStatusColor = (status: string) => {
        const colorMap: Record<string, string> = {
            new: 'bg-gray-500',
            unreachable: 'bg-yellow-500',
            promising: 'bg-blue-500',
            keyman: 'bg-purple-500',
            meeting: 'bg-indigo-500',
            won: 'bg-green-500',
            lost: 'bg-red-500',
            ng: 'bg-red-700',
        };
        return colorMap[status] || 'bg-gray-500';
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

    return (
        <div className="space-y-4 p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">企業リスト</h1>
                    <p className="text-sm text-muted-foreground">
                        {filteredCompanies.length} 件表示 / 全 {companies.length} 件
                        {enrichStats && (
                            <span className="ml-2">
                                (電話あり: {enrichStats.withPhone} / なし: {enrichStats.withoutPhone})
                            </span>
                        )}
                        {selectedRows.size > 0 && (
                            <span className="ml-2 text-blue-600">
                                ({selectedRows.size} 件選択中)
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex gap-2">
                    {/* Delete Button - only show when items selected */}
                    {selectedRows.size > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            削除 ({selectedRows.size})
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={isExporting || companies.length === 0}
                    >
                        {isExporting ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-1" />
                        )}
                        {selectedRows.size > 0 ? `選択をエクスポート (${selectedRows.size})` : 'CSVエクスポート'}
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handlePhoneLookup}
                        disabled={isEnriching || (enrichStats?.withoutPhone === 0)}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isEnriching ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                {enrichProgress ? `${enrichProgress.current}/${enrichProgress.total}` : '準備中...'}
                            </>
                        ) : (
                            <>
                                <Phone className="h-4 w-4 mr-1" />
                                電話番号取得
                            </>
                        )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fetchCompanies()}>
                        更新
                    </Button>
                </div>
            </div>

            {/* Basic Search and Status Filter */}
            <div className="flex flex-wrap gap-2">
                <Input
                    className="flex-1 min-w-[200px] h-8 text-sm"
                    placeholder="会社名・住所・メモで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-28 h-8 text-sm">
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
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                >
                    詳細フィルター
                    {isFilterExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                </Button>
            </div>

            {/* Expandable Filter Section with Tabs */}
            {isFilterExpanded && (
                <Card className="p-4">
                    {/* Filter Tabs */}
                    <div className="flex gap-1 mb-4 border-b">
                        {(['勤務地', '職種'] as FilterTab[]).map(tab => (
                            <button
                                key={tab}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${
                                    activeFilterTab === tab
                                        ? 'border-b-2 border-blue-500 text-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                                onClick={() => setActiveFilterTab(tab)}
                            >
                                {tab}
                                {tab === '勤務地' && selectedRegions.size > 0 && (
                                    <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                                        {selectedRegions.size}
                                    </span>
                                )}
                                {tab === '職種' && selectedJobTypes.size > 0 && (
                                    <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                                        {selectedJobTypes.size}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Filter Content */}
                    <div className="min-h-[100px]">
                        {/* 勤務地 Tab */}
                        {activeFilterTab === '勤務地' && (
                            <div className="grid grid-cols-5 gap-3">
                                {regionCheckboxOptions.map(region => (
                                    <label
                                        key={region}
                                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
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

                        {/* 職種 Tab */}
                        {activeFilterTab === '職種' && (
                            <div className="grid grid-cols-3 gap-3">
                                {jobTypeCheckboxOptions.map(jobType => (
                                    <label
                                        key={jobType}
                                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
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

                    {/* Clear Filters Button */}
                    {(selectedRegions.size > 0 || selectedJobTypes.size > 0) && (
                        <div className="mt-4 pt-3 border-t flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSelectedRegions(new Set());
                                    setSelectedJobTypes(new Set());
                                }}
                            >
                                フィルターをクリア
                            </Button>
                        </div>
                    )}

                    {/* Active Column Filters Display */}
                    {(industryFilter !== 'all' || areaFilter !== 'all' || salaryFilter !== 'all' || employeesFilter !== 'all' || sourceFilter !== 'all' || sortColumn) && (
                        <div className="mt-4 pt-3 border-t flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-muted-foreground">適用中:</span>
                            {industryFilter !== 'all' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">業種: {industryFilter}</span>
                            )}
                            {areaFilter !== 'all' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">エリア: {areaFilter}</span>
                            )}
                            {salaryFilter !== 'all' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">給与: {salaryFilter}</span>
                            )}
                            {employeesFilter !== 'all' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">規模: {employeesFilter}</span>
                            )}
                            {sourceFilter !== 'all' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">ソース: {sourceFilter}</span>
                            )}
                            {sortColumn && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                    並び替え: {sortColumn === 'industry' ? '業種' : sortColumn === 'area' ? 'エリア' : sortColumn === 'salary' ? '給与' : sortColumn === 'employees' ? '規模' : 'ソース'}
                                    ({sortDirection === 'asc' ? '昇順' : '降順'})
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => {
                                    setIndustryFilter('all');
                                    setAreaFilter('all');
                                    setSalaryFilter('all');
                                    setEmployeesFilter('all');
                                    setSourceFilter('all');
                                    setSortColumn(null);
                                    setSortDirection('asc');
                                }}
                            >
                                すべてクリア
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            {/* Compact Table */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="p-2 w-8">
                                    <Checkbox
                                        checked={selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0}
                                        onCheckedChange={toggleAllSelection}
                                    />
                                </th>
                                <th className="p-2 text-left font-medium w-[160px]">会社名</th>
                                <th className="p-2 text-left font-medium w-[40px]">詳細</th>
                                <th className="p-2 text-left font-medium w-[100px]">電話番号</th>
                                <th className="p-2 text-left font-medium w-[80px]">会社HP</th>
                                <th className="p-1 text-left font-medium w-[120px]">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-blue-600"
                                            onClick={() => handleSort('industry')}
                                        >
                                            業種{getSortIcon('industry')}
                                        </button>
                                        <Select value={industryFilter} onValueChange={setIndustryFilter}>
                                            <SelectTrigger className="h-6 text-[10px] w-full">
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
                                <th className="p-1 text-left font-medium w-[80px]">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-blue-600"
                                            onClick={() => handleSort('area')}
                                        >
                                            エリア{getSortIcon('area')}
                                        </button>
                                        <Select value={areaFilter} onValueChange={setAreaFilter}>
                                            <SelectTrigger className="h-6 text-[10px] w-full">
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
                                <th className="p-1 text-left font-medium w-[100px]">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-blue-600"
                                            onClick={() => handleSort('salary')}
                                        >
                                            給与{getSortIcon('salary')}
                                        </button>
                                        <Select value={salaryFilter} onValueChange={setSalaryFilter}>
                                            <SelectTrigger className="h-6 text-[10px] w-full">
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
                                <th className="p-1 text-left font-medium w-[90px]">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-blue-600"
                                            onClick={() => handleSort('employees')}
                                        >
                                            規模{getSortIcon('employees')}
                                        </button>
                                        <Select value={employeesFilter} onValueChange={setEmployeesFilter}>
                                            <SelectTrigger className="h-6 text-[10px] w-full">
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
                                <th className="p-1 text-left font-medium w-[70px]">
                                    <div className="space-y-1">
                                        <button
                                            className="flex items-center hover:text-blue-600"
                                            onClick={() => handleSort('source')}
                                        >
                                            ソース{getSortIcon('source')}
                                        </button>
                                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                            <SelectTrigger className="h-6 text-[10px] w-full">
                                                <SelectValue placeholder="全て" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">全て</SelectItem>
                                                {filterOptions.sources.map(opt => (
                                                    <SelectItem key={opt} value={opt}>
                                                        {opt === 'mynavi' ? 'マイナビ' : opt === 'rikunabi' ? 'リクナビ' : opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </th>
                                <th className="p-2 text-left font-medium w-[70px]">ステータス</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredCompanies.map((company) => {
                                const formatted = formatCompanyData(company);

                                return (
                                    <tr
                                        key={company.id}
                                        className="hover:bg-muted/30 h-9"
                                    >
                                        {/* Checkbox */}
                                        <td className="p-2">
                                            <Checkbox
                                                checked={selectedRows.has(company.id)}
                                                onCheckedChange={() => toggleRowSelection(company.id)}
                                            />
                                        </td>

                                        {/* 会社名 */}
                                        <td className="p-2">
                                            <a
                                                href={company.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 truncate max-w-[140px] font-medium block"
                                                title={formatted.fullCompanyName}
                                            >
                                                {formatted.companyName}
                                            </a>
                                        </td>

                                        {/* 詳細ボタン */}
                                        <td className="p-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={() => handleViewDetail(company)}
                                                title="詳細"
                                            >
                                                <Eye className="h-3 w-3" />
                                            </Button>
                                        </td>

                                        {/* 電話番号 */}
                                        <td className="p-2">
                                            {company.phone ? (
                                                <span
                                                    className="text-blue-600 cursor-pointer hover:underline truncate block max-w-[90px]"
                                                    onClick={() => navigator.clipboard.writeText(company.phone!)}
                                                    title={`${company.phone} (クリックでコピー)`}
                                                >
                                                    {company.phone}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        {/* 会社HP */}
                                        <td className="p-2">
                                            {company.homepage_url ? (
                                                <a
                                                    href={company.homepage_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                    title={company.homepage_url}
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    <span className="text-xs">HP</span>
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        {/* 業種 */}
                                        <td className="p-2">
                                            <span
                                                className="text-muted-foreground truncate block max-w-[90px]"
                                                title={formatted.fullIndustry}
                                            >
                                                {formatted.industry}
                                            </span>
                                        </td>

                                        {/* エリア */}
                                        <td className="p-2">
                                            <span className="text-muted-foreground truncate block max-w-[50px]">
                                                {formatted.area}
                                            </span>
                                        </td>

                                        {/* 給与 */}
                                        <td className="p-2">
                                            <span
                                                className="text-green-600 dark:text-green-400 truncate block max-w-[80px]"
                                                title={formatted.fullSalary}
                                            >
                                                {formatted.salary}
                                            </span>
                                        </td>

                                        {/* 規模 */}
                                        <td className="p-2">
                                            <span
                                                className="text-muted-foreground truncate block max-w-[60px]"
                                                title={formatted.fullScale}
                                            >
                                                {formatted.scale}
                                            </span>
                                        </td>

                                        {/* ソース */}
                                        <td className="p-2">
                                            {getSourceBadge(company.source)}
                                        </td>

                                        {/* ステータス */}
                                        <td className="p-2">
                                            <Select
                                                value={company.status}
                                                onValueChange={(value) => handleStatusChange(company.id, value)}
                                            >
                                                <SelectTrigger className={`h-6 w-16 text-[10px] text-white border-0 ${getStatusColor(company.status)}`}>
                                                    <SelectValue />
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
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        データがありません。検索ページからスクレイピングを開始してください。
                    </div>
                ) : filteredCompanies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        条件に一致するデータがありません。フィルターを変更してください。
                    </div>
                ) : null}
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>削除の確認</DialogTitle>
                        <DialogDescription>
                            選択した {selectedRows.size} 件の企業データを削除しますか？
                            この操作は取り消せません。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isDeleting}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    削除中...
                                </>
                            ) : (
                                '削除する'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Detail Modal */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{detailCompany?.company_name}</DialogTitle>
                        <DialogDescription>
                            {detailCompany && getSourceBadge(detailCompany.source)} からスクレイピング
                        </DialogDescription>
                    </DialogHeader>

                    {detailCompany && (
                        <div className="space-y-4 pt-4 text-sm">
                            {/* 基本情報 */}
                            <section>
                                <h4 className="font-semibold mb-2 border-b pb-1">基本情報</h4>
                                <dl className="grid grid-cols-2 gap-2">
                                    <dt className="text-muted-foreground">代表者</dt>
                                    <dd>{detailCompany.representative || '-'}</dd>
                                    <dt className="text-muted-foreground">設立</dt>
                                    <dd>{detailCompany.establishment || '-'}</dd>
                                    <dt className="text-muted-foreground">従業員数</dt>
                                    <dd>{detailCompany.employees || '-'}</dd>
                                    <dt className="text-muted-foreground">売上高</dt>
                                    <dd>{detailCompany.revenue || '-'}</dd>
                                    <dt className="text-muted-foreground">所在地</dt>
                                    <dd className="col-span-1">{detailCompany.address || '-'}</dd>
                                </dl>
                            </section>

                            {/* 事業内容 */}
                            <section>
                                <h4 className="font-semibold mb-2 border-b pb-1">事業内容</h4>
                                <p className="whitespace-pre-wrap">{detailCompany.industry || '-'}</p>
                            </section>

                            {/* 採用情報 */}
                            <section>
                                <h4 className="font-semibold mb-2 border-b pb-1">採用情報</h4>
                                <dl className="grid grid-cols-2 gap-2">
                                    <dt className="text-muted-foreground">職種</dt>
                                    <dd>{detailCompany.job_title || '-'}</dd>
                                    <dt className="text-muted-foreground">給与</dt>
                                    <dd className="whitespace-pre-wrap">{detailCompany.salary_text || '-'}</dd>
                                </dl>
                            </section>

                            {/* リンク */}
                            <section>
                                <h4 className="font-semibold mb-2 border-b pb-1">リンク</h4>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => window.open(detailCompany.url, '_blank')}>
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        求人ページ
                                    </Button>
                                    {detailCompany.homepage_url && (
                                        <Button variant="outline" size="sm" onClick={() => window.open(detailCompany.homepage_url!, '_blank')}>
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            企業HP
                                        </Button>
                                    )}
                                    {detailCompany.contact_form_url && (
                                        <Button variant="outline" size="sm" onClick={() => window.open(detailCompany.contact_form_url!, '_blank')}>
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            問い合わせ
                                        </Button>
                                    )}
                                </div>
                            </section>

                            {/* メモ */}
                            <section>
                                <h4 className="font-semibold mb-2 border-b pb-1">メモ</h4>
                                <textarea
                                    className="w-full p-2 border rounded text-sm min-h-[80px]"
                                    placeholder="メモを入力..."
                                    defaultValue={detailCompany.note || ''}
                                    onBlur={(e) => updateCompany(detailCompany.id, { note: e.target.value })}
                                />
                            </section>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
