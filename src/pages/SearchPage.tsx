import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, Briefcase, ChevronRight, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

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
        if (selectedPrefectures.size === 0) return '指定なし';
        if (selectedPrefectures.size <= 3) {
            return Array.from(selectedPrefectures).join(', ');
        }
        return `${Array.from(selectedPrefectures).slice(0, 2).join(', ')} 他${selectedPrefectures.size - 2}件`;
    };

    // 選択された職種のサマリー
    const getJobTypeSummary = () => {
        if (selectedJobTypes.size === 0) return '指定なし';
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

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">スクレイピング設定</h1>
                <p className="mt-2 text-muted-foreground">求人サイトから企業情報を取得します</p>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    {/* Site Selection */}
                    <Card className="p-6">
                        <h2 className="mb-4 text-lg font-semibold">対象サイト</h2>
                        <div className="space-y-3">
                            <SiteCheckbox
                                label="マイナビ転職"
                                checked={selectedSites.mynavi}
                                onChange={() => handleSiteChange('mynavi')}
                                badgeColor="bg-blue-100 text-blue-900"
                                badgeText="マイナビ"
                            />
                            <SiteCheckbox
                                label="リクナビNEXT"
                                checked={selectedSites.rikunabi}
                                onChange={() => handleSiteChange('rikunabi')}
                                badgeColor="bg-green-100 text-green-900"
                                badgeText="リクナビ"
                            />
                            <SiteCheckbox
                                label="doda"
                                checked={selectedSites.doda}
                                onChange={() => handleSiteChange('doda')}
                                badgeColor="bg-orange-100 text-orange-900"
                                badgeText="doda"
                            />
                        </div>
                    </Card>

                    {/* Search Criteria */}
                    <Card className="p-6">
                        <h2 className="mb-4 text-lg font-semibold">検索条件</h2>
                        <div className="space-y-4">
                            {/* キーワード */}
                            <div>
                                <Label htmlFor="keyword">検索キーワード</Label>
                                <Input
                                    id="keyword"
                                    placeholder="空欄の場合は新着全件を取得"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    className="mt-2"
                                    disabled={isScrapingRunning}
                                />
                            </div>

                            {/* 勤務地選択ボタン */}
                            <div>
                                <Label>勤務地</Label>
                                <Button
                                    variant="outline"
                                    className="w-full mt-2 justify-between h-auto py-3"
                                    onClick={() => setIsLocationModalOpen(true)}
                                    disabled={isScrapingRunning}
                                >
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-blue-600" />
                                        <span className="text-left">{getLocationSummary()}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                {selectedPrefectures.size > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {Array.from(selectedPrefectures).slice(0, 5).map(pref => (
                                            <Badge key={pref} variant="secondary" className="text-xs">
                                                {pref}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        togglePrefecture(pref);
                                                    }}
                                                    className="ml-1 hover:text-red-500"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                        {selectedPrefectures.size > 5 && (
                                            <Badge variant="outline" className="text-xs">
                                                +{selectedPrefectures.size - 5}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 職種選択ボタン */}
                            <div>
                                <Label>職種</Label>
                                <Button
                                    variant="outline"
                                    className="w-full mt-2 justify-between h-auto py-3"
                                    onClick={() => setIsJobTypeModalOpen(true)}
                                    disabled={isScrapingRunning}
                                >
                                    <div className="flex items-center gap-2">
                                        <Briefcase className="h-4 w-4 text-blue-600" />
                                        <span className="text-left">{getJobTypeSummary()}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                {selectedJobTypes.size > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {jobTypeCategories
                                            .filter(cat => selectedJobTypes.has(cat.id))
                                            .slice(0, 3)
                                            .map(cat => (
                                                <Badge key={cat.id} variant="secondary" className="text-xs">
                                                    {cat.icon} {cat.name}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleJobType(cat.id);
                                                        }}
                                                        className="ml-1 hover:text-red-500"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        {selectedJobTypes.size > 3 && (
                                            <Badge variant="outline" className="text-xs">
                                                +{selectedJobTypes.size - 3}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Execution Control */}
                    <Card className="p-6">
                        <div className="space-y-4">
                            {!isScrapingRunning ? (
                                <Button
                                    onClick={handleStartScraping}
                                    className="w-full bg-blue-600 py-6 text-base font-semibold text-white hover:bg-blue-700"
                                >
                                    スクレイピング開始
                                </Button>
                            ) : (
                                <Button
                                    onClick={stopScraping}
                                    variant="destructive"
                                    className="w-full py-6 text-base font-semibold"
                                >
                                    停止
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Progress Panel */}
                {isScrapingRunning && scrapingProgress && (
                    <Card className="sticky top-8 h-fit p-6">
                        <h2 className="mb-4 text-lg font-semibold">実行中...</h2>
                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 flex items-center justify-between text-sm">
                                    <span>進捗</span>
                                    <span className="font-semibold">{Math.round(progressPercentage)}%</span>
                                </div>
                                <Progress value={progressPercentage} className="h-2" />
                            </div>

                            <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                                <p>
                                    <span className="font-medium">処理済: </span>
                                    <span className="text-blue-600">{scrapingProgress.current}件</span>
                                </p>
                                <p>
                                    <span className="font-medium">新規: </span>
                                    <span className="text-green-600">{scrapingProgress.newCount}件</span>
                                </p>
                                <p>
                                    <span className="font-medium">重複: </span>
                                    <span className="text-gray-600">{scrapingProgress.duplicateCount}件</span>
                                </p>
                            </div>

                            <div className="rounded-lg bg-muted p-3">
                                <p className="text-sm">
                                    <span className="font-medium">ソース: </span>
                                    <span>{scrapingProgress.source}</span>
                                </p>
                                <p className="text-sm">
                                    <span className="font-medium">状態: </span>
                                    <span>{scrapingProgress.status}</span>
                                </p>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* 勤務地選択モーダル */}
            <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-blue-600" />
                            勤務地を選択
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex gap-4 mt-4">
                        {/* 地方タブ（左側） */}
                        <div className="w-32 space-y-1 border-r pr-4">
                            {regions.map(region => {
                                const prefectures = regionPrefectures[region];
                                const selectedCount = prefectures.filter(p => selectedPrefectures.has(p)).length;
                                return (
                                    <button
                                        key={region}
                                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                            activeRegion === region
                                                ? 'bg-blue-100 text-blue-700 font-medium'
                                                : 'hover:bg-gray-100'
                                        }`}
                                        onClick={() => setActiveRegion(region)}
                                    >
                                        {region}
                                        {selectedCount > 0 && (
                                            <span className="ml-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                                                {selectedCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* 都道府県チェックボックス（右側） */}
                        <div className="flex-1">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="font-medium">{activeRegion}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
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
                                        className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-gray-50 transition-colors"
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
                        <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">選択中: {selectedPrefectures.size}件</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedPrefectures(new Set())}
                                >
                                    すべてクリア
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {Array.from(selectedPrefectures).map(pref => (
                                    <Badge key={pref} variant="secondary" className="text-xs">
                                        {pref}
                                        <button
                                            onClick={() => togglePrefecture(pref)}
                                            className="ml-1 hover:text-red-500"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => setIsLocationModalOpen(false)}>
                            完了
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 職種選択モーダル */}
            <Dialog open={isJobTypeModalOpen} onOpenChange={setIsJobTypeModalOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-blue-600" />
                            職種を選択
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <div className="grid grid-cols-2 gap-3">
                            {jobTypeCategories.map(category => (
                                <label
                                    key={category.id}
                                    className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                        selectedJobTypes.has(category.id)
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <Checkbox
                                        checked={selectedJobTypes.has(category.id)}
                                        onCheckedChange={() => toggleJobType(category.id)}
                                    />
                                    <span className="text-xl">{category.icon}</span>
                                    <span className="text-sm font-medium">{category.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 選択済み表示 */}
                    {selectedJobTypes.size > 0 && (
                        <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">選択中: {selectedJobTypes.size}件</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedJobTypes(new Set())}
                                >
                                    すべてクリア
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => setIsJobTypeModalOpen(false)}>
                            完了
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SiteCheckbox({
    label,
    checked,
    onChange,
    badgeColor,
    badgeText,
    requiresLogin,
}: {
    label: string;
    checked: boolean;
    onChange: () => void;
    badgeColor: string;
    badgeText: string;
    requiresLogin?: boolean;
}) {
    return (
        <div className="flex items-center gap-3">
            <Checkbox checked={checked} onCheckedChange={onChange} />
            <span className="flex-1">{label}</span>
            <Badge className={`${badgeColor} border-0`}>{badgeText}</Badge>
            {requiresLogin && (
                <span className="text-xs text-yellow-600">🔒</span>
            )}
        </div>
    );
}
