import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vitest";

type TestEnv = typeof env & {
  DB: D1Database;
  TEST_MIGRATIONS?: Array<{ name?: string; content?: string } | string>;
};

beforeAll(async () => {
  const testEnv = env as TestEnv;
  // Try to use the standard built-in approach
  try {
    await applyD1Migrations(testEnv.DB, (testEnv.TEST_MIGRATIONS ?? []) as any);
  } catch (e) {
    console.error("applyD1Migrations failed:", e);
    // Fallback: manually execute the statements
    const migrations = testEnv.TEST_MIGRATIONS;
    if (migrations) {
       for (const migration of migrations) {
          try {
             await testEnv.DB.exec(typeof migration === "string" ? migration : (migration.content ?? ""));
          } catch(err) {
             console.log("Migration manual fallback error:", err);
          }
       }
    }
  }
});
