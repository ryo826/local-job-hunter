import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Building2,
    Filter,
    Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Company, BudgetRank } from '@/types';
import { formatCompanyData } from '@/utils/companyFormatter';
import type { SortColumn, SortDirection } from './constants';
import { rankConfig, sourceConfig, RANK_DEFINITIONS } from './constants';
import { formatJobPageUpdated, formatLastFetched } from './utils';

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

interface CompanyTableProps {
    companies: Company[];
    filteredCompanies: Company[];
    selectedRows: Set<number>;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    columnFilters: ColumnFilterState;
    onToggleRow: (id: number) => void;
    onToggleAll: () => void;
    onSort: (column: SortColumn) => void;
    onColumnFilterChange: (column: keyof ColumnFilterState, value: string) => void;
    onViewDetail: (company: Company) => void;
    onStatusChange: (id: number, status: string) => void;
}

export function CompanyTable({
    companies,
    filteredCompanies,
    selectedRows,
    sortColumn,
    sortDirection,
    columnFilters,
    onToggleRow,
    onToggleAll,
    onSort,
    onColumnFilterChange,
    onViewDetail,
    onStatusChange,
}: CompanyTableProps) {
    // Generate unique filter options from data
    const filterOptions = useMemo(() => {
        const industries = new Set<string>();
        const areas = new Set<string>();
        const sources = new Set<string>();
        const jobTypes = new Set<string>();

        companies.forEach(company => {
            if (company.industry) {
                const shortIndustry = company.industry.substring(0, 20);
                industries.add(shortIndustry);
            }
            if (company.area) areas.add(company.area);
            if (company.source) sources.add(company.source);
            if (company.job_type) jobTypes.add(company.job_type);
        });

        return {
            industries: Array.from(industries).sort(),
            areas: Array.from(areas).sort(),
            sources: Array.from(sources).sort(),
            jobTypes: Array.from(jobTypes).sort(),
            salaryRanges: ['300万未満', '300-500万', '500-700万', '700-1000万', '1000万以上'],
            employeeRanges: ['10人未満', '10-50人', '50-100人', '100-500人', '500人以上'],
            jobPageUpdatedRanges: ['3日以内', '7日以内', '14日以内', '14日以上'],
            lastFetchedRanges: ['今日', '3日以内', '7日以内', '7日以上'],
        };
    }, [companies]);

    const getSortIcon = (column: SortColumn) => {
        if (sortColumn !== column) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
            : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
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

    return (
        <Card className="overflow-hidden rounded-2xl">
            <div className="overflow-auto max-h-[calc(100vh-280px)]">
                <table className="w-full text-sm min-w-[1790px]">
                    <thead className="bg-muted/50 border-b sticky top-0 z-10">
                        <tr>
                            <th className="p-3 w-10 bg-muted/50">
                                <Checkbox
                                    checked={selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0}
                                    onCheckedChange={onToggleAll}
                                />
                            </th>
                            <th className="p-3 text-left font-medium w-[180px] bg-muted/50">会社名</th>
                            <th className="p-2 text-left font-medium w-[70px] bg-muted/50">
                                <div className="space-y-1">
                                    <span>ランク</span>
                                    <Select value={columnFilters.rank} onValueChange={(v) => onColumnFilterChange('rank', v)}>
                                        <SelectTrigger className="h-7 text-xs w-[60px] rounded-lg">
                                            <SelectValue placeholder="全て" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">全て</SelectItem>
                                            <SelectItem value="A">A</SelectItem>
                                            <SelectItem value="B">B</SelectItem>
                                            <SelectItem value="C">C</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </th>
                            <th className="p-3 text-left font-medium w-[50px] bg-muted/50">詳細</th>
                            <th className="p-3 text-left font-medium w-[110px] bg-muted/50">電話番号</th>
                            <th className="p-3 text-left font-medium w-[70px] bg-muted/50">問合せ</th>
                            <th className="p-3 text-left font-medium w-[60px] bg-muted/50">HP</th>
                            <th className="p-2 text-left font-medium w-[120px] bg-muted/50">
                                <div className="space-y-1">
                                    <button
                                        className="flex items-center hover:text-primary transition-colors"
                                        onClick={() => onSort('jobType')}
                                    >
                                        職種{getSortIcon('jobType')}
                                    </button>
                                    <Select value={columnFilters.jobType} onValueChange={(v) => onColumnFilterChange('jobType', v)}>
                                        <SelectTrigger className="h-7 text-xs w-[110px] rounded-lg">
                                            <SelectValue placeholder="全て" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">全て</SelectItem>
                                            {filterOptions.jobTypes.map(opt => (
                                                <SelectItem key={opt} value={opt}>{opt.length > 12 ? opt.substring(0, 12) + '...' : opt}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </th>
                            <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                <div className="space-y-1">
                                    <button
                                        className="flex items-center hover:text-primary transition-colors"
                                        onClick={() => onSort('industry')}
                                    >
                                        業種{getSortIcon('industry')}
                                    </button>
                                    <Select value={columnFilters.industry} onValueChange={(v) => onColumnFilterChange('industry', v)}>
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
                                        onClick={() => onSort('area')}
                                    >
                                        エリア{getSortIcon('area')}
                                    </button>
                                    <Select value={columnFilters.area} onValueChange={(v) => onColumnFilterChange('area', v)}>
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
                                        onClick={() => onSort('salary')}
                                    >
                                        給与{getSortIcon('salary')}
                                    </button>
                                    <Select value={columnFilters.salary} onValueChange={(v) => onColumnFilterChange('salary', v)}>
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
                                        onClick={() => onSort('employees')}
                                    >
                                        規模{getSortIcon('employees')}
                                    </button>
                                    <Select value={columnFilters.employees} onValueChange={(v) => onColumnFilterChange('employees', v)}>
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
                                        onClick={() => onSort('source')}
                                    >
                                        ソース{getSortIcon('source')}
                                    </button>
                                    <Select value={columnFilters.source} onValueChange={(v) => onColumnFilterChange('source', v)}>
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
                            <th className="p-2 text-left font-medium w-[100px] bg-muted/50">
                                <div className="space-y-1">
                                    <button
                                        className="flex items-center hover:text-primary transition-colors"
                                        onClick={() => onSort('jobPageUpdated')}
                                        title="求人サイト上での情報更新日"
                                    >
                                        求人更新{getSortIcon('jobPageUpdated')}
                                    </button>
                                    <Select value={columnFilters.jobPageUpdated} onValueChange={(v) => onColumnFilterChange('jobPageUpdated', v)}>
                                        <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                            <SelectValue placeholder="全て" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">全て</SelectItem>
                                            {filterOptions.jobPageUpdatedRanges.map(opt => (
                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </th>
                            <th className="p-2 text-left font-medium w-[90px] bg-muted/50">
                                <div className="space-y-1">
                                    <button
                                        className="flex items-center hover:text-primary transition-colors"
                                        onClick={() => onSort('lastFetched')}
                                        title="このシステムが情報を取得した日時"
                                    >
                                        取得日{getSortIcon('lastFetched')}
                                    </button>
                                    <Select value={columnFilters.lastFetched} onValueChange={(v) => onColumnFilterChange('lastFetched', v)}>
                                        <SelectTrigger className="h-7 text-xs w-[80px] rounded-lg">
                                            <SelectValue placeholder="全て" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">全て</SelectItem>
                                            {filterOptions.lastFetchedRanges.map(opt => (
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
                                        onClick={() => onSort('status')}
                                    >
                                        ステータス{getSortIcon('status')}
                                    </button>
                                    <Select value={columnFilters.status} onValueChange={(v) => onColumnFilterChange('status', v)}>
                                        <SelectTrigger className="h-7 text-xs w-[90px] rounded-lg">
                                            <SelectValue placeholder="全て" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">全て</SelectItem>
                                            <SelectItem value="new">新規</SelectItem>
                                            <SelectItem value="promising">見込み</SelectItem>
                                            <SelectItem value="meeting">商談中</SelectItem>
                                            <SelectItem value="won">成約</SelectItem>
                                            <SelectItem value="ng">NG</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </th>
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
                                            onCheckedChange={() => onToggleRow(company.id)}
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
                                            onClick={() => onViewDetail(company)}
                                            title="詳細"
                                            data-detail-trigger
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
                                        {company.contact_form_url ? (
                                            <a
                                                href={company.contact_form_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline"
                                                title={company.contact_form_url}
                                            >
                                                <Mail className="h-3.5 w-3.5" />
                                                <span className="text-xs">Form</span>
                                            </a>
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

                                    <td className="p-3 w-[120px]">
                                        <span
                                            className="text-muted-foreground truncate block max-w-[110px] text-xs"
                                            title={company.job_type || ''}
                                        >
                                            {company.job_type ? (company.job_type.length > 10 ? company.job_type.substring(0, 10) + '...' : company.job_type) : '-'}
                                        </span>
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

                                    <td className="p-3 w-[100px]">
                                        {(() => {
                                            const jobPageUpdated = formatJobPageUpdated(company.job_page_updated_at);
                                            return (
                                                <div className="flex flex-col">
                                                    <span
                                                        className={cn('text-xs font-medium', jobPageUpdated.className)}
                                                        title={company.job_page_updated_at || ''}
                                                    >
                                                        {jobPageUpdated.text}
                                                    </span>
                                                    {company.job_page_end_date && (
                                                        <span className="text-xs text-muted-foreground" title="掲載終了予定日">
                                                            終了: {new Date(company.job_page_end_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>

                                    <td className="p-3 w-[90px]">
                                        {(() => {
                                            const lastFetched = formatLastFetched(company.last_updated_at || company.created_at);
                                            return (
                                                <span
                                                    className={cn('text-xs font-medium', lastFetched.className)}
                                                    title={company.last_updated_at || company.created_at || ''}
                                                >
                                                    {lastFetched.text}
                                                </span>
                                            );
                                        })()}
                                    </td>

                                    <td className="p-3">
                                        <Select
                                            value={company.status}
                                            onValueChange={(value) => onStatusChange(company.id, value)}
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
    );
}
