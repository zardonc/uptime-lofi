import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vitest";

beforeAll(async () => {
  // Try to use the standard built-in approach
  try {
    await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS);
  } catch (e) {
    console.error("applyD1Migrations failed:", e);
    // Fallback: manually execute the statements
    const migrations = (env as any).TEST_MIGRATIONS;
    if (migrations) {
       for (const migration of migrations) {
          try {
             await env.DB.exec(migration.name ? migration.content : migration);
          } catch(err) {
             console.log("Migration manual fallback error:", err);
          }
       }
    }
  }
});
