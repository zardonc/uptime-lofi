import './index.css';
import { useState } from 'react';
import { Server, Wifi, Activity, Clock } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MetricCard } from './components/MetricCard';
import { TrendChart } from './components/TrendChart';
import { UptimeRing } from './components/UptimeRing';
import { NodeList } from './components/NodeList';
import { ActivityFeed } from './components/ActivityFeed';
import { mockNodes, mockTrendData, mockActivity, mockStats } from './data/mockData';

export default function App() {
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <div className="app-shell">
      <Sidebar activeId={activeNav} onNavigate={setActiveNav} />

      <main className="main-content">
        <div className="dashboard">
          {/* ── Header ── */}
          <header className="dashboard-header animate-in">
            <div>
              <h1>Dashboard</h1>
              <p className="subtitle">System overview and real-time monitoring</p>
            </div>
            <span className="header-timestamp">Last refresh: just now</span>
          </header>

          {/* ── Stats Row ── */}
          <section className="stats-grid">
            <div className="animate-in delay-1">
              <MetricCard
                icon={<Server size={18} />}
                label="Total Nodes"
                value={mockStats.totalNodes}
                trend={{ direction: 'up', text: '+1 this week' }}
              />
            </div>
            <div className="animate-in delay-2">
              <MetricCard
                icon={<Wifi size={18} />}
                label="Online"
                value={mockStats.onlineNodes}
                suffix={` / ${mockStats.totalNodes}`}
              />
            </div>
            <div className="animate-in delay-3">
              <MetricCard
                icon={<Activity size={18} />}
                label="Avg Uptime"
                value={mockStats.avgUptime}
                suffix="%"
                trend={{ direction: 'up', text: '+0.3% vs last week' }}
              />
            </div>
            <div className="animate-in delay-4">
              <MetricCard
                icon={<Clock size={18} />}
                label="Avg Ping"
                value={mockStats.avgPing}
                suffix="ms"
                trend={{ direction: 'down', text: '-8ms improvement' }}
              />
            </div>
          </section>

          {/* ── Charts Row ── */}
          <section className="charts-row">
            <div className="animate-in delay-5">
              <TrendChart data={mockTrendData} />
            </div>
            <div className="animate-in delay-5">
              <UptimeRing percentage={mockStats.avgUptime} />
            </div>
          </section>

          {/* ── Bottom Row ── */}
          <section className="bottom-row">
            <div className="animate-in delay-6">
              <NodeList nodes={mockNodes} />
            </div>
            <div className="animate-in delay-7">
              <ActivityFeed events={mockActivity} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
