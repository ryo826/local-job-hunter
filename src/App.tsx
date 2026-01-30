import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { ListPage } from './pages/ListPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './stores/appStore';
import './index.css';

function App() {
  const { fetchCompanies, setupScrapingListener } = useAppStore();

  useEffect(() => {
    fetchCompanies();
    setupScrapingListener();
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="ml-64 p-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/list" element={<ListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
