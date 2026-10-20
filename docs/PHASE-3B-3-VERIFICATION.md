# Phase 3B-3 — implementation and verification

**Phase 3B-3 complete.** Final verification: 21 October 2026. Automated tests:
137 passed. Browser checks: 90 passed. No failures or skips in these completed runs.

## A. Implementation summary

The supported frontend reads and mutates PostgreSQL through the existing
authenticated Express APIs. Browser-local inventory is preserved for separate
legacy export. Prior backend and UI stabilization work remains in the working
tree. No commit, push, deployment or production database operation was performed.

## B. Architecture and audit

The audit covered main/data/dashboard/search/UI/i18n/CSS, preferences, direct-file
startup, auth/session/CSRF, read/write/stock repositories, API contracts, existing
tests and the Phase 3B-2.1 report. No schema or API contract change was needed.
The protected static-file allowlist adds the three new frontend modules.

| Previous active path | Server-backed replacement |
| --- | --- |
| `Repository.load()` | `InventoryStore.refresh()` loads all three authenticated collections. Only complete successful results replace state. |
| Local `commit(upsert(...))` | Await POST/PATCH, then refresh authoritative records. |
| Local `removeRecord()` restrictions | Versioned DELETE; the server enforces relationships, stock and history. |
| Material quantity in metadata form | Zero-stock creation, then a separate Add Stock operation. |
| `deductStock()` and local snapshots | One transactional stock POST for the whole reviewed selection. |
| Required location/default condition/Number quantities | Nullable metadata and exact decimal strings. |
| Local dashboard/search/report state | One memory-only API dataset; print/export refresh before use. |
| JSON restore/clear/recovery | Disabled central restore, read-only central export, separate legacy raw/v2 exports. |
| Storage events | Navigation, mutation, explicit refresh, focus/visibility/reconnection and idle visible 60-second refresh. |

`api.js` uses native same-origin fetch, session cookies, no-store, no redirects,
15-second timeouts and optional cancellation. Every mutation obtains the current
`/api/auth/csrf` token and supplies `X-CSRF-Token`. Records, numeric strings,
versions and history are checked. Allowlisted safe server messages map to bilingual
UI strings; raw response/driver text is never displayed.

`store.js` owns records, loading/ready/error/stale/auth states, coalesced reads,
late-response guards and a serialized mutation gate. Initial failure never appears
as zero inventory; failed refresh retains explicitly stale/read-only information.
A committed mutation followed by failed refresh stays a successful mutation, while
the view warns its data is stale.

All collections refresh after mutations because relationships and versions can
change. Three separate GETs are point-in-time reads, not a database snapshot.
Background refresh avoids open dialogs and focused content inputs. Drafts retain
their original versions. Conflicted edits offer explicit discard-and-reload, never
automatic force-save.

`data.js` remains a legacy-format utility with its original tests. The UI imports
only key constants, its error type and UUID generation; it never constructs the
legacy repository or calls its inventory mutation methods. Preferences may read
the old settings subobject, and export-only paths may read original browser bytes.

## C. Important files

Created: `app/api.js`, `app/store.js`, `app/decimal.js`,
`tests/frontend-api.test.js`, `tests/integration-browser.mjs`,
`tests/helpers/browser-fixture.mjs`, and this report.

Modified production files: `app/main.js`, `app/dashboard.js`, `app/i18n.js`,
`app/auth.js`, `app/start.js`, `app/styles.css`, `server/app.js` (static allowlist
only), and `package.json` (test commands only; no dependency changes).

Modified tests: `tests/browser.mjs`, `tests/redesign-browser.mjs`,
`tests/redesign-edge-browser.mjs`, `tests/stock-print-browser.mjs`,
`tests/qa-browser.mjs`, `tests/ui-stabilization-browser.mjs`, and
`tests/helpers/disposable-browser.mjs`. The previous authentication suite is retained.
Documentation: README, `docs/INVENTORY-API.md`, `docs/INVENTORY-WRITES.md`,
`docs/INVENTORY-INTEGRATION.md`, `docs/STOCK-API.md`, `docs/MIGRATION.md`,
`docs/TESTING.md`, and this report. Historical local restore instructions are marked
as superseded; current recovery is export-only.

Earlier transaction modules, API routes, migrations and constraints were retained.
Existing `app/search.js` and `app/ui.js` stabilization edits remain.

## D. CRUD integration

Categories, suppliers and material metadata use POST/PATCH/DELETE; successful
mutations refresh shared lists. Creation uses durable UUID keys; edits/deletes use
quoted server versions. Duplicate names/serials, category references, stock,
history and stale edits show localized messages. Supplier deletion clears material
references without deleting materials. Materials are created with zero stock.

