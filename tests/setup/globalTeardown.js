import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('\n[globalTeardown] Stopping test database container...');

  execSync('docker compose -f docker-compose.test.yml down -v', {
    stdio: 'pipe',
    timeout: 30000,
  });

  console.log('[globalTeardown] Container stopped.\n');
}
