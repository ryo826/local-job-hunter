import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Briefcase, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterTab } from './constants';
import { regionCheckboxOptions, jobTypeCheckboxOptions } from './constants';

interface CompanyFiltersProps {
    activeFilterTab: FilterTab;
    setActiveFilterTab: (tab: FilterTab) => void;
    selectedRegions: Set<string>;
    toggleRegion: (region: string) => void;
    selectedJobTypes: Set<string>;
    toggleJobType: (jobType: string) => void;
    activeFiltersCount: number;
    resetAllFilters: () => void;
    filterPanelRef: React.RefObject<HTMLDivElement | null>;
}

export function CompanyFilters({
    activeFilterTab,
    setActiveFilterTab,
    selectedRegions,
    toggleRegion,
    selectedJobTypes,
    toggleJobType,
    activeFiltersCount,
    resetAllFilters,
    filterPanelRef,
}: CompanyFiltersProps) {
    return (
        <Card className="p-5 rounded-2xl" ref={filterPanelRef}>
            {/* Filter Tabs */}
            <div className="flex gap-1 mb-4">
                {(['勤務地', '職種'] as FilterTab[]).map(tab => (
                    <button
                        key={tab}
                        className={cn(
                            'px-4 py-2 text-sm font-medium rounded-xl transition-all',
                            activeFilterTab === tab
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        )}
                        onClick={() => setActiveFilterTab(tab)}
                    >
                        {tab === '勤務地' && <MapPin className="h-4 w-4 inline mr-1.5" />}
                        {tab === '職種' && <Briefcase className="h-4 w-4 inline mr-1.5" />}
                        {tab}
                        {tab === '勤務地' && selectedRegions.size > 0 && (
                            <Badge className="ml-1.5 h-5 px-1.5 rounded-full text-xs">
                                {selectedRegions.size}
                            </Badge>
                        )}
                        {tab === '職種' && selectedJobTypes.size > 0 && (
                            <Badge className="ml-1.5 h-5 px-1.5 rounded-full text-xs">
                                {selectedJobTypes.size}
                            </Badge>
                        )}
                    </button>
                ))}
            </div>

            {/* Filter Content */}
            <div className="min-h-[100px]">
                {activeFilterTab === '勤務地' && (
                    <div className="grid grid-cols-5 gap-2">
                        {regionCheckboxOptions.map(region => (
                            <label
                                key={region}
                                className={cn(
                                    'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                    selectedRegions.has(region)
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-muted-foreground/30'
                                )}
                            >
                                <Checkbox
                                    checked={selectedRegions.has(region)}
                                    onCheckedChange={() => toggleRegion(region)}
                                />
                                <span className="text-sm">{region}</span>
                            </label>
                        ))}
                    </div>
                )}

                {activeFilterTab === '職種' && (
                    <div className="grid grid-cols-3 gap-2">
                        {jobTypeCheckboxOptions.map(jobType => (
                            <label
                                key={jobType}
                                className={cn(
                                    'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                    selectedJobTypes.has(jobType)
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-muted-foreground/30'
                                )}
                            >
                                <Checkbox
                                    checked={selectedJobTypes.has(jobType)}
                                    onCheckedChange={() => toggleJobType(jobType)}
                                />
                                <span className="text-sm">{jobType}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-end">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={resetAllFilters}
                    >
                        <X className="h-4 w-4 mr-1" />
                        すべてクリア
                    </Button>
                </div>
            )}
        </Card>
    );
}