Only material name/category are required. Unchanged optional fields are omitted
from PATCH. Clearing an edited field sends null; untouched existing empty text
remains empty. Custom conditions/units are retained; placeholders are not submitted.

## E. Stock operations and retry recovery

Add Stock and Remove Materials accept single or atomic multiple selections (up to
25), positive three-place decimal text and an optional reason. One UUID identifies
the whole transaction. Global/per-material history uses opaque cursor pagination.
History opens in a separate accessible dialog and preserves an underlying edit draft.

Before sending a creation or stock POST, the store journals the exact unresolved
request in `sessionStorage` under `university_it_pending_request_v1`. It holds the
path, payload and operation UUID/idempotency header, never credentials, CSRF tokens,
session secrets, API responses or an inventory cache. Storage failure blocks POST.

Network uncertainty, invalid success responses and server errors retain the request.
New mutations stay blocked. Staff close open dialogs and select **Retry safely**:
connectivity is refreshed, then the unchanged request is submitted with a fresh
CSRF token. Successful resolution removes the journal and refreshes records.
Expired-session/CSRF rejection during retry preserves the previous identity.
There is no automatic offline queue or blind retry with a new UUID.

Recovery survives same-tab reload/reauthentication. Closing the tab/browser or
clearing site storage may destroy it; a beforeunload warning is requested while
pending/busy. Keep unresolved requests open and never recreate them in another tab.
An unreadable journal blocks mutations and requests IT assistance.

PATCH/DELETE retain their version preconditions. Uncertain results require refresh
and review; the client never silently retries against a newer record version.

## F. Decimal and NULL compatibility

BigInt thousandths/hundredths preserve quantities, comparisons, sorting and exact
five-place quantity × price products. Stock inputs reject exponents, signs,
leading zeros, whitespace, excess precision and out-of-range values. API numeric
strings never pass through Number/parseFloat for business arithmetic.

Zero stock is out; positive stock at/below a non-null reorder threshold is low;
other positive stock is in stock. Missing thresholds do not imply zero or an
established reorder policy. Charts count records; only bounded record-count ratios
become approximate presentation coordinates.

Reports show exact AFN values up to five fractional places, without currency
rounding. Null prices display an em dash and are excluded from known-price totals
with an explicit note. Print tables include unit prices/line values. Calendar dates
retain their date-only strings.

## G. Dashboard and search

All four cards, charts, preview, filters, sorting, relationship names, global search,
reports and printing use current server records. Legacy records are never mixed
into them. Empty inventory is distinct from loading/failure.

## H. Offline and authentication behavior

Network/database failures mark data stale and block mutations; there is no local
fallback. Session expiry clears protected UI and returns to the existing login.
Logout/pagehide clear protected content; back/forward restoration reloads it.
CSRF checks and backend session configuration remain unchanged.

## I. Backup/restore boundary

Central export uses `kdru-central-inventory-read-only` version 1 and refreshed
materials/categories/suppliers. It excludes history, receipts, sessions and Admin
credentials. It is not a transactional snapshot or a complete restorable backup;
both UI and export explain this.

Legacy raw/v2 exports retain separate formats/filenames and preserve old keys,
including corrupt bytes. Central restore is disabled. Phase 3B-4 must define a
supervisor-reviewed PostgreSQL backup/restore procedure covering durable history
and creation receipts, with restore tests on a disposable database. No import,
destructive clear, restore or backup scheduler was implemented.

## J. Verification

Automated verification: **137 passed, 0 failed, 0 skipped**, including all original
122 tests and 15 new frontend client/store/decimal tests. The later focused run
covering client/store, dashboard, translation/legacy data and repository serving
passed **39/39** after the final focus-refresh changes.

| Automated group (non-overlapping) | Passed |
| --- | ---: |
| Unit/model/configuration/client tests | 71 |
| Express HTTP/API tests with synthetic repositories/session dependencies | 26 |
| Real PostgreSQL scenarios: metadata 17, stock 21 | 38 |
| PostgreSQL parent test containers counted by Node | 2 |
| Total reported by Node | 137 |

Authentication-specific coverage is 10 automated tests (8 HTTP and 2 configuration/
credential tests), included above. Dictionary completeness is one automated test
checking every English/Pashto pair; bilingual browser matrices exercise rendering.
Backend HTTP tests use fake repositories where explicitly designed; PostgreSQL
tests and inventory browser workflows use real disposable PostgreSQL.

