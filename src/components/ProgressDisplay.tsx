import { Progress } from '@/components/ui/progress';

interface ProgressDisplayProps {
    current: number;
    total: number;
    startTime?: number;
    label?: string;
    status?: string;
    details?: React.ReactNode;
}

export function ProgressDisplay({
    current,
    total,
    startTime,
    label = '処理中',
    status,
    details,
}: ProgressDisplayProps) {
    const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0;

    // Calculate remaining time
    let remainingTime: string | null = null;
    if (startTime && current > 0 && total > current) {
        const elapsedMs = Date.now() - startTime;
        const avgTimePerItem = elapsedMs / current;
        const remainingItems = total - current;
        const remainingMs = avgTimePerItem * remainingItems;

        if (remainingMs < 60000) {
            remainingTime = `${Math.ceil(remainingMs / 1000)}秒`;
        } else if (remainingMs < 3600000) {
            const minutes = Math.floor(remainingMs / 60000);
            const seconds = Math.ceil((remainingMs % 60000) / 1000);
            remainingTime = `${minutes}分${seconds}秒`;
        } else {
            const hours = Math.floor(remainingMs / 3600000);
            const minutes = Math.ceil((remainingMs % 3600000) / 60000);
            remainingTime = `${hours}時間${minutes}分`;
        }
    }

    // Calculate elapsed time
    let elapsedTime: string | null = null;
    if (startTime) {
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs < 60000) {
            elapsedTime = `${Math.floor(elapsedMs / 1000)}秒`;
        } else if (elapsedMs < 3600000) {
            const minutes = Math.floor(elapsedMs / 60000);
            const seconds = Math.floor((elapsedMs % 60000) / 1000);
            elapsedTime = `${minutes}分${seconds}秒`;
        } else {
            const hours = Math.floor(elapsedMs / 3600000);
            const minutes = Math.floor((elapsedMs % 3600000) / 60000);
            elapsedTime = `${hours}時間${minutes}分`;
        }
    }

    return (
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{label}</span>
                {status && <span className="text-xs text-muted-foreground">{status}</span>}
            </div>

            {/* Progress bar */}
            <div>
                <div className="flex items-center justify-between text-xs mb-1">
                    <span>{current} / {total} 件</span>
                    <span className="font-semibold">{Math.round(percentage)}%</span>
                </div>
                <Progress value={percentage} className="h-2" />
            </div>

            {/* Time info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    {elapsedTime && `経過: ${elapsedTime}`}
                </span>
                <span>
                    {remainingTime && `残り: 約${remainingTime}`}
                </span>
            </div>

            {/* Details */}
            {details && (
                <div className="text-xs border-t pt-2 mt-2">
                    {details}
                </div>
            )}
        </div>
    );
}
