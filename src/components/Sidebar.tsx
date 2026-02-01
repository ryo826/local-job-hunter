import { NavLink } from 'react-router-dom';
import { Home, Search, Table2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';

const navigationItems = [
    { label: 'ダッシュボード', href: '/', icon: Home },
    { label: '検索', href: '/search', icon: Search },
    { label: 'リスト', href: '/list', icon: Table2 },
];

export function Sidebar() {
    return (
        <div className="fixed left-0 top-0 h-screen w-64 border-r border-border bg-card flex flex-col">
            {/* Logo/Header */}
            <div className="flex items-center gap-3 border-b border-border px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-base font-bold text-foreground">求人ハンター</h1>
                    <p className="text-xs text-muted-foreground">Job Hunter Pro</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigationItems.map((item) => {
                    const Icon = item.icon;

                    return (
                        <NavLink key={item.href} to={item.href}>
                            {({ isActive }) => (
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        'w-full justify-start gap-3 h-11 rounded-xl font-medium',
                                        isActive
                                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span>{item.label}</span>
                                </Button>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            {/* Footer with Theme Toggle */}
            <div className="border-t border-border p-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">テーマ</span>
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
