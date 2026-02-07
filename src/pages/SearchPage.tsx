import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MapPin, Briefcase, ChevronRight, X, Play, Square, CheckCircle2, Star, Users, Calendar, Banknote } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import type { SiteKey } from './components/search/constants';
import {
    rankOptions,
    salaryOptions,
    employeeOptions,
    jobUpdatedOptions,
    siteInfo,
    getJobTypeCategoriesForSite,
} from './components/search/constants';
import { useSearchFilters } from './components/search/useSearchFilters';
import { LocationModal } from './components/search/LocationModal';
import { JobTypeModal } from './components/search/JobTypeModal';
import { ProgressPanel } from './components/search/ProgressPanel';

export function SearchPage() {
    const { isScrapingRunning, scrapingProgress, startScraping, stopScraping, setScrapingSettings } = useAppStore();

    const {
        state,
        selectSite,
        togglePrefecture,
        toggleRegion,
        toggleJobType,
        toggleRank,
        setSalaryFilter,
        setEmployeesFilter,
        setJobUpdatedFilter,
        clearPrefectures,
        clearJobTypes,
        getLocationSummary,
        getJobTypeSummary,
        isFilterSupported,
    } = useSearchFilters();

    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
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

    const currentJobTypeCategories = getJobTypeCategoriesForSite(state.selectedSite);

    const handleStartScraping = async () => {
        // 選択された職種名を取得
        const selectedJobTypeNames = currentJobTypeCategories
            .filter(cat => state.selectedJobTypes.has(cat.id))
            .map(cat => cat.name);

        // 設定を保存（ページ移動時に復元するため）
        setScrapingSettings({
            selectedSite: state.selectedSite,
            selectedPrefectures: Array.from(state.selectedPrefectures),
            selectedJobTypes: Array.from(state.selectedJobTypes),
            selectedRanks: Array.from(state.selectedRanks),
            salaryFilter: state.salaryFilter,
            employeesFilter: state.employeesFilter,
            jobUpdatedFilter: state.jobUpdatedFilter,
        });

        await startScraping({
            sources: [state.selectedSite],  // 単一サイト
            prefectures: state.selectedPrefectures.size > 0 ? Array.from(state.selectedPrefectures) : undefined,
            jobTypes: selectedJobTypeNames.length > 0 ? selectedJobTypeNames : undefined,
            rankFilter: state.selectedRanks.size < 3 ? Array.from(state.selectedRanks) : undefined,
            minSalary: isFilterSupported('salary') && state.salaryFilter !== 'all' ? parseInt(state.salaryFilter) : undefined,
            employeeRange: isFilterSupported('employees') && state.employeesFilter !== 'all' ? state.employeesFilter : undefined,
        });
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-foreground">Scraping Settings</h1>
            </div>

            {/* Progress Panel - Show when running */}
            {isScrapingRunning && scrapingProgress && (
                <ProgressPanel progress={scrapingProgress} />
            )}

            {/* Target Sites */}
            <Card className="p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">対象サイト</h2>
                    <span className="text-sm text-muted-foreground">1サイトを選択</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(siteInfo) as SiteKey[]).map((site) => {
                        const info = siteInfo[site];
                        const isSelected = state.selectedSite === site;
                        return (
                            <button
                                key={site}
                                onClick={() => selectSite(site)}
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
                    {/* 勤務地選択ボタン */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            勤務地
                        </label>
                        <Button
                            variant="outline"
                            className={cn(
                                'w-full h-12 rounded-xl justify-between',
                                state.selectedPrefectures.size > 0 && 'border-primary bg-primary/5'
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
                                    state.selectedPrefectures.size === 0 && 'text-muted-foreground'
                                )}>
                                    {getLocationSummary()}
                                </span>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </Button>
                        {state.selectedPrefectures.size > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {Array.from(state.selectedPrefectures).slice(0, 5).map(pref => (
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
                                {state.selectedPrefectures.size > 5 && (
                                    <Badge variant="outline" className="rounded-lg text-xs">
                                        +{state.selectedPrefectures.size - 5}
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
                                state.selectedJobTypes.size > 0 && 'border-primary bg-primary/5'
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
                                    state.selectedJobTypes.size === 0 && 'text-muted-foreground'
                                )}>
                                    {getJobTypeSummary()}
                                </span>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </Button>
                        {state.selectedJobTypes.size > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {currentJobTypeCategories
                                    .filter(cat => state.selectedJobTypes.has(cat.id))
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
                                {state.selectedJobTypes.size > 3 && (
                                    <Badge variant="outline" className="rounded-lg text-xs">
                                        +{state.selectedJobTypes.size - 3}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ランクフィルター */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-500" />
                            保存対象ランク
                            <span className="text-xs text-muted-foreground font-normal">(企業の採用予算規模)</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {rankOptions.map(option => (
                                <label
                                    key={option.rank}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                        state.selectedRanks.has(option.rank)
                                            ? `${option.color} border-primary`
                                            : 'border-border hover:border-muted-foreground/30 opacity-50',
                                        isScrapingRunning && 'cursor-not-allowed'
                                    )}
                                >
                                    <Checkbox
                                        checked={state.selectedRanks.has(option.rank)}
                                        onCheckedChange={() => toggleRank(option.rank)}
                                        disabled={isScrapingRunning}
                                    />
                                    <span className="text-lg">{option.icon}</span>
                                    <div className="flex-1">
                                        <span className="text-sm font-bold">Rank {option.rank}</span>
                                        <p className="text-xs text-muted-foreground">{option.label}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {state.selectedRanks.size < 3 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                ※ 選択されていないランクの企業はスクレイピング時にスキップされます
                            </p>
                        )}
                    </div>

                    {/* 追加フィルター（給与・規模・更新日） */}
                    <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border mt-4">
                        {/* 給与フィルター */}
                        <div className={cn(!isFilterSupported('salary') && 'opacity-50')}>
                            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                <Banknote className="h-4 w-4 text-green-500" />
                                年収下限
                                {!isFilterSupported('salary') && (
                                    <span className="text-xs text-muted-foreground">(非対応)</span>
                                )}
                            </label>
                            <Select
                                value={isFilterSupported('salary') ? state.salaryFilter : 'all'}
                                onValueChange={setSalaryFilter}
                                disabled={isScrapingRunning || !isFilterSupported('salary')}
                            >
                                <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder="指定なし" />
                                </SelectTrigger>
                                <SelectContent>
                                    {salaryOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 企業規模フィルター */}
                        <div className={cn(!isFilterSupported('employees') && 'opacity-50')}>
                            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                <Users className="h-4 w-4 text-blue-500" />
                                企業規模
                                {!isFilterSupported('employees') && (
                                    <span className="text-xs text-muted-foreground">(非対応)</span>
                                )}
                            </label>
                            <Select
                                value={isFilterSupported('employees') ? state.employeesFilter : 'all'}
                                onValueChange={setEmployeesFilter}
                                disabled={isScrapingRunning || !isFilterSupported('employees')}
                            >
                                <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder="指定なし" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employeeOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 求人更新日フィルター */}
                        <div className={cn(!isFilterSupported('jobUpdated') && 'opacity-50')}>
                            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-orange-500" />
                                更新日
                                {!isFilterSupported('jobUpdated') && (
                                    <span className="text-xs text-muted-foreground">(非対応)</span>
                                )}
                            </label>
                            <Select
                                value={isFilterSupported('jobUpdated') ? state.jobUpdatedFilter : 'all'}
                                onValueChange={setJobUpdatedFilter}
                                disabled={isScrapingRunning || !isFilterSupported('jobUpdated')}
                            >
                                <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder="指定なし" />
                                </SelectTrigger>
                                <SelectContent>
                                    {jobUpdatedOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {(state.salaryFilter !== 'all' || state.employeesFilter !== 'all' || state.jobUpdatedFilter !== 'all') && (
                        <p className="text-xs text-muted-foreground mt-2">
                            ※ フィルター条件に合わない求人はスクレイピング時にスキップされます
                        </p>
                    )}
                </div>
            </Card>

            {/* Action Button */}
            <div className="pt-2">
                {!isScrapingRunning ? (
                    <Button
                        onClick={handleStartScraping}
                        className="w-full h-14 rounded-xl text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all"
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
            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
                selectedPrefectures={state.selectedPrefectures}
                togglePrefecture={togglePrefecture}
                toggleRegion={toggleRegion}
                clearPrefectures={clearPrefectures}
            />

            {/* 職種選択モーダル */}
            <JobTypeModal
                isOpen={isJobTypeModalOpen}
                onClose={() => setIsJobTypeModalOpen(false)}
                categories={currentJobTypeCategories}
                selectedJobTypes={state.selectedJobTypes}
                toggleJobType={toggleJobType}
                clearJobTypes={clearJobTypes}
            />
        </div>
    );
}
