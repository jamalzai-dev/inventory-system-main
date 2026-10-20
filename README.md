# University IT Inventory

A lightweight English/Pashto inventory application for a university IT department. Modular vanilla JavaScript with no frontend build step. Express protects the inventory with a shared Admin login and PostgreSQL-backed sessions.

## Run locally

Use Node.js 22 or later. First complete the [authentication setup](docs/AUTHENTICATION.md): install dependencies, run the separate session-table migration in pgAdmin, configure the private session secret, and set the shared Admin credentials. From this folder:

```powershell
npm start
```

Open **http://127.0.0.1:8080** and sign in. Use **Settings → Sign out** to end the session. Inventory is shared through PostgreSQL; browser preferences and legacy exports remain specific to their original browser/origin. Stop the server with Ctrl+C. Do not open index.html directly: the application uses ES modules.

If port 8080 is occupied, choose another port (PowerShell):

```powershell
$env:PORT = '8091'
npm start
```

The server always binds to `127.0.0.1`; `PORT=0` selects an available port and prints its URL. Invalid ports and occupied ports produce a clear error. Changing ports changes the origin for preferences and legacy browser exports, but not the central PostgreSQL inventory. To return to the default, run `Remove-Item Env:PORT` in that terminal.

**Before moving from the old file:// location or a different hostname/port, export your inventory there.** Opening the updated index.html directly at its original file path displays an export-only recovery screen. Browser storage does not move with the project files. See [migration and recovery](docs/MIGRATION.md).

## Features

- Materials, categories and suppliers: add, edit, search and safely delete.
- Stock quantities, reorder levels, equipment condition, location, responsible person, serial, supplier, AFN price, purchase date and notes.
- Record-based dashboard cards, category/stock charts, filtered inventory preview and context-preserving See All.
- Persistent global inventory search with keyboard navigation and grouped material/category/supplier results.
- Stock/category/value reports and localized printing.
- English/Pashto, LTR/RTL, persistent light/dark themes, responsive tables and keyboard-accessible forms/dialogs.
- Transactional stock additions/removals, atomic batches, safe retries and paginated movement history.
- Read-only central inventory export and separate legacy browser JSON/raw exports. Central restore is explicitly deferred.

A central database without records displays an empty inventory. Add a category, create a zero-stock material, then use Add Stock; suppliers and other metadata are optional. The interface does not translate stored names or descriptions.

## Data and deployment boundaries

PostgreSQL is the only authoritative inventory source. The frontend uses authenticated APIs, exact decimal strings and server versions. Legacy `university_it_inventory_v2` and `ims_*` records remain untouched and are never automatically imported. Server failure blocks mutations and marks previous data stale. Uncertain POST requests retain their original identities in tab-scoped sessionStorage for explicit safe retry; keep that tab open until resolved. No inventory responses are persisted in browser storage.

Central JSON exports are not complete database backups or restorable snapshots. Supervisor-reviewed PostgreSQL backup/restore and university LAN/HTTPS deployment remain future Phase 3B-4 work. See the [Phase 3B-3 implementation and verification report](docs/PHASE-3B-3-VERIFICATION.md).

The manifest and an unregistered service-worker draft prepare for future PWA work; installability/offline caching is not enabled. Pashto translations need fluent staff review. Do not deploy the archive directory.

- [Audit and foundation decision](docs/AUDIT.md)
- [Migration and recovery](docs/MIGRATION.md)
- [LAN/backend and PWA plan](docs/DEPLOYMENT.md)
- [Changed files and fixes](docs/CHANGES.md)
- [Modernization report and verification limits](docs/MODERNIZATION-REPORT.md)
- [Test results and commands](docs/TESTING.md)

## PostgreSQL connection setup (Step 1)

Install Node.js 22+ and run `npm ci` from the project root. Install and start
PostgreSQL on the same machine before checking the connection. The existing
`university_inventory` database and `inventory_app` role must already be configured;
this step does not create or alter tables or seed records.

