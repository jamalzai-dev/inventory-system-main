# Phase 3B-1 implementation and verification — 18 October 2026

The interrupted work was recovered in place without resetting or discarding edits.
Already present: the nine write routes, reusable validators, repository transactions,
record versions, a proposed receipt migration, unit tests and a disposable PostgreSQL
helper/schema fixture. Completion added real PostgreSQL/HTTP concurrency and failure
tests, safer receipt minimization, RESTRICT error mapping, regression checks and docs.

## Actual results

| Check | Result |
| --- | --- |
| Pre-change baseline `npm test` | 65 passed, 0 failed |
| Focused API/validation tests | 19 passed, 0 failed |
| Full `npm test` with TEST_PG_BIN | **91 passed, 0 failed, 0 skipped**; includes 17 real PostgreSQL scenarios plus their parent harness |
| Normal `tools/serve.mjs` with PORT=0 | Started with the real configured PostgreSQL session store; login page 200, unauthenticated GET/POST inventory requests 401 |
| Live read-only repository checks | Passed as inventory_app in university_inventory; categories/suppliers/materials empty, missing UUID null |
| Live preservation check | Categories, suppliers, materials and stock_movements counts all zero; receipt table absent, proving migration 003 remains unapplied |
| Authentication browser suite | 7 checks passed |
| Main redesign browser suite | 9 checks passed |
| General browser suite | 13 checks passed, then the known line-108 overflow failure |
| Redesign edge browser suite | 6 checks passed, then the known line-99 overflow failure |
| Stock/print browser suite | 6 checks passed, then the known line-67 overflow failure |
| Whitespace review | `git diff --check` passed |

Real PostgreSQL tests exercise restricted runtime permissions, Unicode/duplicate
names, nullable PATCH fields, exact decimal limits, calendar dates, missing foreign
keys, serial uniqueness, default zero stock, category RESTRICT, supplier SET NULL,
movement-history restrictions, positive-stock deletion protection, three concurrent
updates, duplicate/concurrent/conflicting POST keys, replay after edit/deletion,
receipt minimization, rollback after receipt INSERT failure, missing migration and
permissions, SQL-looking text, actual row-lock waits against stock changes, and
released connections/no idle transactions. Low-level connection/COMMIT/ROLLBACK
failure injection also has focused test-double coverage; the real transactional
claims above are based on the separate PostgreSQL cluster, not those doubles alone.

The first isolated run hit Windows restricted-token startup limits; the same harness
ran successfully outside the restricted sandbox. Initial integration failures exposed
PostgreSQL RESTRICT SQLSTATE 23001 handling; the handler was fixed and the final full
suite passed. No fixture failed by being skipped or weakening a browser assertion.
QA-browser, physical devices, deployment and authenticated production Admin writes
were not tested in this phase.

## Files

Modified:

- `server/app.js`: passes the existing CSRF middleware to inventory routes.
- `server/inventory.js`: shares read/write field mapping and adds record versions.
- `server/inventory-routes.js`: registers writes and safe error handling.
- `tests/inventory.test.js`: verifies additive versions and the new protected-method boundary.
- `README.md`, `docs/INVENTORY-API.md`, `docs/TESTING.md`: link current contracts/results while preserving historical findings.

Created:

- `server/inventory-validation.js`, `server/inventory-writes.js`.
- `db/migrations/003-inventory-create-requests.sql` (manual, unapplied live).
- `tests/inventory-write.test.js`, `tests/inventory-postgres.test.js`.
- `tests/helpers/isolated-postgres.mjs`, `tests/fixtures/inventory-schema.sql` (test-only).
- `docs/INVENTORY-WRITES.md`, `docs/INVENTORY-INTEGRATION.md`, this verification report.

## Reproduction commands

```powershell
npm test
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
npm test
```

Without TEST_PG_BIN, the standalone tests run and the isolated PostgreSQL group is
explicitly skipped. With it, tests initialize a new SCRAM-authenticated loopback-only
cluster under `tests/artifacts`, use a separate `inventory_api_test` database and a
restricted `inventory_app` role, then stop and remove that cluster. No production
URL or `.env` is read by this harness. It uses a schema-only snapshot of the actual
PostgreSQL 18 schema and applies migration 003 **only inside that disposable cluster**.
No runtime dependencies were added. Set TEST_PG_BIN to PostgreSQL 18 binaries on your
machine; Windows sandbox restrictions may require running these local tests outside
the restricted sandbox.

Focused checks:

```powershell
node --test tests/inventory.test.js tests/inventory-write.test.js
node --test tests/inventory-postgres.test.js
git diff --check
```

## Browser regressions and known overflow

Use an existing Playwright installation; the path below is local to this workstation.
Run each suite separately so an earlier known failure does not prevent later suites:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs
node tests/helpers/disposable-browser.mjs tests/redesign-browser.mjs
node tests/helpers/disposable-browser.mjs tests/browser.mjs
node tests/helpers/disposable-browser.mjs tests/redesign-edge-browser.mjs
node tests/helpers/disposable-browser.mjs tests/stock-print-browser.mjs
```

The three existing overflow assertions, unchanged in this phase:

| Suite / assertion | Known failure |
| --- | --- |
| `tests/browser.mjs:108` | Document overflow at 768px, English/light Materials |
| `tests/redesign-edge-browser.mjs:99` | Document overflow at 720px / 200% layout equivalent |
| `tests/stock-print-browser.mjs:67` | Document overflow in the width/language/theme matrix |

All three were reproduced against untouched baseline `a92a3b0` during Phase 3A.
They are existing issues, not attributed to the new backend. Assertions have not
been removed, skipped or weakened. A separate focused responsiveness fix is required
before production deployment. Passing backend tests does not establish deployment
readiness or complete responsive verification.

## Migration and remaining boundaries

Migration [003](../db/migrations/003-inventory-create-requests.sql) is for manual
review, not an automatic startup operation. It creates receipt identities/digests
with SELECT/INSERT grants; it stores no credentials or request/response bodies.
Receipts are retained indefinitely to keep old retry keys from creating duplicates.
See [manual instructions and retention policy](INVENTORY-WRITES.md).

The live university database was inspected read-only. No test records, credentials,
schema changes or grants were applied there. No Git commit, push or deployment was
performed. POST
cannot be live-verified until the migration is approved/applied. Real write behavior
is verified only in the separate disposable cluster. Existing frontend files,
CSS, translations, localStorage, reports, printing, backups, session configuration,
password hashing and login/logout remain unchanged.

Frontend integration and decimal-safe UI arithmetic remain deferred; see
[integration requirements](INVENTORY-INTEGRATION.md). Phase 3B-2 stock operations,
movement history and batch deductions were not started.
