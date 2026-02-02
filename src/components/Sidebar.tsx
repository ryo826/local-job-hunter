import { NavLink } from 'react-router-dom';
import { Home, Search, Table2, Target, PanelLeftClose, PanelLeft } from 'lucide-react';
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
                    'fixed left-0 top-0 h-screen border-r border-border bg-card flex flex-col transition-all duration-300 ease-in-out z-50',
                    collapsed ? 'w-0 -translate-x-full' : 'w-64'
                )}
            >
                {/* Logo/Header */}
                <div className="flex items-center gap-3 border-b border-border px-6 py-5 min-w-64">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                        <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div className="overflow-hidden">
                        <h1 className="text-base font-bold text-foreground whitespace-nowrap">Job Hunter</h1>
                    </div>
                    {/* Close button inside sidebar */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 rounded-lg hover:bg-accent flex-shrink-0"
                        onClick={onToggle}
                        title="サイドバーを閉じる"
                    >
                        <PanelLeftClose className="h-4 w-4" />
                    </Button>
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

            {/* Toggle button when sidebar is collapsed */}
            <Button
                variant="ghost"
                size="icon"
                className={cn(
                    'fixed top-4 left-4 h-10 w-10 rounded-xl bg-card border border-border shadow-sm hover:bg-accent z-50 transition-all duration-300',
                    collapsed ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
                )}
                onClick={onToggle}
                title="サイドバーを開く"
            >
                <PanelLeft className="h-5 w-5" />
            </Button>
        </>
    );
}