If `.env` does not already exist, copy `.env.example` to `.env` in the project root
(`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on Linux).
Edit `.env` locally and replace the password placeholder with the private password
for `inventory_app`. Never commit this file or share its contents. Operating-system
environment variables take precedence over `.env`; the file is found relative to
the database module, regardless of the terminal working directory.

Run `npm run check:db`. It executes only `SELECT 1` and closes the connection pool.
If it fails, check that PostgreSQL is running and listening on the configured port,
that the database name is correct, and that the role/password and PostgreSQL access
rules permit the connection. Defaults are host `127.0.0.1` and port `5432`;
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` are required. Only `127.0.0.1`, `localhost`,
and `::1` are accepted hosts. PostgreSQL SSL is disabled only for this same-host
connection; browser HTTPS will be handled separately by Nginx.

The frontend uses the existing authenticated inventory APIs. The static server's explicit
allowlist excludes the connection module, environment files and project configuration.
PostgreSQL `NUMERIC` values retain `pg`'s default string representation for exact
decimal values. Future transactions must acquire one client with `pool.connect()`,
use it for `BEGIN`, all statements and `COMMIT`, roll back on failure, and always
release it in `finally`.

## PostgreSQL inventory reads (Phase 3A)

Authenticated `GET /api/categories`, `/api/suppliers`, `/api/materials`, and
`/api/materials/:id` use the existing PostgreSQL pool and Admin session protection.
Lists return `{ "data": [] }` when empty; a lookup returns `{ "data": material }`.
Decimals remain exact strings and optional values remain null. See the [API contract, schema findings,
and frontend mapping](docs/INVENTORY-API.md).

## PostgreSQL inventory writes (Phase 3B-1)

Authenticated, CSRF-protected POST/PATCH/DELETE endpoints now cover categories,
suppliers and material metadata. Materials start with zero stock; generic editing
cannot change stock. PATCH/DELETE use record versions; POST uses durable retry keys.
Phase 3B-3 connects these endpoints to the frontend while preserving legacy localStorage bytes.

**Migration 003 has been manually applied**, confirmed by read-only inspection on
19 October 2026. Do not rerun it. Read the [write contract and migration steps](docs/INVENTORY-WRITES.md),
[integration architecture](docs/INVENTORY-INTEGRATION.md), and
[verification results and known layout failures](docs/PHASE-3B-1-VERIFICATION.md).

## Transactional stock management (Phase 3B-2)

Authenticated, CSRF-protected `POST /api/stock-operations` adds or removes exact
decimal quantities for one or multiple materials atomically. Row locks protect
concurrent changes; durable operation UUIDs prevent duplicate retries. Protected
`GET /api/stock-movements` and `GET /api/materials/:id/movements` provide paginated
history. Phase 3B-3 connects these endpoints to stock forms and history views. No new migration is required.
See the [stock API and examples](docs/STOCK-API.md),
[test results and remaining issues](docs/PHASE-3B-2-VERIFICATION.md), and
[Phase 3B-3 integration requirements](docs/INVENTORY-INTEGRATION.md).

## UI stabilization (Phase 3B-2.1)

The English/Pashto Settings regression and three known document-overflow failures
are fixed. The existing design now has clearer table/chart typography, reachable
table actions, improved short-screen search/dialogs and theme-independent print
colors. These refinements are preserved in the server-backed frontend. See the
[UI audit, verification and screenshots](docs/PHASE-3B-2-1-VERIFICATION.md).

## Tests

Use isolated PostgreSQL fixtures, never production credentials or inventory:

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
npm test
$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs tests/browser.mjs tests/redesign-browser.mjs tests/redesign-edge-browser.mjs tests/stock-print-browser.mjs tests/qa-browser.mjs tests/ui-stabilization-browser.mjs
node tests/integration-browser.mjs
```

Runtime paths are machine-specific. Playwright uses installed Edge by default;
`BROWSER_CHANNEL` selects another installed Chromium channel. The runner creates
synthetic sessions and its own disposable PostgreSQL cluster, without reading
`.env` or staff browser profiles. Fixtures use private child-process IPC, not HTTP
maintenance endpoints. Screenshots, JSON results and synthetic exports are saved
under `tests/artifacts` (ignored by Git). See [verification](docs/PHASE-3B-3-VERIFICATION.md).
