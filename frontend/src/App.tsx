import './index.css';
import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginGate } from './components/LoginGate';
import { Settings } from './components/Settings';
import { MonitorsPage } from './components/MonitorsPage';
import { AlertsPage } from './components/AlertsPage';
import { StatisticsPage } from './components/StatisticsPage';
import { PublicStatus } from './components/PublicStatus';
import { DashboardV2 } from './components/DashboardV2';
import { useAuth } from './hooks/useAuth';

type PageId = 'dashboard' | 'monitors' | 'statistics' | 'alerts' | 'settings';
const pageIds: ReadonlyArray<PageId> = ['dashboard', 'monitors', 'statistics', 'alerts', 'settings'];

function pageFromPath(pathname: string): PageId {
  const page = pathname.replace(/^\/+/, '').split('/')[0];
  return pageIds.includes(page as PageId) ? page as PageId : 'dashboard';
}

function ActivePage({ activeNav }: { readonly activeNav: PageId }) {
  switch (activeNav) {
    case 'monitors':
      return <MonitorsPage />;
    case 'statistics':
      return <StatisticsPage />;
    case 'alerts':
      return <AlertsPage />;
    case 'settings':
      return <Settings />;
    case 'dashboard':
    default:
      return <DashboardV2 />;
  }
}

export default function App() {
  if (window.location.pathname === '/status') {
    return <PublicStatus />;
  }

  return <AdminApp />;
}

function AdminApp() {
  const [activeNav, setActiveNav] = useState<PageId>(() => pageFromPath(window.location.pathname));
  const { logout } = useAuth();

  useEffect(() => {
    const handlePopState = () => setActiveNav(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <LoginGate>
      <div className="app-shell">
        <Sidebar
          activeId={activeNav}
          onNavigate={(id) => {
            if (id === 'logout') {
              logout();
              return;
            }
            const nextPage = id as PageId;
            const nextPath = nextPage === 'dashboard' ? '/' : `/${nextPage}`;
            setActiveNav(nextPage);
            if (window.location.pathname !== nextPath) {
              window.history.pushState({}, '', nextPath);
            }
          }}
        />

        <main className="main-content" role="main">
          <ErrorBoundary>
            <ActivePage activeNav={activeNav} />
          </ErrorBoundary>
        </main>
      </div>
    </LoginGate>
  );
}
