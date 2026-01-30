import React, { useState } from 'react';
import { sourceOptions } from '../config/settings';
import { useAppStore } from '../stores/appStore';

export const ScrapingPanel: React.FC = () => {
    const {
        isScrapingRunning,
        scrapingProgress,
        startScraping,
        stopScraping,
    } = useAppStore();

    const [selectedSources, setSelectedSources] = useState<string[]>(['mynavi']);
    const [keywords, setKeywords] = useState('');
    const [location, setLocation] = useState('');

    const handleSourceToggle = (source: string) => {
        setSelectedSources((prev) =>
            prev.includes(source)
                ? prev.filter((s) => s !== source)
                : [...prev, source]
        );
    };

    const handleStart = async () => {
        if (selectedSources.length === 0) {
            alert('スクレイピングソースを選択してください');
            return;
        }
        await startScraping({
            sources: selectedSources,
            keywords: keywords || undefined,
            location: location || undefined,
        });
    };

    const progressPercentage = scrapingProgress
        ? Math.min(100, (scrapingProgress.current / Math.max(scrapingProgress.total, 1)) * 100)
        : 0;

    return (
        <div className="glass-card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🔄</span>
                スクレイピング設定
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Sources */}
                <div>
                    <label className="block text-sm text-gray-400 mb-2">ソース選択</label>
                    <div className="flex flex-wrap gap-2">
                        {sourceOptions.map((source) => (
                            <button
                                key={source.value}
                                className={`btn text-sm ${selectedSources.includes(source.value)
                                        ? 'btn-primary'
                                        : 'btn-secondary'
                                    }`}
                                onClick={() => handleSourceToggle(source.value)}
                                disabled={isScrapingRunning}
                            >
                                {source.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Keywords */}
                <div>
                    <label className="block text-sm text-gray-400 mb-2">キーワード</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="例: エンジニア"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        disabled={isScrapingRunning}
                    />
                </div>

                {/* Location */}
                <div>
                    <label className="block text-sm text-gray-400 mb-2">勤務地</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="例: 東京"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        disabled={isScrapingRunning}
                    />
                </div>
            </div>

            {/* Control buttons */}
            <div className="flex gap-4 mb-4">
                {!isScrapingRunning ? (
                    <button className="btn btn-primary" onClick={handleStart}>
                        🚀 スクレイピング開始
                    </button>
                ) : (
                    <button className="btn btn-danger" onClick={stopScraping}>
                        ⏹ 停止
                    </button>
                )}
            </div>

            {/* Progress */}
            {isScrapingRunning && scrapingProgress && (
                <div className="animate-fadeIn">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>{scrapingProgress.status}</span>
                        <span>
                            新規: {scrapingProgress.newCount} / 重複: {scrapingProgress.duplicateCount}
                        </span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <div className="text-right text-xs text-gray-500 mt-1">
                        {scrapingProgress.source} - {scrapingProgress.current}件処理済み
                    </div>
                </div>
            )}
        </div>
    );
};
