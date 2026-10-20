# Phase 3B-2 verification — 19 October 2026

## Outcome and scope

Implemented transactional single/batch additions and deductions, exact decimal
validation, durable whole-operation retry protection, and authenticated paginated
movement history. Existing Phase 3A reads and Phase 3B-1 metadata writes pass their
tests. No new migration is needed. Backend work is ready for review before Phase
3B-3; frontend integration and deployment readiness are not claimed.

No production inventory, schema, permissions or credentials were modified. No
commit, push or deployment was performed. Frontend behavior/localStorage, markup,
styles and translations were not edited by this phase.

See [STOCK-API.md](STOCK-API.md) for full request/response examples, error codes,
decimal rules, transaction details, cursor behavior and safe retry instructions.

## Files

Created:

- `server/stock.js`: transactional stock repository and history queries.
- `server/stock-validation.js`: exact scaled quantities, request normalization,
  bounds and validated history cursors.
- `server/transaction.js`: shared existing transaction/rollback/release helper.
- `tests/stock.test.js`: nine validation/security/HTTP tests.
- `tests/stock-postgres.test.js`: 21 scenarios using the existing disposable
  PostgreSQL infrastructure.
- `docs/STOCK-API.md` and this verification report.

Modified:

- `server/inventory.js`: compose stock methods into the existing repository.
- `server/inventory-routes.js`: three protected routes and safe stock error text.
- `server/inventory-validation.js`: export existing text validation and update
  the zero-initial-stock guidance now that a separate stock API exists.
- `server/inventory-writes.js`: use the extracted transaction helper without
  changing metadata transaction behavior.
- `README.md`, `docs/INVENTORY-API.md`, `docs/INVENTORY-WRITES.md`, `docs/INVENTORY-INTEGRATION.md`,
  `docs/TESTING.md`: current status, API links and future integration requirements.

Pre-existing uncommitted edits in `app/i18n.js`, `archive/index.html` and `login.html`
were preserved byte-for-byte, verified with SHA-256 before/after. They are not part
of the Phase 3B-2 implementation. The translation edit has an empty, one-element
`reviewTranslation` entry instead of the expected English/Pashto pair.

## Database inspection and preservation

Read-only inspection of `university_inventory` as `inventory_app` confirmed:

- Stock domain: nonnegative NUMERIC, maximum `999999999.999`, at most three
  fractional digits; material default stock is zero.
- Signed movement constraint: nonzero delta within the corresponding signed range.
- Movement UUID, material UUID, operation UUID, Admin reference, reason and
  timestamp already exist. Unique `(operation_id, material_id)` prevents duplicate
  material rows in an operation. Material/history deletion uses RESTRICT.
- Existing material update trigger updates timestamps. The opaque row version
  combines row transaction identity and exact updated timestamp.
- Migration 003 is now manually applied. Creation receipts have runtime
  SELECT/INSERT grants; stock uses existing movement rows instead of that table.
- Existing runtime inventory/movement privileges are sufficient. Their broader
  UPDATE/DELETE grants were not changed; retain movement history administratively
  as described in the API retention requirements.

Before/after live counts were identical: categories **0**, suppliers **0**,
materials **0**, stock movements **0**, creation receipts **0**. The final check
ran in `BEGIN READ ONLY`; the new history repository returned an empty page.
Only the isolated databases received synthetic records, fault triggers or fixture
timestamp changes. No live test stock operation was submitted.

Normal server startup with `PORT=0` and PostgreSQL default read-only transactions
passed: `GET /login` **200**, unauthenticated history **401**, unauthenticated stock
POST **401**. The temporary server was stopped. No live Admin login was used.

## Automated results

Environment: Windows, Node.js v24.15.0, local PostgreSQL 18. Each integration test
file initializes its own disposable cluster on a random loopback port through
`tests/helpers/isolated-postgres.mjs`. That helper does not read `.env` or accept a
target production URL. Application queries run with the limited test role, and
clusters are stopped/removed after tests. Windows pg_ctl required execution outside
the restricted tool token; this did not change the target database isolation.

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
npm test
```

**122 tests: 121 passed, 1 failed, 0 skipped.** This includes both real PostgreSQL
groups: **17 existing metadata scenarios + 21 new stock scenarios = 38 scenarios**,
all passing. Node also counts their two parent tests. All nine new stock unit/HTTP
tests passed. The dedicated stock PostgreSQL run passed **22/22**, including its
parent test. Without `TEST_PG_BIN`, real PostgreSQL groups are explicitly skipped;
that is not equivalent verification.

Syntax/whitespace checks passed for all nine changed/new JavaScript files, and
`git diff --check` passed. After documentation updates,
`node --test tests/repository.test.js` passed **3/3**, covering document links,
application resources, authenticated static serving and server-port validation.

The sole full-suite failure is the pre-existing dictionary completeness assertion
at `tests/data.test.js:68` (assertion line 70), caused by the existing
`reviewTranslation: ['']` edit. Before backend changes, the baseline without
PostgreSQL integration was **72 passed, 1 failed, 1 skipped** with that same failure.
It remains unchanged; no failing assertion was deleted or weakened.

Dedicated stock integration command:

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
node --test tests/stock-postgres.test.js
```

