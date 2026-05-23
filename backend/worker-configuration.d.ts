interface Env {
  DB: D1Database;
  API_SECRET_KEY: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  EMERGENCY_UNLOCK_KEY?: string;
  CORS_ORIGINS?: string;
  SESSION_BLACKLIST: KVNamespace;
  STATISTICS_CACHE?: KVNamespace;
  TEST_MIGRATIONS?: unknown;
}
