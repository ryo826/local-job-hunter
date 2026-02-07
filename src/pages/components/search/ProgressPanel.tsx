import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

interface ScrapingProgress {
    source: string;
    current: number;
    total: number;
    totalJobs?: number;
    newCount: number;
    duplicateCount: number;
    status: string;
    startTime?: number;
    estimatedMinutes?: number;
    waitingConfirmation?: boolean;
}

interface ProgressPanelProps {
    progress: ScrapingProgress;
}

export function ProgressPanel({ progress }: ProgressPanelProps) {
    // 進捗は処理対象件数(total)に対して計算
    const progressPercentage = Math.min(100, (progress.current / Math.max(progress.total, 1)) * 100);

    const handleConfirm = async (proceed: boolean) => {
        await window.electronAPI.scraper.confirm(proceed);
    };

    // 確認待ち状態の場合
    if (progress.waitingConfirmation) {
        return (
            <Card className="p-6 rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            確認待ち
                        </h2>
                        <Badge variant="secondary" className="rounded-xl">
                            {progress.source}
                        </Badge>
                    </div>

                    {/* 検索結果と処理対象 */}
                    <div className="grid grid-cols-2 gap-3">
                        {progress.totalJobs !== undefined && (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <TrendingUp className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">検索結果</p>
                                    <p className="text-2xl font-bold">{progress.totalJobs.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-amber-500/30">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">処理対象</p>
                                <p className="text-2xl font-bold text-amber-600">{progress.total.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
                            </div>
                        </div>
                    </div>

                    {/* 確認メッセージ */}
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                        {progress.total > 0 ? (
                            <>
                                <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                                    {progress.total.toLocaleString()}件の詳細ページを取得しますか？
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    推定時間: 約{Math.ceil(progress.total * 2 / 60 / 5)}分（5並列処理）
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                                    {(progress.totalJobs ?? 0).toLocaleString()}件の検索結果
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    URL収集を開始しますか？
                                </p>
                            </>
                        )}
                    </div>

                    {/* 確認ボタン */}
                    <div className="flex gap-3">
                        <Button
                            onClick={() => handleConfirm(true)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            取得開始
                        </Button>
                        <Button
                            onClick={() => handleConfirm(false)}
                            variant="outline"
                            className="flex-1 border-red-500/50 text-red-600 hover:bg-red-500/10"
                        >
                            <XCircle className="h-4 w-4 mr-2" />
                            キャンセル
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    // 通常の進捗表示
    return (
        <Card className="p-6 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        実行中...
                    </h2>
                    <Badge variant="secondary" className="rounded-xl">
                        {progress.source}
                    </Badge>
                </div>

                {/* 検索結果と処理対象 */}
                <div className="grid grid-cols-2 gap-3">
                    {progress.totalJobs !== undefined && (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">検索結果</p>
                                <p className="text-2xl font-bold">{progress.totalJobs.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
                        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">処理対象</p>
                            <p className="text-2xl font-bold">{progress.total.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
                        </div>
                    </div>
                </div>

                {/* 経過時間 */}
                <ElapsedTime startTime={progress.startTime} estimatedMinutes={progress.estimatedMinutes} />

                {/* Progress Bar */}
                <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">進捗</span>
                        <span className="font-semibold">
                            {progress.current} / {progress.total} 件
                        </span>
                    </div>
                    <Progress value={progressPercentage} className="h-3 rounded-xl" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-card border text-center">
                        <p className="text-2xl font-bold text-foreground">{progress.current}</p>
                        <p className="text-xs text-muted-foreground">処理済</p>
                    </div>
                    <div className="p-3 rounded-xl bg-card border text-center">
                        <p className="text-2xl font-bold text-green-600">{progress.newCount}</p>
                        <p className="text-xs text-muted-foreground">新規</p>
                    </div>
                    <div className="p-3 rounded-xl bg-card border text-center">
                        <p className="text-2xl font-bold text-muted-foreground">{progress.duplicateCount}</p>
                        <p className="text-xs text-muted-foreground">重複</p>
                    </div>
                </div>

                {/* Status */}
                <div className="text-sm text-muted-foreground text-center">
                    {progress.status}
                </div>
            </div>
        </Card>
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
