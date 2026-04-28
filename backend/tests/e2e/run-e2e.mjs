import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shPath = path.join(scriptDir, 'run-e2e.sh');
const psPath = path.join(scriptDir, 'run-e2e.ps1');

if (process.platform === 'win32') {
  console.log('========================================');
  console.log('  uptime-lofi E2E Test Suite');
  console.log('========================================');
  console.log('[SKIPPED] Canonical Windows E2E path is temporarily deferred.');
  console.log('[SKIPPED] Use "pnpm test:e2e:powershell" for explicit local debugging.');
  process.exit(0);
}

const result = spawnSync('bash', [shPath], { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
