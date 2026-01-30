'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DashboardStats {
  totalCompanies: number;
  newCompanies: number;
  contacted: number;
  promising: number;
  rejected: number;
  ngCandidates: number;
}

export function Dashboard() {
  // Sample stats - in a real app, these would come from the database
  const stats: DashboardStats = {
    totalCompanies: 1247,
    newCompanies: 42,
    contacted: 156,
    promising: 89,
    rejected: 120,
    ngCandidates: 28,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="mt-2 text-muted-foreground">営業パイプラインの概要</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="全企業数"
          value={stats.totalCompanies}
          color="bg-blue-50 text-blue-900"
        />
        <StatCard
          label="新規"
          value={stats.newCompanies}
          color="bg-blue-50 text-blue-900"
        />
        <StatCard
          label="連絡済"
          value={stats.contacted}
          color="bg-yellow-50 text-yellow-900"
        />
        <StatCard
          label="見込あり"
          value={stats.promising}
          color="bg-green-50 text-green-900"
        />
        <StatCard
          label="却下"
          value={stats.rejected}
          color="bg-gray-50 text-gray-900"
        />
        <StatCard
          label="NG"
          value={stats.ngCandidates}
          color="bg-red-50 text-red-900"
        />
      </div>

      {/* Source Breakdown */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">ソース別企業数</h2>
        <div className="space-y-4">
          <SourceRow name="マイナビ転職" count={520} percentage={42} />
          <SourceRow name="リクナビNEXT" count={380} percentage={30} />
          <SourceRow name="doda" count={347} percentage={28} />
        </div>
      </Card>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">最近のアクティビティ</h2>
        <div className="space-y-3 text-sm">
          <ActivityItem
            description="スクレイピング実行: 42件の新規企業を発見"
            time="1時間前"
          />
          <ActivityItem
            description="企業「テック株式会社」のステータスを「見込あり」に変更"
            time="3時間前"
          />
          <ActivityItem
            description="スクレイピング実行: 28件の新規企業を発見"
            time="昨日"
          />
          <ActivityItem
            description="NG設定を5個追加しました"
            time="2日前"
          />
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className={`p-6 ${color}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}

function SourceRow({
  name,
  count,
  percentage,
}: {
  name: string;
  count: number;
  percentage: number;
}) {
  const colorMap: Record<string, string> = {
    'マイナビ転職': 'bg-blue-500',
    'リクナビNEXT': 'bg-green-500',
    'doda': 'bg-orange-500',
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">{count}件</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${colorMap[name] || 'bg-gray-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ActivityItem({
  description,
  time,
}: {
  description: string;
  time: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-border pb-3 last:border-0">
      <span className="text-foreground">{description}</span>
      <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
        {time}
      </span>
    </div>
  );
}
