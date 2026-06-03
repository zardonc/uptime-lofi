// ═══════════════════════════════════════════
// Mock Data Layer — Uptime LoFi Dashboard
// ═══════════════════════════════════════════

import type { TrendPoint } from '../src/api/types';

export type MonitorStatus = 'online' | 'degraded' | 'offline' | 'paused';

export interface MockMonitor {
  id: string;
  name: string;
  status: MonitorStatus;
  lastHeartbeat: string;
  pingMs: number;
  cpuUsage: number;
  memUsage: number;
  uptimeRatio: number;
}

export type { TrendPoint };

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'online' | 'offline' | 'warning' | 'recovery';
  monitor: string;
  message: string;
}

// ── Monitors ──
export const mockMonitors: MockMonitor[] = [
  {
    id: 'monitor-sg-01',
    name: 'Singapore VPS',
    status: 'online',
    lastHeartbeat: '12 seconds ago',
    pingMs: 34,
    cpuUsage: 23.4,
    memUsage: 61.2,
    uptimeRatio: 99.97,
  },
  {
    id: 'monitor-us-02',
    name: 'US East EC2',
    status: 'online',
    lastHeartbeat: '8 seconds ago',
    pingMs: 112,
    cpuUsage: 67.1,
    memUsage: 78.3,
    uptimeRatio: 99.82,
  },
  {
    id: 'monitor-jp-03',
    name: 'Tokyo Lightsail',
    status: 'degraded',
    lastHeartbeat: '3 minutes ago',
    pingMs: 289,
    cpuUsage: 91.7,
    memUsage: 88.5,
    uptimeRatio: 98.14,
  },
  {
    id: 'monitor-de-04',
    name: 'Frankfurt Hetzner',
    status: 'offline',
    lastHeartbeat: '27 minutes ago',
    pingMs: 0,
    cpuUsage: 0,
    memUsage: 0,
    uptimeRatio: 94.55,
  },
];

// ── 24h Trend Data (every hour) ──
const hours = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00`;
});

const jitter = (base: number, variance: number) =>
  Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10;

export const mockTrendData: TrendPoint[] = hours.map((time, i) => ({
  time,
  cpu: jitter(35 + Math.sin(i / 3) * 18, 10),
  mem: jitter(58 + Math.cos(i / 4) * 12, 6),
  ping: Math.round(jitter(45 + Math.sin(i / 2) * 25, 15)),
}));

// ── Activity Feed ──
export const mockActivity: ActivityEvent[] = [
  {
    id: 'evt-1',
    timestamp: '2 min ago',
    type: 'warning',
    monitor: 'Tokyo Lightsail',
    message: 'CPU usage exceeded 90% threshold',
  },
  {
    id: 'evt-2',
    timestamp: '18 min ago',
    type: 'offline',
    monitor: 'Frankfurt Hetzner',
    message: 'Monitor stopped reporting heartbeats',
  },
  {
    id: 'evt-3',
    timestamp: '1 hour ago',
    type: 'recovery',
    monitor: 'US East EC2',
    message: 'Recovered from brief network interruption',
  },
  {
    id: 'evt-4',
    timestamp: '3 hours ago',
    type: 'online',
    monitor: 'Singapore VPS',
    message: 'Probe deployed and reporting successfully',
  },
  {
    id: 'evt-5',
    timestamp: '6 hours ago',
    type: 'warning',
    monitor: 'US East EC2',
    message: 'Memory usage at 82%, approaching threshold',
  },
];

// ── Aggregate Stats ──
export const mockStats = {
  totalMonitors: mockMonitors.length,
  onlineMonitors: mockMonitors.filter((monitor) => monitor.status === 'online').length,
  avgUptime: +(mockMonitors.reduce((sum, monitor) => sum + monitor.uptimeRatio, 0) / mockMonitors.length).toFixed(2),
  avgPing: Math.round(
    mockMonitors.filter((monitor) => monitor.pingMs > 0).reduce((sum, monitor) => sum + monitor.pingMs, 0) /
      mockMonitors.filter((monitor) => monitor.pingMs > 0).length
  ),
};
