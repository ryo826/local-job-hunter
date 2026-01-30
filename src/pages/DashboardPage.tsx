import { Card } from '@/components/ui/card';
import { useAppStore } from '@/stores/appStore';

export function DashboardPage() {
    const { companies } = useAppStore();

    // Calculate stats from actual data
    const stats = {
        totalCompanies: companies.length,
        newCompanies: companies.filter((c) => c.status === 'new').length,
        contacted: companies.filter((c) => c.status === 'contacted').length,
        promising: companies.filter((c) => c.status === 'promising' || c.status === 'meeting').length,
        rejected: companies.filter((c) => c.status === 'lost').length,
        ngCandidates: companies.filter((c) => c.status === 'ng').length,
    };

    // Source breakdown
    const sourceStats = {
        mynavi: companies.filter((c) => c.source === 'mynavi').length,
        rikunabi: companies.filter((c) => c.source === 'rikunabi').length,
        doda: companies.filter((c) => c.source === 'doda').length,
        green: companies.filter((c) => c.source === 'green').length,
    };

    const total = stats.totalCompanies || 1;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">ダッシュボード</h1>
                <p className="mt-2 text-muted-foreground">営業パイプラインの概要</p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard label="全企業数" value={stats.totalCompanies} color="bg-blue-50 text-blue-900" />
                <StatCard label="新規" value={stats.newCompanies} color="bg-blue-50 text-blue-900" />
                <StatCard label="連絡済" value={stats.contacted} color="bg-yellow-50 text-yellow-900" />
                <StatCard label="見込あり" value={stats.promising} color="bg-green-50 text-green-900" />
                <StatCard label="却下" value={stats.rejected} color="bg-gray-50 text-gray-900" />
                <StatCard label="NG" value={stats.ngCandidates} color="bg-red-50 text-red-900" />
            </div>

            {/* Source Breakdown */}
            <Card className="p-6">
                <h2 className="mb-4 text-xl font-semibold">ソース別企業数</h2>
                <div className="space-y-4">
                    <SourceRow name="マイナビ転職" count={sourceStats.mynavi} percentage={(sourceStats.mynavi / total) * 100} />
                    <SourceRow name="リクナビNEXT" count={sourceStats.rikunabi} percentage={(sourceStats.rikunabi / total) * 100} />
                    <SourceRow name="doda" count={sourceStats.doda} percentage={(sourceStats.doda / total) * 100} />
                    <SourceRow name="Green" count={sourceStats.green} percentage={(sourceStats.green / total) * 100} />
                </div>
            </Card>

            {/* Info */}
            {stats.totalCompanies === 0 && (
                <Card className="flex items-center justify-center p-12">
                    <p className="text-center text-muted-foreground">
                        まだデータがありません。「検索」ページからスクレイピングを開始してください。
                    </p>
                </Card>
            )}
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Card className={`p-6 ${color}`}>
            <p className="text-sm font-medium opacity-70">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
        </Card>
    );
}

function SourceRow({ name, count, percentage }: { name: string; count: number; percentage: number }) {
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
                <div className={`h-full ${colorMap[name] || 'bg-gray-500'}`} style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}
