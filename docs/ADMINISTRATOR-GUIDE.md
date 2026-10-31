# Administrator guide

## Start the existing local installation

Use Node 22+ and PostgreSQL with the existing reviewed schema, session table,
creation-receipt migration and shared Admin. Keep the private `.env` outside Git.
See [authentication setup](AUTHENTICATION.md) for configuration. From the project:

```powershell
npm start
```

Open `http://127.0.0.1:8080`. Restart an old process after installing reviewed code.
No new npm dependencies are required by Phase 3B-4. The app still binds only to
loopback. Do not expose port 8080 or PostgreSQL directly to staff computers.

## Optional archive migration

Archive support is implemented, but **not enabled on the university database by
this phase**. Review [004-material-archive.sql](../db/migrations/004-material-archive.sql).
It adds one default-false boolean and a zero-stock check; it does not delete or
rewrite inventory/history. Make and rehearse a backup, approve a maintenance window,
stop application writes and have the database administrator apply it once through
the authorized SQL tool. The existing table grants and updated_at trigger must be
present. Do not rerun blindly: the migration intentionally errors if already applied.
Refresh the app after application. Until then it explains that archiving is unavailable.

## Everyday operations

- Follow [backup and recovery](BACKUP-AND-RECOVERY.md). Configure a daily scheduler
  only after the manual backup and restoration have been reviewed and verified.
- See [PWA installation and updates](PWA.md). Finish open stock transactions before
  updates. Installation does not provide offline database access.
- Keep [the staff guide](STAFF-GUIDE.md) available to the three authorized staff.
- Keep source releases, approved schema changes and protected configuration recovery
  records together. Never place secrets or database archives inside served assets.

## Troubleshooting

**Cannot connect:** verify the server computer is powered on, PostgreSQL is running,
and the existing Node process is listening. Check local server logs. Do not clear
browser data or retry an uncertain stock change with a new identifier.

**Sign-in/session failure:** verify the configured shared Admin and PostgreSQL session
permissions. Do not create a second account or replace credentials without approval.
Check hostname, APP_ORIGIN, HTTPS, proxy settings and cookie configuration. Session
expiry requires sign-in again; return to the same tab to resolve an uncertain request.

**Remove Stock fails:** record the message, material and requested quantity. Ensure
the material is active and enough stock is available; a colleague may have changed
it. English/Pashto decimals are supported, with at most three places. A reason is
optional. If the result is uncertain, keep the tab open and use Retry safely after
reconnection. For a definite rejection, correct the quantity. Do not issue manual
SQL quantity updates or delete history to repair the interface.

**Delete is unavailable:** stock/history/category relationships intentionally block
unsafe permanent deletion. Use Adjust Stock, Archive (once enabled), or View Materials
to move categories. Zero stock alone does not authorize deleting historical records.

**PWA install unavailable:** use a normal supported browser profile and trusted HTTPS
(or localhost for development). Check institutional installation policy. An HTTP
private-network address is insufficient. No installation prompt can override that.

## Isolated verification commands

These use generated credentials and disposable PostgreSQL, not `.env`:

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
npm test
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs tests/browser.mjs tests/redesign-browser.mjs tests/redesign-edge-browser.mjs tests/stock-print-browser.mjs tests/qa-browser.mjs tests/ui-stabilization-browser.mjs
node tests/integration-browser.mjs
node tests/pwa-browser.mjs
git diff --check
```

Paths are specific to this machine. Windows sandbox restrictions may prevent
PostgreSQL's restricted process-token startup; run the disposable tests from an
authorized normal terminal if necessary. Do not substitute a live database URL.
