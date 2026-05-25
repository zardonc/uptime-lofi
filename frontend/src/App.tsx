import './index.css';
import { useState } from 'react';
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
  const [activeNav, setActiveNav] = useState<PageId>('dashboard');
  const { logout } = useAuth();

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
            setActiveNav(id as PageId);
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
