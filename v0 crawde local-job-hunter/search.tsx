'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock } from 'lucide-react';

export function SearchPage() {
  const [keyword, setKeyword] = useState('');
  const [area, setArea] = useState('none');
  const [category, setCategory] = useState('none');
  const [selectedSites, setSelectedSites] = useState({
    mynavi: true,
    rikunabi: true,
    doda: true,
  });
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState(0);
  const [scrapingStats, setScrapingStats] = useState({
    discovered: 42,
    new: 15,
    duplicate: 27,
    elapsedTime: '5分32秒',
  });

  const handleSiteChange = (site: keyof typeof selectedSites) => {
    setSelectedSites((prev) => ({
      ...prev,
      [site]: !prev[site],
    }));
  };

  const handleStartScraping = () => {
    setIsScraping(true);
    setScrapingProgress(0);
    // Simulate scraping progress
    const interval = setInterval(() => {
      setScrapingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 1000);
  };

  const handleStopScraping = () => {
    setIsScraping(false);
    setScrapingProgress(0);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">スクレイピング設定</h1>
        <p className="mt-2 text-muted-foreground">
          求人サイトから企業情報を取得します
        </p>
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
                    <SelectItem value="tokyo">東京都</SelectItem>
                    <SelectItem value="osaka">大阪府</SelectItem>
                    <SelectItem value="aichi">愛知県</SelectItem>
                    <SelectItem value="fukuoka">福岡県</SelectItem>
                    <SelectItem value="hokkaido">北海道</SelectItem>
                    <SelectItem value="kanagawa">神奈川県</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">職種</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category" className="mt-2">
                    <SelectValue placeholder="指定なし" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">指定なし</SelectItem>
                    <SelectItem value="it">IT・エンジニア</SelectItem>
                    <SelectItem value="sales">営業</SelectItem>
                    <SelectItem value="admin">事務・管理</SelectItem>
                    <SelectItem value="manufacturing">製造・技術</SelectItem>
                    <SelectItem value="medical">医療・福祉</SelectItem>
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

              {!isScraping ? (
                <Button
                  onClick={handleStartScraping}
                  className="w-full bg-blue-600 py-6 text-base font-semibold text-white hover:bg-blue-700"
                >
                  スクレイピング開始
                </Button>
              ) : (
                <Button
                  onClick={handleStopScraping}
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
        {isScraping && (
          <Card className="sticky top-8 h-fit p-6">
            <h2 className="mb-4 text-lg font-semibold">実行中...</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>進捗</span>
                  <span className="font-semibold">
                    {Math.round(scrapingProgress)}%
                  </span>
                </div>
                <Progress value={scrapingProgress} className="h-2" />
              </div>

              <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                <p>
                  <span className="font-medium">発見: </span>
                  <span className="text-blue-600">{scrapingStats.discovered}件</span>
                </p>
                <p>
                  <span className="font-medium">新規: </span>
                  <span className="text-green-600">{scrapingStats.new}件</span>
                </p>
                <p>
                  <span className="font-medium">重複: </span>
                  <span className="text-gray-600">{scrapingStats.duplicate}件</span>
                </p>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm">
                  <span className="font-medium">経過時間: </span>
                  <span>{scrapingStats.elapsedTime}</span>
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
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  badgeColor: string;
  badgeText: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex-1">{label}</span>
      <Badge className={`${badgeColor} border-0`}>{badgeText}</Badge>
    </div>
  );
}
