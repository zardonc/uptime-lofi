export type SessionEnv = {
  readonly PAGES_ADMIN_PASSWORD?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly API_SECRET_KEY?: string;
  readonly PAGES_SESSION_SECRET?: string;
  readonly SESSION_SECRET?: string;
};

export type PagesFunctionContext<Env = Record<string, unknown>> = {
  readonly request: Request;
  readonly env: Env;
  readonly params?: Record<string, string | string[]>;
};

export const SESSION_COOKIE_NAME = "ulo_session";
export const SESSION_TTL_SECONDS = 60 * 60;

type SessionPayload = {
  readonly role: "admin";
  readonly exp: number;
};

export async function verifyAdminPassword(env: SessionEnv, password: string): Promise<boolean> {
  const expected = env.PAGES_ADMIN_PASSWORD ?? env.ADMIN_PASSWORD ?? env.API_SECRET_KEY;
  return Boolean(expected) && await timingSafeEqual(password, expected);
}

export async function createSessionCookie(env: SessionEnv, nowSeconds = currentSeconds()): Promise<string> {
  const payload: SessionPayload = {
    role: "admin",
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, sessionSecret(env));

  return [
    `${SESSION_COOKIE_NAME}=${encodedPayload}.${signature}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function hasValidSession(request: Request, env: SessionEnv, nowSeconds = currentSeconds()): Promise<boolean> {
  const value = readCookie(request, SESSION_COOKIE_NAME);
  if (!value) return false;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return false;

  const expected = await signValue(encodedPayload, sessionSecret(env));
  if (!await timingSafeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>;
    return payload.role === "admin" && typeof payload.exp === "number" && payload.exp > nowSeconds;
  } catch {
    return false;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readPassword(request: Request): Promise<string | null> {
  try {
    const body = await request.json() as { readonly password?: unknown };
    return typeof body.password === "string" ? body.password : null;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }

  return null;
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sessionSecret(env: SessionEnv): string {
  const secret = env.PAGES_SESSION_SECRET ?? env.SESSION_SECRET ?? env.API_SECRET_KEY;
  if (!secret) throw new Error("PAGES_SESSION_SECRET or API_SECRET_KEY is required");
  return secret;
}

async function signValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
