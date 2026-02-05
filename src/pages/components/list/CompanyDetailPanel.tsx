import { Button } from '@/components/ui/button';
import { ExternalLink, X, Building2, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Company } from '@/types';
import { sourceConfig } from './constants';

interface CompanyDetailPanelProps {
    isOpen: boolean;
    company: Company | null;
    sidebarCollapsed: boolean;
    onClose: () => void;
    onUpdateNote: (id: number, note: string) => void;
    panelRef: React.RefObject<HTMLDivElement | null>;
}

export function CompanyDetailPanel({
    isOpen,
    company,
    sidebarCollapsed,
    onClose,
    onUpdateNote,
    panelRef,
}: CompanyDetailPanelProps) {
    const getSourceBadge = (source: string) => {
        const config = sourceConfig[source] || { label: source, className: 'bg-slate-100 text-slate-700' };
        return (
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
                {config.label}
            </span>
        );
    };

    return (
        <div
            ref={panelRef}
            className={cn(
                'fixed right-0 bottom-0 h-1/2 bg-background border-t border-border shadow-2xl transition-all duration-300 ease-out z-40',
                isOpen ? 'translate-y-0' : 'translate-y-full',
                sidebarCollapsed ? 'left-0' : 'left-64'
            )}
        >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
                <div>
                    <h3 className="text-lg font-semibold">{company?.company_name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {company && getSourceBadge(company.source)} からスクレイピング
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl"
                    onClick={onClose}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Panel Content */}
            {company && (
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
                                    <dd>{company.representative || '-'}</dd>
                                    <dt className="text-muted-foreground">設立</dt>
                                    <dd>{company.establishment || '-'}</dd>
                                    <dt className="text-muted-foreground">従業員数</dt>
                                    <dd>{company.employees || '-'}</dd>
                                    <dt className="text-muted-foreground">売上高</dt>
                                    <dd>{company.revenue || '-'}</dd>
                                    <dt className="text-muted-foreground">所在地</dt>
                                    <dd>{company.address || '-'}</dd>
                                </dl>
                            </section>

                            {/* 事業内容 */}
                            <section className="p-4 rounded-xl bg-muted/50">
                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Briefcase className="h-4 w-4" />
                                    事業内容
                                </h4>
                                <p className="text-sm whitespace-pre-wrap">{company.industry || '-'}</p>
                            </section>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                            {/* 採用情報 */}
                            <section className="p-4 rounded-xl bg-muted/50">
                                <h4 className="font-semibold mb-3">採用情報</h4>
                                <dl className="grid grid-cols-2 gap-2 text-sm">
                                    <dt className="text-muted-foreground">職種</dt>
                                    <dd>{company.job_title || '-'}</dd>
                                    <dt className="text-muted-foreground">給与</dt>
                                    <dd className="whitespace-pre-wrap">{company.salary_text || '-'}</dd>
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
                                        onClick={() => window.open(company.url, '_blank')}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                        求人ページ
                                    </Button>
                                    {company.homepage_url && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl"
                                            onClick={() => window.open(company.homepage_url!, '_blank')}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                            企業HP
                                        </Button>
                                    )}
                                    {company.contact_form_url && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl"
                                            onClick={() => window.open(company.contact_form_url!, '_blank')}
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
                                    defaultValue={company.note || ''}
                                    onBlur={(e) => onUpdateNote(company.id, e.target.value)}
                                />
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
