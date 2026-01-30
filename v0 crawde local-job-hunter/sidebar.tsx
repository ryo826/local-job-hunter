'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Table2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navigationItems = [
  {
    label: 'ダッシュボード',
    href: '/',
    icon: Home,
  },
  {
    label: '検索',
    href: '/search',
    icon: Search,
  },
  {
    label: 'リスト',
    href: '/list',
    icon: Table2,
  },
  {
    label: '設定',
    href: '/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 h-screen w-64 border-r border-border bg-sidebar text-sidebar-foreground">
      {/* Logo/Header */}
      <div className="flex items-center justify-center border-b border-sidebar-border px-6 py-6">
        <h1 className="text-lg font-bold">求人ハンター</h1>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 px-3 py-6">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'default' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3',
                  isActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
