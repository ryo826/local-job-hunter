import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ThemeProvider } from './components/theme-provider';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { ListPage } from './pages/ListPage';
import { useAppStore } from './stores/appStore';
import { cn } from './lib/utils';
import './index.css';

function App() {
  const { fetchCompanies, setupScrapingListener } = useAppStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Restore from localStorage
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    fetchCompanies();
    setupScrapingListener();
  }, []);

  const handleSidebarToggle = () => {
    setSidebarCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebar-collapsed', String(newValue));
      return newValue;
    });
  };

  return (
    <ThemeProvider defaultTheme="light" storageKey="job-hunter-theme">
      <HashRouter>
        <div className="min-h-screen bg-background">
          <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />
          <main
            className={cn(
              'p-6 transition-all duration-300 ease-in-out',
              sidebarCollapsed ? 'ml-0' : 'ml-64'
            )}
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/list" element={<ListPage sidebarCollapsed={sidebarCollapsed} />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
