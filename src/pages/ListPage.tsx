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

// Region options for filtering
const regionOptions = [
    { value: 'all', label: 'すべて' },
    { value: '北海道', label: '北海道' },
    { value: '東北', label: '東北' },
    { value: '関東', label: '関東' },
    { value: '甲信越', label: '甲信越' },
    { value: '東海', label: '東海' },
    { value: '関西', label: '関西' },
    { value: '中国・四国', label: '中国・四国' },
    { value: '九州・沖縄', label: '九州・沖縄' },
];

// Job type options for filtering
const jobTypeOptions = [
    { value: 'all', label: 'すべて' },
    { value: '営業・販売', label: '営業・販売' },
    { value: 'IT・Web', label: 'IT・Web' },
    { value: '製造・工場', label: '製造・工場' },
    { value: '医療・介護', label: '医療・介護' },
    { value: '事務・管理', label: '事務・管理' },
    { value: '建築・土木', label: '建築・土木' },
    { value: '飲食・サービス', label: '飲食・サービス' },
    { value: '教育・保育', label: '教育・保育' },
    { value: 'その他', label: 'その他' },
];

// Map prefectures to regions
const prefectureToRegion: Record<string, string> = {
    '北海道': '北海道',
    '青森県': '東北', '岩手県': '東北', '宮城県': '東北', '秋田県': '東北', '山形県': '東北', '福島県': '東北',
    '茨城県': '関東', '栃木県': '関東', '群馬県': '関東', '埼玉県': '関東', '千葉県': '関東', '東京都': '関東', '神奈川県': '関東',
    '新潟県': '甲信越', '山梨県': '甲信越', '長野県': '甲信越',
    '富山県': '東海', '石川県': '東海', '福井県': '東海', '岐阜県': '東海', '静岡県': '東海', '愛知県': '東海', '三重県': '東海',
    '滋賀県': '関西', '京都府': '関西', '大阪府': '関西', '兵庫県': '関西', '奈良県': '関西', '和歌山県': '関西',
    '鳥取県': '中国・四国', '島根県': '中国・四国', '岡山県': '中国・四国', '広島県': '中国・四国', '山口県': '中国・四国',
    '徳島県': '中国・四国', '香川県': '中国・四国', '愛媛県': '中国・四国', '高知県': '中国・四国',
    '福岡県': '九州・沖縄', '佐賀県': '九州・沖縄', '長崎県': '九州・沖縄', '熊本県': '九州・沖縄',
    '大分県': '九州・沖縄', '宮崎県': '九州・沖縄', '鹿児島県': '九州・沖縄', '沖縄県': '九州・沖縄',
};

export function ListPage() {
    const { companies, filters, setFilters, fetchCompanies, updateCompany } = useAppStore();

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [regionFilter, setRegionFilter] = useState('all');
    const [jobTypeFilter, setJobTypeFilter] = useState('all');
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [detailCompany, setDetailCompany] = useState<Company | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Phone enrichment state
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; companyName: string } | null>(null);
    const [enrichStats, setEnrichStats] = useState<{ withPhone: number; withoutPhone: number } | null>(null);

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

    // Filter companies by region and job type (client-side filtering)
    const filteredCompanies = companies.filter(company => {
        // Region filter
        if (regionFilter !== 'all') {
            const companyRegion = company.area ? prefectureToRegion[company.area] : null;
            if (companyRegion !== regionFilter) {
                return false;
            }
        }

        // Job type filter (simple keyword matching in job_title)
        if (jobTypeFilter !== 'all') {
            const jobTitle = company.job_title?.toLowerCase() || '';
            const industry = company.industry?.toLowerCase() || '';
            const searchText = jobTitle + ' ' + industry;

            const jobTypeKeywords: Record<string, string[]> = {
                '営業・販売': ['営業', '販売', 'セールス', 'sales'],
                'IT・Web': ['it', 'web', 'エンジニア', 'プログラマ', 'システム', '開発'],
                '製造・工場': ['製造', '工場', '生産', 'ライン', '組立'],
                '医療・介護': ['医療', '介護', '看護', '福祉', 'ヘルパー', '病院'],
                '事務・管理': ['事務', '管理', '経理', '総務', '人事', 'オフィス'],
                '建築・土木': ['建築', '土木', '施工', '現場', '設計'],
                '飲食・サービス': ['飲食', 'レストラン', 'ホテル', '接客', 'サービス'],
                '教育・保育': ['教育', '保育', '講師', '先生', '塾'],
            };

            const keywords = jobTypeKeywords[jobTypeFilter];
            if (keywords) {
                const matches = keywords.some(kw => searchText.includes(kw));
                if (!matches) return false;
            } else if (jobTypeFilter === 'その他') {
                // その他: 他のカテゴリに該当しない
                const allKeywords = Object.values(jobTypeKeywords).flat();
                const matchesAny = allKeywords.some(kw => searchText.includes(kw));
                if (matchesAny) return false;
            }
        }

        return true;
    });

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

            {/* Filters */}
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
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                    <SelectTrigger className="w-32 h-8 text-sm">
                        <SelectValue placeholder="勤務地" />
                    </SelectTrigger>
                    <SelectContent>
                        {regionOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                    <SelectTrigger className="w-32 h-8 text-sm">
                        <SelectValue placeholder="職種" />
                    </SelectTrigger>
                    <SelectContent>
                        {jobTypeOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
                                        checked={selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0}
                                        onCheckedChange={toggleAllSelection}
                                    />
                                </th>
                                <th className="p-2 text-left font-medium w-[160px]">会社名</th>
                                <th className="p-2 text-left font-medium w-[40px]">詳細</th>
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
