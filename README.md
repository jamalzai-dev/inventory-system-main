# University IT Inventory

A lightweight English/Pashto inventory application for a university IT department. Modular vanilla JavaScript with no frontend build step. Express protects the inventory with a shared Admin login and PostgreSQL-backed sessions.

## Run locally

Use Node.js 22 or later. First complete the [authentication setup](docs/AUTHENTICATION.md): install dependencies, run the separate session-table migration in pgAdmin, configure the private session secret, and set the shared Admin credentials. From this folder:

```powershell
npm start
```

Open **http://127.0.0.1:8080** and sign in. Use **Settings → Sign out** to end the session. Keep the same browser and origin to retain access to your local inventory. Stop the server with Ctrl+C. Do not open index.html directly: the application uses ES modules.

If port 8080 is occupied, choose another port (PowerShell):

```powershell
$env:PORT = '8091'
npm start
```

The server always binds to `127.0.0.1`; `PORT=0` selects an available port and prints its URL. Invalid ports and occupied ports produce a clear error. Changing ports changes the browser storage origin: export at the original origin before moving records. To return to the default, run `Remove-Item Env:PORT` in that terminal.

**Before moving from the old file:// location or a different hostname/port, export your inventory there.** Opening the updated index.html directly at its original file path displays an export-only recovery screen. Browser storage does not move with the project files. See [migration and recovery](docs/MIGRATION.md).

## Features

- Materials, categories and suppliers: add, edit, search and safely delete.
- Stock quantities, reorder levels, equipment condition, location, responsible person, serial, supplier, AFN price, purchase date and notes.
- Record-based dashboard cards, category/stock charts, filtered inventory preview and context-preserving See All.
- Persistent global inventory search with keyboard navigation and grouped material/category/supplier results.
- Stock/category/value reports and localized printing.
- English/Pashto, LTR/RTL, persistent light/dark themes, responsive tables and keyboard-accessible forms/dialogs.
- Validated JSON restore with preview and confirmation; recovery snapshot before each inventory change; raw archive export.
- Safe read-only inspection of legacy products, orders, adjustments and activity logs.

New installations start empty. Add a category, then materials; suppliers are optional. The interface does not translate stored names or descriptions.

## Data and deployment boundaries

Records remain in this browser's localStorage under the existing university_it_inventory_v2 key. Legacy ims_* keys remain untouched. Authentication and sessions use PostgreSQL; inventory records are not centralized yet. Use one editing tab and download backups regularly. The latest recovery snapshot is not a substitute for external backups.

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

The frontend continues to use browser-local storage. The static server's explicit
allowlist excludes the connection module, environment files and project configuration.
PostgreSQL `NUMERIC` values retain `pg`'s default string representation for exact
decimal values. Future transactions must acquire one client with `pool.connect()`,
use it for `BEGIN`, all statements and `COMMIT`, roll back on failure, and always
release it in `finally`.

## Tests

```powershell
npm test
```

For browser checks, start the local server, make Playwright available, then run `node tests/browser.mjs`. The suite defaults to installed Microsoft Edge; set `BROWSER_CHANNEL` to change it and `PLAYWRIGHT_MODULE` to point at an existing Playwright installation. It uses a disposable profile and never reads your normal browser data. Screenshots and test exports go to tests/artifacts (ignored by Git).

Browser tests require `TEST_ADMIN_USERNAME` and `TEST_ADMIN_PASSWORD` set privately in the terminal. See [authentication verification](docs/AUTHENTICATION.md#verification). `npm run test:auth:browser` checks the login page and logout flow.

`npm run test:browser` runs the full regression suite; `npm run test:qa` adds deployment, resource, accessibility and Android touch-emulation checks. Set `TEST_BASE_URL` to the printed server URL if using a different port. The QA HTTP-origin test maps a synthetic hostname inside its disposable browser; it does not change Windows DNS or expose the server to the LAN. See [the final QA review](docs/QA-REVIEW.md).
