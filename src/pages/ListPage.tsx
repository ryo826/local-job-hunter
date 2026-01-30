import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ExternalLink, Sparkles, Eye, Phone, Mail, FileText, Building2, Users, DollarSign, Calendar } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { ngWords } from '@/config/settings';
import type { Company } from '@/types';

export function ListPage() {
    const { companies, filters, setFilters, fetchCompanies, updateCompany } = useAppStore();

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [detailCompany, setDetailCompany] = useState<Company | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        fetchCompanies();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters({
                search: searchQuery || undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter]);

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

    const isNgCandidate = (companyName: string) => {
        return ngWords.some((word) => companyName.toLowerCase().includes(word.toLowerCase()));
    };

    const getSourceBadge = (source: string) => {
        const sourceMap: Record<string, { label: string; color: string }> = {
            mynavi: { label: 'マイナビ', color: 'bg-blue-100 text-blue-900' },
            rikunabi: { label: 'リクナビ', color: 'bg-green-100 text-green-900' },
            doda: { label: 'doda', color: 'bg-orange-100 text-orange-900' },
            green: { label: 'Green', color: 'bg-emerald-100 text-emerald-900' },
        };
        const config = sourceMap[source] || { label: source, color: 'bg-gray-100 text-gray-900' };
        return <Badge className={`${config.color} border-0`}>{config.label}</Badge>;
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

    const handleAnalyze = async () => {
        if (!detailCompany) return;
        setIsAnalyzing(true);
        try {
            const result = await window.electronAPI.ai.analyze(detailCompany.id);
            if (result.success && result.data) {
                setDetailCompany({
                    ...detailCompany,
                    ai_summary: result.data.summary,
                    ai_tags: JSON.stringify(result.data.tags),
                });
                fetchCompanies();
            }
        } catch (error) {
            console.error('AI analysis failed:', error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleMemoChange = async (id: number, memo: string) => {
        await updateCompany(id, { note: memo });
    };

    const parseTags = (tags: string | null): string[] => {
        if (!tags) return [];
        try {
            return JSON.parse(tags);
        } catch {
            return [];
        }
    };

    const extractDomain = (url: string | null): string => {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url;
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">企業リスト</h1>
                <p className="mt-2 text-muted-foreground">全ての企業を管理・検索</p>
            </div>

            {/* Toolbar */}
            <Card className="p-4">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="text-sm font-semibold">全 {companies.length} 件</div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40">
                            <SelectValue placeholder="ステータス" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">すべて</SelectItem>
                            <SelectItem value="new">新規</SelectItem>
                            <SelectItem value="unreachable">不通</SelectItem>
                            <SelectItem value="promising">見込み</SelectItem>
                            <SelectItem value="keyman">キーマン到達</SelectItem>
                            <SelectItem value="meeting">商談中</SelectItem>
                            <SelectItem value="won">成約</SelectItem>
                            <SelectItem value="lost">却下</SelectItem>
                            <SelectItem value="ng">NG</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button variant="outline" size="sm" onClick={() => fetchCompanies()}>
                            更新
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Search */}
            <Input
                placeholder="企業名・住所・AIタグで検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Table */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <Checkbox
                                        checked={selectedRows.size === companies.length && companies.length > 0}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedRows(new Set(companies.map((c) => c.id)));
                                            } else {
                                                setSelectedRows(new Set());
                                            }
                                        }}
                                    />
                                </TableHead>
                                <TableHead className="w-16">Status</TableHead>
                                <TableHead className="min-w-48">Company</TableHead>
                                <TableHead className="w-32">HP</TableHead>
                                <TableHead className="w-24">Industry</TableHead>
                                <TableHead className="w-24">Area</TableHead>
                                <TableHead className="min-w-40">採用情報</TableHead>
                                <TableHead className="w-24">AI Insight</TableHead>
                                <TableHead className="w-24">Contact</TableHead>
                                <TableHead className="min-w-36">Scale</TableHead>
                                <TableHead className="min-w-48">Memo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companies.map((company) => (
                                <TableRow
                                    key={company.id}
                                    className={isNgCandidate(company.company_name) ? 'border-l-4 border-l-red-500 bg-red-50' : ''}
                                >
                                    {/* Checkbox */}
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedRows.has(company.id)}
                                            onCheckedChange={() => toggleRowSelection(company.id)}
                                        />
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell>
                                        <Select
                                            value={company.status}
                                            onValueChange={(value) => handleStatusChange(company.id, value)}
                                        >
                                            <SelectTrigger className="w-24 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">新規</SelectItem>
                                                <SelectItem value="unreachable">不通</SelectItem>
                                                <SelectItem value="promising">見込み</SelectItem>
                                                <SelectItem value="keyman">キーマン到達</SelectItem>
                                                <SelectItem value="meeting">商談中</SelectItem>
                                                <SelectItem value="won">成約</SelectItem>
                                                <SelectItem value="lost">却下</SelectItem>
                                                <SelectItem value="ng">NG</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

                                    {/* Company */}
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-sm">{company.company_name}</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => handleViewDetail(company)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {company.representative && (
                                                <p className="text-xs text-muted-foreground">代表: {company.representative}</p>
                                            )}
                                            <div className="flex items-center gap-1">
                                                {getSourceBadge(company.source)}
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* HP */}
                                    <TableCell>
                                        {company.homepage_url ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-auto p-1 text-xs"
                                                onClick={() => window.open(company.homepage_url!, '_blank')}
                                            >
                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                {extractDomain(company.homepage_url)}
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                    </TableCell>

                                    {/* Industry */}
                                    <TableCell>
                                        <p className="text-xs">{company.industry || '-'}</p>
                                    </TableCell>

                                    {/* Area */}
                                    <TableCell>
                                        <p className="text-xs">{company.area || '-'}</p>
                                    </TableCell>

                                    {/* 採用情報 */}
                                    <TableCell>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold">{company.job_title || '-'}</p>
                                            {company.salary_text && (
                                                <p className="text-xs text-muted-foreground">{company.salary_text}</p>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* AI Insight */}
                                    <TableCell>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleViewDetail(company)}
                                        >
                                            🧠 Analyze
                                        </Button>
                                    </TableCell>

                                    {/* Contact */}
                                    <TableCell>
                                        <div className="flex gap-1">
                                            {company.phone && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    title={company.phone}
                                                    onClick={() => navigator.clipboard.writeText(company.phone!)}
                                                >
                                                    <Phone className="h-3 w-3" />
                                                </Button>
                                            )}
                                            {company.contact_form_url && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => window.open(company.contact_form_url!, '_blank')}
                                                >
                                                    <FileText className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Scale */}
                                    <TableCell>
                                        <div className="space-y-1 text-xs">
                                            {company.employees && (
                                                <div className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" />
                                                    <span>{company.employees}</span>
                                                </div>
                                            )}
                                            {company.revenue && (
                                                <div className="flex items-center gap-1">
                                                    <DollarSign className="h-3 w-3" />
                                                    <span>{company.revenue}</span>
                                                </div>
                                            )}
                                            {company.establishment && (
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>{company.establishment}</span>
                                                </div>
                                            )}
                                            {!company.employees && !company.revenue && !company.establishment && (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Memo */}
                                    <TableCell>
                                        <Input
                                            className="h-8 text-xs"
                                            placeholder="メモ..."
                                            defaultValue={company.note || ''}
                                            onBlur={(e) => handleMemoChange(company.id, e.target.value)}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {companies.length === 0 && (
                <Card className="flex items-center justify-center p-12">
                    <p className="text-center text-muted-foreground">
                        まだデータがありません。検索ページからスクレイピングを開始してください。
                    </p>
                </Card>
            )}

            {/* Detail Modal */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>{detailCompany?.company_name}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                            >
                                <Sparkles className="h-4 w-4 mr-2" />
                                {isAnalyzing ? 'AI分析中...' : 'AI分析'}
                            </Button>
                        </DialogTitle>
                        <DialogDescription>
                            {getSourceBadge(detailCompany?.source || '')} からスクレイピング
                        </DialogDescription>
                    </DialogHeader>

                    {detailCompany && (
                        <div className="space-y-4 pt-4">
                            {/* AI Summary */}
                            {detailCompany.ai_summary && (
                                <Card className="p-4 bg-blue-50 border-blue-200">
                                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-blue-600" />
                                        AI要約
                                    </h3>
                                    <p className="text-sm">{detailCompany.ai_summary}</p>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {parseTags(detailCompany.ai_tags).map((tag, i) => (
                                            <Badge key={i} className="bg-blue-100 text-blue-900">
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </Card>
                            )}

                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <InfoItem label="代表者" value={detailCompany.representative} />
                                <InfoItem label="設立" value={detailCompany.establishment} />
                                <InfoItem label="従業員数" value={detailCompany.employees} />
                                <InfoItem label="売上高" value={detailCompany.revenue} />
                                <InfoItem label="電話番号" value={detailCompany.phone} />
                                <InfoItem label="業種" value={detailCompany.industry} />
                            </div>

                            {/* Job Info */}
                            <div>
                                <h3 className="font-semibold text-sm mb-2">募集情報</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <InfoItem label="職種" value={detailCompany.job_title} />
                                    <InfoItem label="給与" value={detailCompany.salary_text} />
                                </div>
                            </div>

                            {/* Address */}
                            <InfoItem label="住所" value={detailCompany.address} fullWidth />

                            {/* Links */}
                            <div className="flex gap-2">
                                {detailCompany.url && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(detailCompany.url, '_blank')}
                                    >
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        求人ページ
                                    </Button>
                                )}
                                {detailCompany.homepage_url && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(detailCompany.homepage_url!, '_blank')}
                                    >
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        ホームページ
                                    </Button>
                                )}
                                {detailCompany.contact_form_url && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(detailCompany.contact_form_url!, '_blank')}
                                    >
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        問い合わせフォーム
                                    </Button>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <h3 className="font-semibold text-sm mb-2">メモ</h3>
                                <textarea
                                    className="w-full p-2 border rounded-md text-sm"
                                    rows={3}
                                    placeholder="メモを入力..."
                                    defaultValue={detailCompany.note || ''}
                                    onBlur={(e) => updateCompany(detailCompany.id, { note: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Helper Component
function InfoItem({ label, value, fullWidth }: { label: string; value: string | null | undefined; fullWidth?: boolean }) {
    return (
        <div className={fullWidth ? 'col-span-2' : ''}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-sm font-medium">{value || '-'}</p>
        </div>
    );
}
