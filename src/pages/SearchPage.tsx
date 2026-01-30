import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

export function SearchPage() {
    const { isScrapingRunning, scrapingProgress, startScraping, stopScraping } = useAppStore();

    const [keyword, setKeyword] = useState('');
    const [area, setArea] = useState('none');
    const [selectedSites, setSelectedSites] = useState({
        mynavi: true,
        rikunabi: true,
        doda: true,
    });

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

    const handleStartScraping = async () => {
        const sources = Object.entries(selectedSites)
            .filter(([, enabled]) => enabled)
            .map(([source]) => source);

        if (sources.length === 0) {
            alert('スクレイピング対象のサイトを選択してください');
            return;
        }



        await startScraping({
            sources,
            keywords: keyword || undefined,
            location: area !== 'none' ? area : undefined,
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

                            <div>
                                <Label htmlFor="area">勤務地</Label>
                                <Select value={area} onValueChange={setArea}>
                                    <SelectTrigger id="area" className="mt-2">
                                        <SelectValue placeholder="指定なし" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">指定なし</SelectItem>
                                        <SelectItem value="東京">東京都</SelectItem>
                                        <SelectItem value="大阪">大阪府</SelectItem>
                                        <SelectItem value="愛知">愛知県</SelectItem>
                                        <SelectItem value="福岡">福岡県</SelectItem>
                                        <SelectItem value="北海道">北海道</SelectItem>
                                        <SelectItem value="神奈川">神奈川県</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </Card>

                    {/* Execution Control */}
                    <Card className="p-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <Badge variant="secondary">⏱ 最大実行時間: 60分</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                ※ 連続50件の重複で自動停止します
                            </p>

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
