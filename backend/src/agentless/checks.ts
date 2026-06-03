import { connect } from "cloudflare:sockets";

const BLOCKED_PORT_25 = 25;
const MAX_PORT = 65535;
export type AgentlessCheckResult = {
  readonly isUp: boolean;
  readonly latencyMs: number | null;
  readonly errorText: string | null;
};

export type HttpCheckConfig = {
  readonly url: string;
  readonly timeout: number;
  readonly expected_status: number;
};

export type TcpCheckConfig = {
  readonly host: string;
  readonly port: number;
  readonly timeout: number;
};

export type ConnectSocket = { readonly close?: () => void | Promise<void> };
export type ConnectFunction = (address: { hostname: string; port: number }) => ConnectSocket | Promise<ConnectSocket>;

function nowMs() {
  return Date.now();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function timeoutSignal(seconds: number) {
  return AbortSignal.timeout(Math.max(1, seconds) * 1000);
}

function isIpv6LinkLocal(host: string) {
  return /^fe[89ab][0-9a-f]?:/i.test(host);
}

function isPrivateHost(host: string) {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".local")
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.startsWith("127.")
    || normalized.startsWith("169.254.")
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || isIpv6LinkLocal(normalized)
    || isPrivateIpv4(normalized);
}

export async function runHttpCheck(config: HttpCheckConfig, fetchImpl: typeof fetch = fetch): Promise<AgentlessCheckResult> {
  const allowed = isHttpTargetAllowed(config.url);
  if (!allowed.allowed) return { isUp: false, latencyMs: null, errorText: allowed.reason ?? "HTTP target is not allowed" };
  try {
    const start = nowMs();
    const response = await fetchImpl(config.url, { signal: timeoutSignal(config.timeout) });
    const latencyMs = Math.max(0, nowMs() - start);
    if (response.status !== config.expected_status) {
      return { isUp: true, latencyMs, errorText: `Expected HTTP ${config.expected_status}, got ${response.status}` };
    }
    return { isUp: true, latencyMs, errorText: null };
  } catch (error) {
    return { isUp: false, latencyMs: null, errorText: errorMessage(error) };
  }
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isTcpTargetAllowed(host: string, port: number): { allowed: boolean; reason?: string } {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return { allowed: false, reason: "Host is required" };
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    return { allowed: false, reason: "Port must be between 1 and 65535" };
  }
  if (port === BLOCKED_PORT_25) return { allowed: false, reason: "Cloudflare Workers TCP blocks port 25" };
  if (normalized === "localhost" || normalized.endsWith(".local")) {
    return { allowed: false, reason: "Cloudflare Workers TCP cannot target localhost or .local hosts" };
  }
  if (normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.")) {
    return { allowed: false, reason: "Cloudflare Workers TCP cannot target loopback addresses" };
  }
  if (isPrivateIpv4(normalized) || normalized.startsWith("fc") || normalized.startsWith("fd") || isIpv6LinkLocal(normalized)) {
    return { allowed: false, reason: "Cloudflare Workers TCP cannot target private network addresses" };
  }
  return { allowed: true };
}

export function isHttpTargetAllowed(rawUrl: string): { allowed: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "HTTP check URL is invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "HTTP checks require http or https URLs" };
  }
  if (isPrivateHost(url.hostname)) {
    return { allowed: false, reason: "HTTP checks cannot target localhost or private network addresses" };
  }
  return { allowed: true };
}

export async function runTcpCheck(
  config: TcpCheckConfig,
  connectImpl: ConnectFunction = connect as unknown as ConnectFunction,
): Promise<AgentlessCheckResult> {
  const allowed = isTcpTargetAllowed(config.host, config.port);
  if (!allowed.allowed) return { isUp: false, latencyMs: null, errorText: allowed.reason ?? "TCP target is not allowed" };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const start = nowMs();
    const socket = await Promise.race([
      connectImpl({ hostname: config.host, port: config.port }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`TCP check timed out after ${config.timeout}s`)), Math.max(1, config.timeout) * 1000);
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    await socket.close?.();
    return { isUp: true, latencyMs: Math.max(0, nowMs() - start), errorText: null };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    return { isUp: false, latencyMs: null, errorText: errorMessage(error) };
  }
}

