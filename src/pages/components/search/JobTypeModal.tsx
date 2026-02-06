import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JobTypeCategory } from './constants';

interface JobTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: JobTypeCategory[];
    selectedJobTypes: Set<string>;
    toggleJobType: (jobTypeId: string) => void;
    clearJobTypes: () => void;
}

export function JobTypeModal({
    isOpen,
    onClose,
    categories,
    selectedJobTypes,
    toggleJobType,
    clearJobTypes,
}: JobTypeModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
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
                        {categories.map(category => (
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
                                onClick={clearJobTypes}
                            >
                                すべてクリア
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="outline" className="rounded-xl" onClick={onClose}>
                        キャンセル
                    </Button>
                    <Button className="rounded-xl" onClick={onClose}>
                        適用
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
