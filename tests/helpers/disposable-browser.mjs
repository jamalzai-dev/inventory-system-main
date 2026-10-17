// Runs browser suites against a disposable authentication fixture. Production
// credentials, PostgreSQL, .env files and staff browser storage are never used.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { startTestServer, testCredentials } from './auth-server.mjs';

const suites = process.argv.slice(2);
if (!suites.length) throw new Error('Pass one or more browser suite paths.');
const fixture = await startTestServer();
try {
  for (const suite of suites) {
    console.log(`Running ${suite} against disposable authentication and storage`);
    const status = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [resolve(suite)], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_BASE_URL: fixture.url,
          TEST_ADMIN_USERNAME: testCredentials.username,
          TEST_ADMIN_PASSWORD: testCredentials.password
        }
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => signal ? reject(new Error(`Browser suite terminated: ${signal}`)) : done(code));
    });
    if (status !== 0) { process.exitCode = status || 1; break; }
  }
} finally { await fixture.close(); }