### Proven transaction and retry cases

- Single/multiple additions and removals; exact `150.750`, fractional and maximum
  boundary values; signed movements and authenticated Admin association.
- Repeated selections combine exactly, produce one movement per material and
  cannot bypass stock/range checks. Zero-stock materials remain present.
- Insufficient stock, missing materials, invalid values and resulting overflow
  preserve the entire batch, including timestamps/versions and movement rows.
- Three concurrent identical requests produce one 201 and two 200 replays.
  Concurrent changed batches sharing an ID produce one success and one conflict.
- Reordering/splitting items, decimal scale and trimmed reason normalize correctly.
  Quantity, material subset/superset/replacement, type and reason changes conflict.
  Replay after repository recreation/later stock changes returns original movements
  and current balances without another deduction/addition.
- Two simultaneous removals of 15 from 20 yield exactly one success and balance 5.
  Concurrent additions/removals and opposite input order avoid lost updates.
- A trigger failing the second movement rolls back earlier updates/movements;
  correcting the fault permits the same operation UUID to succeed once.
- A wrapper simulates a lost acknowledgement **after a real COMMIT**: HTTP returns
  uncertain 503; same-ID retry returns 200 and proves one committed stock effect.
  A separate failure immediately before COMMIT rolls everything back.
- Concurrent deletion tested in both lock orders; concurrent metadata edit is
  preserved; stock invalidates stale metadata versions. History prevents deletion
  even after stock returns to zero; generic PATCH quantity remains prohibited.
- Final exact SQL reconciliation finds every test balance equal to the sum of its
  committed movements, all clients released, and no idle transaction remaining.

### Security and history

Unauthenticated writes/history, revoked credentials and logout deny access. Existing
CSRF token, origin and cross-site checks block writes before repository execution.
Malformed JSON, 4 KiB body limits, UUIDs, unknown/protected fields, string-only
decimals and pagination are covered. SQL-looking Unicode reasons are inert data;
errors/logs omit sensitive details. New server files remain outside public serving.

History tests verify exact signed quantities, grouping, material association, safe
fields, empty/missing materials, newest-first ordering, ties, full microsecond
cursor precision, and new records between pages. API pagination is not a snapshot
across requests; this limitation is documented rather than hidden.

## Browser results and existing issues

Used the existing disposable authentication runner and headless Microsoft Edge,
with synthetic browser storage and no staff credentials or production DB access:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs tests/redesign-browser.mjs
node tests/helpers/disposable-browser.mjs tests/browser.mjs
node tests/helpers/disposable-browser.mjs tests/redesign-edge-browser.mjs
node tests/helpers/disposable-browser.mjs tests/stock-print-browser.mjs
```

- Authentication: **7 checks passed**, including login, layout/selected contrast,
  duplicate submission protection and logout preserving local inventory.
- Redesign: **6 checks passed**, then Settings language-state assertion failed at
  `tests/redesign-browser.mjs:153`. The preserved translation edit leaves the Pashto
  entry undefined; a direct call to `setLanguage('ps'); t('reviewTranslation')`
  reproduces `TypeError: Cannot read properties of undefined (reading 'replace')`.
- Main browser regression: **13 checks passed**, then the known **768px English,
  light Materials overflow** at `tests/browser.mjs:108` reproduced.
- Redesign edge: **6 checks passed**, then the known **720px / 200% zoom equivalent
  overflow** at `tests/redesign-edge-browser.mjs:99` reproduced.
- Stock/print: **6 checks passed**, then the known **width/language/theme overflow**
  at `tests/stock-print-browser.mjs:67` reproduced.

The three overflow failures were already documented/reproduced before Phase 3B-2
(see Phase 3A/3B-1 verification); they are not new stock API regressions. Assertions
remain intact, and no unrelated CSS/UI fix was included. Browser suites stop at
their first failure; later checks are not claimed as passing. The Settings failure
is an additional current-workspace issue, separate from those three overflows.

## Remaining work and manual steps

No new SQL migration, package installation, credential setup or manual database
write is required for this phase. Migration 003 is already present; do not rerun it.
Review the backend/API changes and test evidence, then restart the application
normally with `npm start` when ready to load them. For verification, use only the
disposable test commands above.

There is no known unfinished Phase 3B-2 backend requirement. Resolve the preserved
translation issue and three responsive failures before deployment. Review/authorize
Phase 3B-3 separately: decimal-safe/null-aware frontend integration, pending
operation IDs and uncertain retries, multi-client refresh, charts, search, reports,
printing, batch removal and backup policy. No frontend integration or deployment
has begun. Physical LAN clients, crash/power-loss durability, printer hardware and
production-volume performance were not tested; the lost-response case was injected
around a real database commit, not a physical network failure.
