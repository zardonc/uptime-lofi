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
  interval_sec: z.number().int().min(30).max(86400).default(60),
  timeout_sec: z.number().int().min(1).max(300).default(10),
  public_visible: z.boolean().default(true),
  latest: monitorLatestMetricsSchema,
  visibility: monitorVisibilitySchema,
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const agentMonitorConfigSchema = z.object({
  platform: z.enum(["linux/amd64", "linux/arm64", "darwin/amd64", "darwin/arm64"]).optional(),
  generated_by: z.string().trim().optional(),
  credential_version: z.number().int().positive().optional(),
}).strict();

export const httpMonitorConfigSchema = z.object({
  url: z.string().url(),
  expected_status: z.number().int().min(100).max(599).optional().default(200),
}).strict();

export const tcpMonitorConfigSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
}).strict();

export const createMonitorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: monitorTypeSchema,
  interval_sec: z.number().int().min(30).max(86400).optional().default(60),
  timeout_sec: z.number().int().min(1).max(300).optional().default(10),
  config: z.unknown().optional(),
  public_visible: z.boolean().optional().default(true),
}).strict();

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  interval_sec: z.number().int().min(30).max(86400).optional(),
  timeout_sec: z.number().int().min(1).max(300).optional(),
  config: z.unknown().optional(),
  public_visible: z.boolean().optional(),
}).strict();

export const publicMonitorSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: monitorTypeSchema.optional(),
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

export const alertConditionSchema = z.enum(["offline", "latency", "http_status", "cpu", "memory"]);

export const silentHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
}).strict();

export const alertRuleSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  monitor_id: z.string().trim().min(1).nullable(),
  condition: alertConditionSchema,
  params: z.record(z.string(), z.unknown()),
  channel_ids: z.array(z.string().trim().min(1)),
  enabled: z.boolean(),
  severity: z.enum(["info", "warning", "critical"]),
  confirm_for_sec: z.number().int().min(0),
  repeat_interval_sec: z.number().int().min(0),
  silent_hours: silentHoursSchema.nullable(),
  timezone: z.string().trim().min(1),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
}).strict();

export const alertEventSchema = backendSourceSchema.extend({
  id: z.string().trim().min(1),
  rule_id: z.string().trim().min(1),
  monitor_id: z.string().trim().min(1),
  monitor_name: z.string().trim().min(1),
  rule_name: z.string().trim().min(1),
  event_type: z.enum(["pending", "firing", "suppressed", "recovered"]),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().trim().min(1),
  notification_status: z.enum(["pending", "suppressed", "not_required"]),
  created_at: z.number().int().nonnegative(),
}).strict();

export const createAlertRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  monitor_id: z.string().trim().min(1),
  condition: alertConditionSchema,
  params: z.record(z.string(), z.unknown()).optional().default({}),
  channel_ids: z.array(z.string().trim().min(1)).optional().default([]),
  enabled: z.boolean().optional().default(true),
  severity: z.enum(["info", "warning", "critical"]).optional().default("warning"),
  confirm_for_sec: z.number().int().min(0).max(86400).optional().default(0),
  repeat_interval_sec: z.number().int().min(0).max(604800).optional().default(3600),
  silent_hours: silentHoursSchema.nullable().optional().default(null),
  timezone: z.string().trim().min(1).max(64).optional().default("UTC"),
}).strict();

export const updateAlertRuleSchema = createAlertRuleSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

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

export const notificationChannelTypeSchema = z.enum(["webhook", "telegram", "email"]);

export const createNotificationChannelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: notificationChannelTypeSchema,
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

export const updateNotificationChannelSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

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
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
export type PublicMonitor = z.infer<typeof publicMonitorSchema>;
export type PublicStatusResponse = z.infer<typeof publicStatusResponseSchema>;
export type AlertCondition = z.infer<typeof alertConditionSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertEvent = z.infer<typeof alertEventSchema>;
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;
export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>;
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>;
export type StatisticsSummary = z.infer<typeof statisticsSummarySchema>;
export type StructuredError = z.infer<typeof structuredErrorSchema>;
