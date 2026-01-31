import { useState, useEffect } from 'react';
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
import { ExternalLink, Eye, Phone, Loader2, Download } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { Company } from '@/types';
import { formatCompanyData } from '@/utils/companyFormatter';

export function ListPage() {
    const { companies, filters, setFilters, fetchCompanies, updateCompany } = useAppStore();

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [detailCompany, setDetailCompany] = useState<Company | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Phone enrichment state
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; companyName: string } | null>(null);
    const [enrichStats, setEnrichStats] = useState<{ withPhone: number; withoutPhone: number } | null>(null);

    // Filters
    const [areaFilter, setAreaFilter] = useState(filters.area || 'all');
    const [jobTitleFilter, setJobTitleFilter] = useState(filters.jobTitle || 'all');
    const [availableAreas, setAvailableAreas] = useState<string[]>([]);
    const [availableJobTitles, setAvailableJobTitles] = useState<string[]>([]);

    useEffect(() => {
        fetchCompanies();
        loadEnrichStats();
    }, []);

    // Load phone enrichment stats
    const loadEnrichStats = async () => {
        const stats = await window.electronAPI.enrich.getStats();
        setEnrichStats({ withPhone: stats.withPhone, withoutPhone: stats.withoutPhone });

        // Load filter options
        const areas = await window.electronAPI.db.getDistinctAreas();
        setAvailableAreas(areas);
        const titles = await window.electronAPI.db.getDistinctJobTitles();
        setAvailableJobTitles(titles);
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

    const handleExportCsv = async () => {
        const targetIds = selectedRows.size > 0 ? Array.from(selectedRows) : undefined;
        // If no rows selected, export all matching current filters
        const exportFilters = targetIds ? undefined : filters;

        const result = await window.electronAPI.export.csv(targetIds, exportFilters);
        if (result.success) {
            alert(result.message || 'CSVエクスポートが完了しました');
        } else {
            alert(`エラー: ${result.error}`);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters({
                search: searchQuery || undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                area: areaFilter !== 'all' ? areaFilter : undefined,
                jobTitle: jobTitleFilter !== 'all' ? jobTitleFilter : undefined,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter, areaFilter, jobTitleFilter]);

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
        if (selectedRows.size === companies.length && companies.length > 0) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(companies.map((c) => c.id)));
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
                        全 {companies.length} 件
                        {enrichStats && (
                            <span className="ml-2">
                                (電話あり: {enrichStats.withPhone} / なし: {enrichStats.withoutPhone})
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex gap-2">
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
                    <Button variant="outline" size="sm" onClick={handleExportCsv}>
                        <Download className="h-4 w-4 mr-1" />
                        CSV出力
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <Input
                    className="flex-1 h-8 text-sm"
                    placeholder="検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 h-8 text-sm">
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
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="w-32 h-8 text-sm">
                        <SelectValue placeholder="エリア" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全エリア</SelectItem>
                        {availableAreas.map(area => (
                            <SelectItem key={area} value={area}>{area}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={jobTitleFilter} onValueChange={setJobTitleFilter}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                        <SelectValue placeholder="職種" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全職種</SelectItem>
                        {availableJobTitles.map(title => (
                            <SelectItem key={title} value={title}>{title.substring(0, 20)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Compact Table */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="p-2 w-8">
                                    <Checkbox
                                        checked={selectedRows.size === companies.length && companies.length > 0}
                                        onCheckedChange={toggleAllSelection}
                                    />
                                </th>
                                <th className="p-2 text-left font-medium w-[160px]">会社名</th>
                                <th className="p-2 text-left font-medium w-[40px]">詳細</th>
                                <th className="p-2 text-left font-medium w-[40px]">HP</th>
                                <th className="p-2 text-left font-medium w-[100px]">電話番号</th>
                                <th className="p-2 text-left font-medium w-[100px]">業種</th>
                                <th className="p-2 text-left font-medium w-[60px]">エリア</th>
                                <th className="p-2 text-left font-medium w-[90px]">給与</th>
                                <th className="p-2 text-left font-medium w-[70px]">規模</th>
                                <th className="p-2 text-left font-medium w-[50px]">ソース</th>
                                <th className="p-2 text-left font-medium w-[70px]">ステータス</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {companies.map((company) => {
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

                                        {/* HPリンク */}
                                        <td className="p-2">
                                            {company.homepage_url ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => window.open(company.homepage_url!, '_blank')}
                                                    title="企業HP"
                                                >
                                                    <ExternalLink className="h-3 w-3 text-blue-500" />
                                                </Button>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
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

                {companies.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        データがありません。検索ページからスクレイピングを開始してください。
                    </div>
                )}
            </Card>

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
