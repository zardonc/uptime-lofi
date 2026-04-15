import { env } from "cloudflare:workers";

export default async function () {
  const migrations: string[] = (env as any).TEST_MIGRATIONS;
  for (const migration of migrations) {
    await env.DB.exec(migration);
  }
}
