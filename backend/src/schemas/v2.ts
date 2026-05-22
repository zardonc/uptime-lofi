import { z } from "zod";

export const backendSourceSchema = z.object({
  backend_id: z.string().trim().min(1),
  backend_label: z.string().trim().min(1),
  backend_type: z.enum(["cloudflare_worker", "custom"]).optional(),
}).strict();

export const monitorTypeSchema = z.enum(["agent", "http", "tcp"]);
export const monitorStatusSchema = z.enum(["online", "degraded", "offline", "paused", "unknown"]);

export const monitorTargetSummarySchema = z.object({
  label: z.string().trim().min(1),
  host: z.string().trim().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  url: z.string().url().optional(),
}).strict();

export const monitorLatestMetricsSchema = z.object({
  checked_at: z.number().int().nonnegative().nullable(),
  latency_ms: z.number().nonnegative().nullable(),
  uptime_ratio: z.number().min(0).max(100).nullable(),
  cpu_percent: z.number().min(0).max(100).nullable(),
  mem_percent: z.number().min(0).max(100).nullable(),
  error_text: z.string().nullable(),
}).strict();

export const monitorVisibilitySchema = z.object({
  public: z.boolean(),
  show_uptime: z.boolean(),
  show_latency: z.boolean(),
  show_incidents: z.boolean(),
}).strict();

export const monitorSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: monitorTypeSchema,
  status: monitorStatusSchema,
  target: monitorTargetSummarySchema,
  latest: monitorLatestMetricsSchema,
  visibility: monitorVisibilitySchema,
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const publicMonitorSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: monitorTypeSchema,
  status: monitorStatusSchema,
  target_label: z.string().trim().min(1).optional(),
  latency_ms: z.number().nonnegative().nullable().optional(),
  uptime_ratio: z.number().min(0).max(100).nullable().optional(),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const publicStatusResponseSchema = z.object({
  status: monitorStatusSchema,
  message: z.string(),
  updated_at: z.number().int().nonnegative(),
  monitors: z.array(publicMonitorSchema),
  incidents: z.array(z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
    started_at: z.number().int().nonnegative(),
    resolved_at: z.number().int().nonnegative().nullable(),
  }).strict()),
}).strict();

export const alertRuleSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  monitor_id: z.string().trim().min(1).nullable(),
  condition: z.enum(["offline", "latency", "http_status", "tcp_timeout", "cpu", "memory"]),
  params: z.record(z.string(), z.unknown()),
  channel_ids: z.array(z.string().trim().min(1)),
  enabled: z.boolean(),
  severity: z.enum(["info", "warning", "critical"]),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const notificationChannelSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["webhook", "telegram", "email"]),
  enabled: z.boolean(),
  has_secret: z.boolean(),
  redacted_label: z.string().nullable(),
  delivery_status: z.enum(["untested", "ok", "failing", "disabled"]),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const statisticsSummarySchema = backendSourceSchema.extend({
  range: z.enum(["24h", "7d", "30d", "custom"]),
  generated_at: z.number().int().nonnegative(),
  total_monitors: z.number().int().nonnegative(),
  online_monitors: z.number().int().nonnegative(),
  incident_count: z.number().int().nonnegative(),
  avg_latency_ms: z.number().nonnegative().nullable(),
  uptime_ratio: z.number().min(0).max(100).nullable(),
}).strict();

export const structuredErrorSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    request_id: z.string().trim().min(1).optional(),
  }).strict(),
}).strict();

export function structuredError(code: string, message: string, requestId?: string) {
  return structuredErrorSchema.parse({
    error: {
      code,
      message,
      ...(requestId ? { request_id: requestId } : {}),
    },
  });
}

export type BackendSource = z.infer<typeof backendSourceSchema>;
export type MonitorType = z.infer<typeof monitorTypeSchema>;
export type MonitorStatus = z.infer<typeof monitorStatusSchema>;
export type Monitor = z.infer<typeof monitorSchema>;
export type PublicMonitor = z.infer<typeof publicMonitorSchema>;
export type PublicStatusResponse = z.infer<typeof publicStatusResponseSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type StatisticsSummary = z.infer<typeof statisticsSummarySchema>;
export type StructuredError = z.infer<typeof structuredErrorSchema>;
