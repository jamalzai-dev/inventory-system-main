// Disposable synthetic data only. This server is never used by npm start.
import { startTestServer } from '../helpers/auth-server.mjs';
if (process.env.NODE_ENV !== 'test') throw new Error('This fixture requires NODE_ENV=test.');
const fixture = await startTestServer({ port: Number(process.env.PORT || 0) });
console.log(`Local: ${fixture.url}`);
process.once('SIGTERM', () => fixture.close());
process.once('SIGINT', () => fixture.close());
