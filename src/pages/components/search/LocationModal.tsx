import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { regionPrefectures, regions } from './constants';

interface LocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedPrefectures: Set<string>;
    togglePrefecture: (prefecture: string) => void;
    toggleRegion: (region: string) => void;
    clearPrefectures: () => void;
}

export function LocationModal({
    isOpen,
    onClose,
    selectedPrefectures,
    togglePrefecture,
    toggleRegion,
    clearPrefectures,
}: LocationModalProps) {
    const [activeRegion, setActiveRegion] = useState('関東');

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
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
                                onClick={clearPrefectures}
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
