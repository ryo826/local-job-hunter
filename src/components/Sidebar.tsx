import { NavLink } from 'react-router-dom';
import { Home, Search, Table2, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';

const navigationItems = [
    { label: 'Dashboard', href: '/', icon: Home },
    { label: 'Search', href: '/search', icon: Search },
    { label: 'List', href: '/list', icon: Table2 },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    return (
        <>
            {/* Sidebar */}
            <div
                className={cn(
                    'fixed left-0 top-0 h-screen border-r border-border bg-card flex flex-col transition-all duration-300 ease-in-out z-50 overflow-hidden',
                    collapsed ? 'w-0' : 'w-64'
                )}
            >
                {/* Logo/Header */}
                <div className="flex items-center gap-3 border-b border-border px-6 py-5 min-w-64">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                        <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div className="overflow-hidden flex-1">
                        <h1 className="text-base font-bold text-foreground whitespace-nowrap">Job Hunter</h1>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1 px-3 py-4 min-w-64">
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
                                        <Icon className="h-5 w-5 flex-shrink-0" />
                                        <span className="whitespace-nowrap">{item.label}</span>
                                    </Button>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Footer with Theme Toggle */}
                <div className="border-t border-border p-4 min-w-64">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">テーマ</span>
                        <ThemeToggle />
                    </div>
                </div>
            </div>

            {/* Toggle button - always visible on the edge */}
            <Button
                variant="outline"
                size="icon"
                className={cn(
                    'fixed top-1/2 -translate-y-1/2 h-12 w-6 rounded-r-lg rounded-l-none border-l-0 bg-card hover:bg-accent z-50 transition-all duration-300 shadow-md',
                    collapsed ? 'left-0' : 'left-64'
                )}
                onClick={onToggle}
                title={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            >
                {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                ) : (
                    <ChevronLeft className="h-4 w-4" />
                )}
            </Button>
        </>
    );
}
