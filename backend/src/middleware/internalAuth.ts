import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export async function internalAuthMiddleware(c: Context, next: Next) {
  const expected = c.env.INTERNAL_API_KEY as string | undefined;
  if (!expected) {
    throw new HTTPException(500, { message: "INTERNAL_API_KEY is not configured on the edge" });
  }

  const actual = c.req.header("x-uptime-lofi-internal-key");
  if (!actual || !await timingSafeEqual(actual, expected)) {
    throw new HTTPException(401, { message: "Unauthorized internal request" });
  }

  return next();
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
