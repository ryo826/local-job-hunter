import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ThemeProvider } from './components/theme-provider';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { ListPage } from './pages/ListPage';
import { useAppStore } from './stores/appStore';
import './index.css';

function App() {
  const { fetchCompanies, setupScrapingListener } = useAppStore();

  useEffect(() => {
    fetchCompanies();
    setupScrapingListener();
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="job-hunter-theme">
      <HashRouter>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <main className="ml-64 p-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/list" element={<ListPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
