import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, Briefcase, ChevronRight, X, Play, Square, Clock, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

// 地方と都道府県のマッピング
const regionPrefectures: Record<string, string[]> = {
    '北海道': ['北海道'],
    '東北': ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
    '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
    '甲信越': ['新潟県', '山梨県', '長野県'],
    '北陸': ['富山県', '石川県', '福井県'],
    '東海': ['岐阜県', '静岡県', '愛知県', '三重県'],
    '関西': ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
    '中国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
    '四国': ['徳島県', '香川県', '愛媛県', '高知県'],
    '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
};

const regions = Object.keys(regionPrefectures);

// 職種カテゴリ
const jobTypeCategories = [
    { id: 'sales', name: '営業・販売', icon: '💼' },
    { id: 'management', name: '経営・事業企画・人事・事務', icon: '📊' },
    { id: 'it', name: 'IT・Web・ゲームエンジニア', icon: '💻' },
    { id: 'manufacturing', name: 'モノづくりエンジニア', icon: '🔧' },
    { id: 'consulting', name: 'コンサルタント・士業・金融', icon: '📈' },
    { id: 'service', name: 'サービス・販売・接客', icon: '🛎️' },
    { id: 'realestate', name: '不動産・建設', icon: '🏗️' },
    { id: 'logistics', name: '物流・運輸・運転', icon: '🚚' },
    { id: 'medical', name: '医療・福祉・介護', icon: '🏥' },
    { id: 'creative', name: 'クリエイティブ・マスコミ', icon: '🎨' },
    { id: 'education', name: '教育・保育', icon: '📚' },
    { id: 'other', name: 'その他', icon: '📋' },
];

// サイト情報
const siteInfo = {
    mynavi: {
        name: 'マイナビ転職',
        color: 'bg-sky-500',
        lightBg: 'bg-sky-50 dark:bg-sky-950',
        border: 'border-sky-200 dark:border-sky-800',
        text: 'text-sky-700 dark:text-sky-300',
        selectedBg: 'bg-sky-100 dark:bg-sky-900',
        selectedBorder: 'border-sky-500',
    },
    rikunabi: {
        name: 'リクナビNEXT',
        color: 'bg-emerald-500',
        lightBg: 'bg-emerald-50 dark:bg-emerald-950',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-emerald-700 dark:text-emerald-300',
        selectedBg: 'bg-emerald-100 dark:bg-emerald-900',
        selectedBorder: 'border-emerald-500',
    },
    doda: {
        name: 'doda',
        color: 'bg-orange-500',
        lightBg: 'bg-orange-50 dark:bg-orange-950',
        border: 'border-orange-200 dark:border-orange-800',
        text: 'text-orange-700 dark:text-orange-300',
        selectedBg: 'bg-orange-100 dark:bg-orange-900',
        selectedBorder: 'border-orange-500',
    },
};