The new integration suite passes **22 checks**, including real API CRUD, zero/NULL
metadata, fractional stock/value, duplicate validation, relationship restrictions,
two-client stale edits and stock races, atomic rollback, lost committed stock and
creation responses across reload, offline/reconnection, initial/stale 503 handling,
history pagination, focused-row synchronization, export boundaries and session expiry.
Its **224 responsive cases** cover eight widths (320–1440), both languages, both
themes and seven sections. `results.json` records no errors.

Verification environment: Windows, Node.js 24.15.0, PostgreSQL 18 and Microsoft
Edge 155.0.4283.62, using Playwright. Syntax validation passed for 24 changed/new
JavaScript modules and test files; `git diff --check` passed.

Regression fixes include consuming 204 response bodies, preserving history-dialog
drafts/focus, fitting added actions at narrow widths, avoiding refresh focus loss,
clearing protected UI safely during session expiry and using a stock-addition label
on the addition review button. Screenshots of the Pashto dark dashboard, 320px stock
dialog and white-paper print output were inspected.

Local evidence is under `tests/artifacts/phase-3b-3/`: `automated.log`,
`browser-regression.log`, `integration.log`, `results.json`, `preservation.json`,
`dashboard-ps-dark.png`, `stock-320-ps-dark.png` and `print-ps.png`. These generated
artifacts are ignored by Git. UI stabilization evidence remains under
`tests/artifacts/phase-3b-2-1/`.

All eight browser suites pass **90 checks**, with no failures or skips:

| Browser suite | Passed |
| --- | ---: |
| Authentication | 8 |
| Main application | 19 |
| Redesign | 9 |
| Redesign edge cases | 7 |
| Stock and print | 8 |
| QA, including Android touch and file recovery | 11 |
| UI stabilization | 6 |
| New PostgreSQL frontend integration | 22 |
| Total | 90 |

The stabilization and integration suites each pass a 224-case primary responsive
matrix (448 executions across the two suites, not 448 unique configurations).
Other suites retain their own mobile/desktop, adjacent-breakpoint, short-screen,
empty-state and print checks. Accessibility checks cover keyboard navigation,
dialog focus trapping/restoration, labels, table semantics, visible focus, contrast
and reduced motion. The authentication suite verifies login/session behavior in
addition to the automated authentication counts above.

Existing layout, keyboard, focus, contrast, table, search, print and resource assertions are
retained. Architecture-specific assertions now expect API-normalized strings/NULLs,
zero-stock creation, supplier SET NULL, and preserved legacy exports instead of local
restore. Expected 409 responses are individually tested and counted; unexpected
API/resource failures still fail their suites.

The test runner exchanges fixture data over child-process IPC, never an exposed
HTTP maintenance route. Fixture setup/reset can only target its newly initialized
cluster. Browser tests cannot seed a supplied production application URL.

## K. Data safety

No production-intended database was connected to. Synthetic records, Admin entries,
sessions and fixture resets belong exclusively to disposable clusters/profiles.
Production inventory, schema, sessions and credentials were not modified.
No environment secrets were printed.

SHA-256 comparison against the Phase 3B-2.1 protected-file baseline confirms all
18 files expected to stay unchanged are identical, including inventory/stock
repositories, transaction/validation routes, Admin/config modules, database
migrations, database connection, legacy data utility, login JavaScript, earlier
stock tests and both preserved footer edits. The two intentional differences are
`server/app.js` (static module allowlist) and `app/auth.js` (clear protected frontend
state on logout/session expiry). Evidence: `tests/artifacts/phase-3b-3/preservation.json`.

## L. Known issues and limitations

No known failing checks or unfinished Phase 3B-3 workflows remain. Cross-collection reads/history pagination
are not snapshot-isolated. Pending recovery is tab-scoped. Actual screen-reader
speech, physical mobile keyboards, Firefox/Safari, real printers and fluent Pashto
wording need manual review. Automated checks are not accessibility certification.

## M. Deployment readiness

Phase 3B-3 is complete and verified. Phase 3B-4 remains required. Full university LAN production
readiness is not claimed: backup/restore, network/HTTPS and operational review
remain required. Server loopback binding remains unchanged. No Phase 3B-4, PWA or
deployment implementation is included.

## N. Manual commands

No new migration/package installation is needed. Existing local runtime:

```powershell
npm start
```

Restart an already running server to load the new protected module allowlist.
Use the existing authorized Admin login at `http://127.0.0.1:8080`. Keep legacy
exports separately. For isolated verification:

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
npm test
$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs tests/browser.mjs tests/redesign-browser.mjs tests/redesign-edge-browser.mjs tests/stock-print-browser.mjs tests/qa-browser.mjs tests/ui-stabilization-browser.mjs
node tests/integration-browser.mjs
```

Paths are machine-specific. PostgreSQL fixtures never read `.env`.
