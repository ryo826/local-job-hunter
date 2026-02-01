import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    const toggleTheme = () => {
        if (theme === 'light') {
            setTheme('dark');
        } else if (theme === 'dark') {
            setTheme('light');
        } else {
            // system -> check current preference and toggle opposite
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(isDark ? 'light' : 'dark');
        }
    };

    const isDark = theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-xl hover:bg-accent"
            title={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
        >
            {isDark ? (
                <Sun className="h-5 w-5 text-yellow-500" />
            ) : (
                <Moon className="h-5 w-5 text-slate-600" />
            )}
            <span className="sr-only">テーマを切り替え</span>
        </Button>
    );
}