export function SearchPage() {
    const { isScrapingRunning, scrapingProgress, startScraping, stopScraping } = useAppStore();

    const [keyword, setKeyword] = useState('');
    const [selectedSites, setSelectedSites] = useState({
        mynavi: true,
        rikunabi: true,
        doda: true,
    });

    // 勤務地選択
    const [selectedPrefectures, setSelectedPrefectures] = useState<Set<string>>(new Set());
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [activeRegion, setActiveRegion] = useState('関東');

    // 職種選択
    const [selectedJobTypes, setSelectedJobTypes] = useState<Set<string>>(new Set());
    const [isJobTypeModalOpen, setIsJobTypeModalOpen] = useState(false);

    // Listen for scraper logs and output to console
    useEffect(() => {
        const handleLog = (message: string) => {
            console.log(message);
        };

        window.electronAPI.scraper.onLog(handleLog);

        return () => {
            window.electronAPI.scraper.offLog();
        };
    }, []);

    const handleSiteChange = (site: keyof typeof selectedSites) => {
        setSelectedSites((prev) => ({
            ...prev,
            [site]: !prev[site],
        }));
    };

    // 都道府県の選択/解除
    const togglePrefecture = (prefecture: string) => {
        setSelectedPrefectures(prev => {
            const newSet = new Set(prev);
            if (newSet.has(prefecture)) {
                newSet.delete(prefecture);
            } else {
                newSet.add(prefecture);
            }
            return newSet;
        });
    };

    // 地方全体の選択/解除
    const toggleRegion = (region: string) => {
        const prefectures = regionPrefectures[region];
        const allSelected = prefectures.every(p => selectedPrefectures.has(p));

        setSelectedPrefectures(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                prefectures.forEach(p => newSet.delete(p));
            } else {
                prefectures.forEach(p => newSet.add(p));
            }
            return newSet;
        });
    };

    // 職種の選択/解除
    const toggleJobType = (jobTypeId: string) => {
        setSelectedJobTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(jobTypeId)) {
                newSet.delete(jobTypeId);
            } else {
                newSet.add(jobTypeId);
            }
            return newSet;
        });
    };

    // 選択された都道府県のサマリー
    const getLocationSummary = () => {
        if (selectedPrefectures.size === 0) return '選択してください';
        if (selectedPrefectures.size <= 3) {
            return Array.from(selectedPrefectures).join(', ');
        }
        return `${Array.from(selectedPrefectures).slice(0, 2).join(', ')} 他${selectedPrefectures.size - 2}件`;
    };

    // 選択された職種のサマリー
    const getJobTypeSummary = () => {
        if (selectedJobTypes.size === 0) return '選択してください';
        const selectedNames = jobTypeCategories
            .filter(cat => selectedJobTypes.has(cat.id))
            .map(cat => cat.name);
        if (selectedNames.length <= 2) {
            return selectedNames.join(', ');
        }
        return `${selectedNames.slice(0, 2).join(', ')} 他${selectedNames.length - 2}件`;
    };

    const handleStartScraping = async () => {
        const sources = Object.entries(selectedSites)
            .filter(([, enabled]) => enabled)
            .map(([source]) => source);

        if (sources.length === 0) {
            alert('スクレイピング対象のサイトを選択してください');
            return;
        }

        // 選択された職種名を取得
        const selectedJobTypeNames = jobTypeCategories
            .filter(cat => selectedJobTypes.has(cat.id))
            .map(cat => cat.name);

        await startScraping({
            sources,
            keywords: keyword || undefined,
            prefectures: selectedPrefectures.size > 0 ? Array.from(selectedPrefectures) : undefined,
            jobTypes: selectedJobTypeNames.length > 0 ? selectedJobTypeNames : undefined,
        });
    };

    const progressPercentage = scrapingProgress
        ? Math.min(100, (scrapingProgress.current / Math.max(scrapingProgress.total, 1)) * 100)
        : 0;

    const selectedSiteCount = Object.values(selectedSites).filter(Boolean).length;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-foreground">Scraping Settings</h1>
            </div>

            {/* Progress Panel - Show when running */}
            {isScrapingRunning && scrapingProgress && (
                <Card className="p-6 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                実行中...
                            </h2>
                            <Badge variant="secondary" className="rounded-xl">
                                {scrapingProgress.source}
                            </Badge>
                        </div>

                        {/* 総件数 */}
                        {scrapingProgress.totalJobs !== undefined && (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <TrendingUp className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">検索結果</p>
                                    <p className="text-2xl font-bold">{scrapingProgress.totalJobs.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
                                </div>
                            </div>
                        )}

                        {/* 経過時間 */}
                        <ElapsedTime startTime={scrapingProgress.startTime} estimatedMinutes={scrapingProgress.estimatedMinutes} />

                        {/* Progress Bar */}
                        <div>
                            <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">進捗</span>
                                <span className="font-semibold">
                                    {scrapingProgress.current} / {scrapingProgress.totalJobs ?? '?'} 件
                                </span>
                            </div>
                            <Progress value={progressPercentage} className="h-3 rounded-xl" />
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl bg-card border text-center">
                                <p className="text-2xl font-bold text-foreground">{scrapingProgress.current}</p>
                                <p className="text-xs text-muted-foreground">処理済</p>
                            </div>
                            <div className="p-3 rounded-xl bg-card border text-center">
                                <p className="text-2xl font-bold text-green-600">{scrapingProgress.newCount}</p>
                                <p className="text-xs text-muted-foreground">新規</p>
                            </div>
                            <div className="p-3 rounded-xl bg-card border text-center">
                                <p className="text-2xl font-bold text-muted-foreground">{scrapingProgress.duplicateCount}</p>
                                <p className="text-xs text-muted-foreground">重複</p>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="text-sm text-muted-foreground text-center">
                            {scrapingProgress.status}
                        </div>
                    </div>
                </Card>
            )}

            {/* Target Sites */}
            <Card className="p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">対象サイト</h2>
                    <span className="text-sm text-muted-foreground">{selectedSiteCount} サイト選択中</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(siteInfo) as Array<keyof typeof siteInfo>).map((site) => {
                        const info = siteInfo[site];
                        const isSelected = selectedSites[site];
                        return (
                            <button
                                key={site}
                                onClick={() => handleSiteChange(site)}
                                disabled={isScrapingRunning}
                                className={cn(
                                    'relative p-4 rounded-xl border-2 transition-all',
                                    'flex flex-col items-center gap-2',
                                    'hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed',
                                    isSelected
                                        ? `${info.selectedBg} ${info.selectedBorder}`
                                        : 'border-border hover:border-muted-foreground/30'
                                )}
                            >
                                {isSelected && (
                                    <div className="absolute top-2 right-2">
                                        <CheckCircle2 className={cn('h-5 w-5', info.text)} />
                                    </div>
                                )}
                                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', info.color)}>
                                    <span className="text-white font-bold text-sm">
                                        {site === 'mynavi' ? 'M' : site === 'rikunabi' ? 'R' : 'D'}
                                    </span>
                                </div>
                                <span className={cn('text-sm font-medium', isSelected ? info.text : 'text-foreground')}>
                                    {info.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Search Conditions */}
            <Card className="p-6 rounded-2xl shadow-sm">
                <h2 className="text-lg font-semibold mb-4">検索条件</h2>
                <div className="space-y-4">
                    {/* キーワード */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            キーワード
                        </label>
                        <Input
                            placeholder="検索キーワードを入力（空欄で新着全件取得）"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            className="h-12 rounded-xl text-base"
                            disabled={isScrapingRunning}
                        />
                    </div>

                    {/* 勤務地選択ボタン */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            勤務地
                        </label>
                        <Button
                            variant="outline"
                            className={cn(
                                'w-full h-12 rounded-xl justify-between',
                                selectedPrefectures.size > 0 && 'border-primary bg-primary/5'
                            )}
                            onClick={() => setIsLocationModalOpen(true)}
                            disabled={isScrapingRunning}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                    <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className={cn(
                                    'text-left',
                                    selectedPrefectures.size === 0 && 'text-muted-foreground'
                                )}>
                                    {getLocationSummary()}
                                </span>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </Button>
                        {selectedPrefectures.size > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {Array.from(selectedPrefectures).slice(0, 5).map(pref => (
                                    <Badge
                                        key={pref}
                                        variant="secondary"
                                        className="rounded-lg px-2 py-1 text-xs"
                                    >
                                        {pref}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePrefecture(pref);
                                            }}
                                            className="ml-1.5 hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                                {selectedPrefectures.size > 5 && (
                                    <Badge variant="outline" className="rounded-lg text-xs">
                                        +{selectedPrefectures.size - 5}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 職種選択ボタン */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            職種
                        </label>
                        <Button
                            variant="outline"
                            className={cn(
                                'w-full h-12 rounded-xl justify-between',
                                selectedJobTypes.size > 0 && 'border-primary bg-primary/5'
                            )}
                            onClick={() => setIsJobTypeModalOpen(true)}
                            disabled={isScrapingRunning}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                                    <Briefcase className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                </div>
                                <span className={cn(
                                    'text-left',
                                    selectedJobTypes.size === 0 && 'text-muted-foreground'
                                )}>
                                    {getJobTypeSummary()}
                                </span>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </Button>
                        {selectedJobTypes.size > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {jobTypeCategories
                                    .filter(cat => selectedJobTypes.has(cat.id))
                                    .slice(0, 3)
                                    .map(cat => (
                                        <Badge
                                            key={cat.id}
                                            variant="secondary"
                                            className="rounded-lg px-2 py-1 text-xs"
                                        >
                                            {cat.icon} {cat.name}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleJobType(cat.id);
                                                }}
                                                className="ml-1.5 hover:text-destructive"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                {selectedJobTypes.size > 3 && (
                                    <Badge variant="outline" className="rounded-lg text-xs">
                                        +{selectedJobTypes.size - 3}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Action Button */}
            <div className="pt-2">
                {!isScrapingRunning ? (
                    <Button
                        onClick={handleStartScraping}
                        className="w-full h-14 rounded-xl text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all"
                        disabled={selectedSiteCount === 0}
                    >
                        <Play className="h-5 w-5 mr-2" />
                        スクレイピング開始
                    </Button>
                ) : (
                    <Button
                        onClick={stopScraping}
                        variant="destructive"
                        className="w-full h-14 rounded-xl text-lg font-bold shadow-lg"
                    >
                        <Square className="h-5 w-5 mr-2" />
                        停止
                    </Button>
                )}
            </div>

            {/* 勤務地選択モーダル */}
            <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-xl">
                            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            勤務地を選択
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex gap-6 mt-4">
                        {/* 地方タブ（左側） */}
                        <div className="w-36 space-y-1">
                            {regions.map(region => {
                                const prefectures = regionPrefectures[region];
                                const selectedCount = prefectures.filter(p => selectedPrefectures.has(p)).length;
                                return (
                                    <button
                                        key={region}
                                        className={cn(
                                            'w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all',
                                            activeRegion === region
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                        )}
                                        onClick={() => setActiveRegion(region)}
                                    >
                                        <span className="flex items-center justify-between">
                                            {region}
                                            {selectedCount > 0 && (
                                                <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                                                    {selectedCount}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* 都道府県チェックボックス（右側） */}
                        <div className="flex-1 border-l pl-6">
                            <div className="mb-4 flex items-center justify-between">
                                <span className="font-semibold text-lg">{activeRegion}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-lg"
                                    onClick={() => toggleRegion(activeRegion)}
                                >
                                    {regionPrefectures[activeRegion].every(p => selectedPrefectures.has(p))
                                        ? 'すべて解除'
                                        : 'すべて選択'}
                                </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                                {regionPrefectures[activeRegion].map(prefecture => (
                                    <label
                                        key={prefecture}
                                        className={cn(
                                            'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                            selectedPrefectures.has(prefecture)
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                                        )}
                                    >
                                        <Checkbox
                                            checked={selectedPrefectures.has(prefecture)}
                                            onCheckedChange={() => togglePrefecture(prefecture)}
                                        />
                                        <span className="text-sm">{prefecture}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 選択済み表示 */}
                    {selectedPrefectures.size > 0 && (
                        <div className="mt-6 pt-4 border-t">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium">{selectedPrefectures.size}件選択中</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-lg text-destructive hover:text-destructive"
                                    onClick={() => setSelectedPrefectures(new Set())}
                                >
                                    すべてクリア
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {Array.from(selectedPrefectures).map(pref => (
                                    <Badge key={pref} variant="secondary" className="rounded-lg">
                                        {pref}
                                        <button
                                            onClick={() => togglePrefecture(pref)}
                                            className="ml-1.5 hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <Button variant="outline" className="rounded-xl" onClick={() => setIsLocationModalOpen(false)}>
                            キャンセル
                        </Button>
                        <Button className="rounded-xl" onClick={() => setIsLocationModalOpen(false)}>
                            適用
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 職種選択モーダル */}
            <Dialog open={isJobTypeModalOpen} onOpenChange={setIsJobTypeModalOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-xl">
                            <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                                <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            職種を選択
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <div className="grid grid-cols-2 gap-3">
                            {jobTypeCategories.map(category => (
                                <label
                                    key={category.id}
                                    className={cn(
                                        'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                                        selectedJobTypes.has(category.id)
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                                    )}
                                >
                                    <Checkbox
                                        checked={selectedJobTypes.has(category.id)}
                                        onCheckedChange={() => toggleJobType(category.id)}
                                    />
                                    <span className="text-2xl">{category.icon}</span>
                                    <span className="text-sm font-medium flex-1">{category.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 選択済み表示 */}
                    {selectedJobTypes.size > 0 && (
                        <div className="mt-6 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{selectedJobTypes.size}件選択中</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-lg text-destructive hover:text-destructive"
                                    onClick={() => setSelectedJobTypes(new Set())}
                                >
                                    すべてクリア
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <Button variant="outline" className="rounded-xl" onClick={() => setIsJobTypeModalOpen(false)}>
                            キャンセル
                        </Button>
                        <Button className="rounded-xl" onClick={() => setIsJobTypeModalOpen(false)}>
                            適用
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// 経過時間表示コンポーネント
function ElapsedTime({ startTime, estimatedMinutes }: { startTime?: number; estimatedMinutes?: number }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!startTime) return;

        const updateElapsed = () => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        };

        updateElapsed();
        const interval = setInterval(updateElapsed, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    if (!startTime) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border">
            <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">経過時間:</span>
                <span className="font-mono font-semibold">{formatTime(elapsed)}</span>
            </div>
            {estimatedMinutes !== undefined && estimatedMinutes > 0 && (
                <span className="text-sm text-muted-foreground">残り約 {estimatedMinutes} 分</span>
            )}
        </div>
    );
}
