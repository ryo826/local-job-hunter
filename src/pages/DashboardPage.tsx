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
    };

    const total = stats.totalCompanies || 1;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Total Companies" value={stats.totalCompanies} color="bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100" />
                <StatCard label="New" value={stats.newCompanies} color="bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100" />
                <StatCard label="Contacted" value={stats.contacted} color="bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100" />
                <StatCard label="Promising" value={stats.promising} color="bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100" />
                <StatCard label="Rejected" value={stats.rejected} color="bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-gray-100" />
                <StatCard label="NG" value={stats.ngCandidates} color="bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" />
            </div>

            {/* Source Breakdown */}
            <Card className="p-6">
                <h2 className="mb-4 text-xl font-semibold">Companies by Source</h2>
                <div className="space-y-4">
                    <SourceRow name="Mynavi" count={sourceStats.mynavi} percentage={(sourceStats.mynavi / total) * 100} color="bg-sky-500" />
                    <SourceRow name="Rikunabi" count={sourceStats.rikunabi} percentage={(sourceStats.rikunabi / total) * 100} color="bg-emerald-500" />
                    <SourceRow name="doda" count={sourceStats.doda} percentage={(sourceStats.doda / total) * 100} color="bg-orange-500" />
                </div>
            </Card>

            {/* Info */}
            {stats.totalCompanies === 0 && (
                <Card className="flex items-center justify-center p-12">
                    <p className="text-center text-muted-foreground">
                        No data yet. Start scraping from the Search page.
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

function SourceRow({ name, count, percentage, color }: { name: string; count: number; percentage: number; color: string }) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-muted-foreground">{count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}
