import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpdateResult } from '@/types';

interface DeleteConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    isDeleting: boolean;
    onDelete: () => void;
}

export function DeleteConfirmDialog({
    isOpen,
    onClose,
    selectedCount,
    isDeleting,
    onDelete,
}: DeleteConfirmDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="rounded-2xl">
                <DialogHeader>
                    <DialogTitle>削除の確認</DialogTitle>
                    <DialogDescription>
                        選択した {selectedCount} 件の企業データを削除しますか？
                        この操作は取り消せません。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-3 mt-6">
                    <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        キャンセル
                    </Button>
                    <Button
                        variant="destructive"
                        className="rounded-xl"
                        onClick={onDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                削除中...
                            </>
                        ) : (
                            '削除する'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface UpdateResultsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    results: UpdateResult[] | null;
}

export function UpdateResultsDialog({
    isOpen,
    onClose,
    results,
}: UpdateResultsDialogProps) {
    const changedResults = results?.filter(r =>
        r.changes.rank || r.changes.jobCount || r.changes.status
    ) || [];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>更新結果</DialogTitle>
                    <DialogDescription>
                        {results?.length || 0} 件の企業データを更新しました
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto mt-4 space-y-3">
                    {changedResults.map((result) => (
                        <div
                            key={result.companyId}
                            className={cn(
                                'p-3 rounded-xl border',
                                result.error
                                    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                                    : 'bg-muted/50 border-border'
                            )}
                        >
                            <div className="font-medium">{result.companyName}</div>
                            {result.error ? (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                    エラー: {result.error}
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {result.changes.rank && (
                                        <Badge
                                            className={cn(
                                                'text-xs',
                                                result.changes.rank.direction === 'upgrade'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                            )}
                                        >
                                            ランク: {result.changes.rank.old || '-'} → {result.changes.rank.new || '-'}
                                            {result.changes.rank.direction === 'upgrade' ? ' ↑' : ' ↓'}
                                        </Badge>
                                    )}
                                    {result.changes.jobCount && (
                                        <Badge
                                            className={cn(
                                                'text-xs',
                                                result.changes.jobCount.delta > 0
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                            )}
                                        >
                                            求人数: {result.changes.jobCount.old} → {result.changes.jobCount.new}
                                            {result.changes.jobCount.delta > 0 ? ` (+${result.changes.jobCount.delta})` : ` (${result.changes.jobCount.delta})`}
                                        </Badge>
                                    )}
                                    {result.changes.status && (
                                        <Badge
                                            className={cn(
                                                'text-xs',
                                                result.changes.status.new === '掲載終了'
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                            )}
                                        >
                                            {result.changes.status.old} → {result.changes.status.new}
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {changedResults.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            変更のあった企業はありませんでした
                        </div>
                    )}
                </div>
                <div className="flex justify-end mt-4 pt-4 border-t">
                    <Button
                        className="rounded-xl"
                        onClick={onClose}
                    >
                        閉じる
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
