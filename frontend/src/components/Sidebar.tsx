import { useState } from 'react';
import {
  LayoutDashboard,
  Server,
  Globe,
  BarChart3,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'nodes',      label: 'Nodes',      icon: Server },
  { id: 'agentless',  label: 'Agentless',  icon: Globe },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'alerts',     label: 'Alerts',     icon: Bell },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeId: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ activeId, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} role="navigation" aria-label="Main navigation">
      {/* Brand */}
      <div className="sidebar__brand">
        <span className="sidebar__logo">⬡</span>
        {!collapsed && <span className="sidebar__title">Uptime LoFi</span>}
      </div>

      {/* Main Nav */}
      <nav className="sidebar__nav" aria-label="Primary menu">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom Nav */}
      <nav className="sidebar__nav sidebar__nav--bottom" aria-label="Settings menu">
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`sidebar__item ${activeId === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.6} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {/* Collapse Toggle */}
        <button
          className="sidebar__item sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </nav>
    </aside>
  );
}
