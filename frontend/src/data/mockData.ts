// ═══════════════════════════════════════════
// Mock Data Layer — Uptime LoFi Dashboard
// ═══════════════════════════════════════════

import type { TrendPoint } from '../api/types';

export type NodeStatus = 'online' | 'degraded' | 'offline' | 'paused';

export interface MonitorNode {
  id: string;
  name: string;
  status: NodeStatus;
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
  node: string;
  message: string;
}

// ── Nodes ──
export const mockNodes: MonitorNode[] = [
  {
    id: 'node-sg-01',
    name: 'Singapore VPS',
    status: 'online',
    lastHeartbeat: '12 seconds ago',
    pingMs: 34,
    cpuUsage: 23.4,
    memUsage: 61.2,
    uptimeRatio: 99.97,
  },
  {
    id: 'node-us-02',
    name: 'US East EC2',
    status: 'online',
    lastHeartbeat: '8 seconds ago',
    pingMs: 112,
    cpuUsage: 67.1,
    memUsage: 78.3,
    uptimeRatio: 99.82,
  },
  {
    id: 'node-jp-03',
    name: 'Tokyo Lightsail',
    status: 'degraded',
    lastHeartbeat: '3 minutes ago',
    pingMs: 289,
    cpuUsage: 91.7,
    memUsage: 88.5,
    uptimeRatio: 98.14,
  },
  {
    id: 'node-de-04',
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
    node: 'Tokyo Lightsail',
    message: 'CPU usage exceeded 90% threshold',
  },
  {
    id: 'evt-2',
    timestamp: '18 min ago',
    type: 'offline',
    node: 'Frankfurt Hetzner',
    message: 'Node stopped responding to heartbeats',
  },
  {
    id: 'evt-3',
    timestamp: '1 hour ago',
    type: 'recovery',
    node: 'US East EC2',
    message: 'Recovered from brief network interruption',
  },
  {
    id: 'evt-4',
    timestamp: '3 hours ago',
    type: 'online',
    node: 'Singapore VPS',
    message: 'Probe deployed and reporting successfully',
  },
  {
    id: 'evt-5',
    timestamp: '6 hours ago',
    type: 'warning',
    node: 'US East EC2',
    message: 'Memory usage at 82%, approaching threshold',
  },
];

// ── Aggregate Stats ──
export const mockStats = {
  totalNodes: mockNodes.length,
  onlineNodes: mockNodes.filter((n) => n.status === 'online').length,
  avgUptime: +(mockNodes.reduce((s, n) => s + n.uptimeRatio, 0) / mockNodes.length).toFixed(2),
  avgPing: Math.round(
    mockNodes.filter((n) => n.pingMs > 0).reduce((s, n) => s + n.pingMs, 0) /
      mockNodes.filter((n) => n.pingMs > 0).length
  ),
};
