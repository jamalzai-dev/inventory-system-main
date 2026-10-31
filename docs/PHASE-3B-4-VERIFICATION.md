# Phase 3B-4 — implementation and verification

Date: 31 October 2026. Final automated and browser verification is complete.
All safe local implementation work is delivered. Operational/manual limits and the
unapplied optional archive migration are stated below.

## 1. Baseline, investigation and stock fixes

The working tree started clean on `main` at `9b0a3f0`. A recoverable source archive
was saved to `tests/artifacts/phase-3b-4/baseline-9b0a3f0.zip` before edits. The actual
frontend, repositories, auth/CSRF/session flow, schema snapshot, API contracts,
previous report and test suites were reviewed. PostgreSQL is genuinely authoritative;
no legacy localStorage inventory was imported or modified.

**The original live failure was not reproduced from the information supplied.** The
unchanged stock browser suite passed all eight checks against disposable PostgreSQL,
including partial/full removal, batches, concurrency and failed-write recovery.
The user was asked for the exact failure/message; no additional reproduction details
were available. It would be inaccurate to claim a guessed CSRF/database defect caused
that incident. A production-browser reproduction still needs that evidence.

A concrete input defect was identified: the frontend's ASCII decimal parser rejected
Pashto/Arabic numerals entered through local keyboards. `app/stock-input.js` now
converts those numerals and the Arabic decimal separator to exact ASCII strings
before validation/submission. Grouping separators, signs, exponents, zero, excess
precision and overflow remain invalid. The backend's strict decimal contract is
unchanged. BigInt calculates the preview; PostgreSQL remains authoritative.

Materials now offer **Adjust Stock** directly on each row/card. One dialog shows the
name, current balance, Add/Remove choices, quantity, exact result, optional reason
and one confirmation. Invalid/excess quantities are rejected immediately. Confirm
disables offline; reconnection checks the server and preserves the typed draft.
All writes use the existing authenticated stock endpoint and durable operation UUIDs.

Batch additions/removals retain selection, decimal inputs, exact previews and one
review/confirmation. Review replaces the stock form instead of stacking two open
dialogs; cancelling restores the complete selection. No second stock system, local
quantity update or optimistic success was added. Tests cover 1-unit/multiple/fractional
addition, partial/full deduction, duplicate submission, invalid batches, lost replies,
atomic rollback, current server balances and races between independent clients.

## 2. Deletion and archive behavior

Positive stock blocks material deletion. Movement history blocks deletion even at
zero. Category references block category deletion. Supplier deletion retains materials
and clears the optional supplier reference. No foreign key or history protection was
removed, and no cascading inventory delete was introduced.

Deletion dialogs explain the specific restriction before confirmation. Known unsafe
deletion is disabled. Adjust Stock, Archive or View Materials provide the appropriate
next action; the server still enforces restrictions against races. Category viewing
opens archived records when that category contains only archived materials.

Archive is a reversible, versioned `PATCH /api/materials/:id/archive` with only
`{ archived: boolean }`. It requires the existing login, CSRF and quoted If-Match.
The server locks the row and permits archiving only at zero stock. Archived materials
reject new stock operations; prior operation UUIDs can still be replayed safely.
Reactivation is versioned. History, identifiers and relationships remain intact.

**Archive is not enabled on the university database by this work.** Migration
[004-material-archive.sql](../db/migrations/004-material-archive.sql) adds a default-false
boolean and a zero-stock constraint. It was applied only to disposable test databases.
Without it, existing reads/writes work and the UI explains archive unavailability.
`archived`, `archiveSupported` and `hasHistory` are safe boolean material response
fields. No timestamp/version contract or metadata quantity rule changed.

## 3. UI/UX and responsive review

- Dashboard retains four cards, charts, filters, sorting and See All, using active
  PostgreSQL records and existing exact calculations.
- Materials retain Add/Edit, expose labelled Adjust Stock and optional Archive,
  and provide an Archived materials filter. Reports/search omit archived materials;
  exports and history preserve them. No invisible desktop buttons were left behind.
- Categories gain View Materials and plain deletion guidance. Supplier CRUD retains
  existing relationship handling. Global search, forms, Settings and login preserve
  their established layout and keyboard behavior.
- Reports/printing retain central records, exact totals, NULL treatment, category
  filtering and white-paper output in either UI theme/language.
- The blue/white theme, dark theme and logo placeholder are preserved. Visual review
  found and fixed a narrow RTL Actions label and a cramped archive checkbox caption.
  The latter was caused by the generic filter-input flex rule applying to a checkbox.
- Stock review no longer overlaps another stock dialog. Sticky actions, focus traps,
  focus restoration, status announcements, labels and touch targets remain tested.

Required widths: 320, 375, 390, 428, 720, 768, 1024 and 1440; English/Pashto, LTR/RTL
and light/dark. Existing suites also exercise adjacent breakpoints, 200% layout
equivalence, short screens, touch emulation, long names, empty charts and printing.
The new archive-enabled stock matrix adds 32 combinations, including 320×400.
Screenshots are inspected as well as checked for overflow/containment.

## 4. PWA

Manifest: KDRU IT Inventory, standalone display, blue theme and neutral 192/512 PNG
icons with maskable safe area. No invented official university emblem was introduced.
Chromium's real `Page.getInstallabilityErrors` returned an empty list in a fresh
non-incognito profile. Private-profile installation was correctly rejected by the
browser; the test was moved to a disposable normal profile rather than ignoring it.

The registered worker caches exactly six public resources: offline HTML/CSS/JS,
manifest and the two PNGs. API requests, all mutations, protected HTML/modules,
credentials, sessions, CSRF, reports and inventory data are never cached by it.
There is no background sync or offline mutation queue. Network/5xx navigation falls
back to a bilingual public Server Unreachable page. Retry checks the real session
and then reloads authenticated data or login. First-ever offline visits cannot install.

Worker updates wait for an explicit action. Open forms, pending/uncertain requests
and recovery errors block reload. Another tab's draft is never forcibly reloaded.
An already-activated update can still be adopted by a later tab through its Update
button. Offline edits remain blocked in an already-open form, and real server
reconnection restores confirmation without replacing its quantity draft.

See [PWA.md](PWA.md) for secure-context, certificate-trust, browser-policy, installation,
update and uninstall instructions. No physical installation or university HTTPS setup
was performed. Localhost testing is not proof that a plain HTTP LAN IP supports PWA.

## 5. Backup and recovery

`tools/backup-database.mjs` creates a unique custom-format PostgreSQL dump, excludes
live session rows, checks `pg_restore --list`, verifies required tables and writes a
SHA-256 sidecar. It does not overwrite backups, restore databases, schedule tasks or
delete old versions. It takes explicit database/account/path arguments and does not
read `.env`. Secrets belong in an administrator-protected password file.

The isolated restore test created a second database and checked schema constraints,
counts, exact balances, relationships, historical movements, UUID/idempotency receipts,
Admin hash preservation, zero sessions, replay without a second effect and real
Express read compatibility. Restored row version tokens are expected to change.
No real university backup/archive was accessed or restored.

[BACKUP-AND-RECOVERY.md](BACKUP-AND-RECOVERY.md) includes commands, protected/off-computer
storage, daily/weekly/monthly retention, failure review, restore rehearsal and disaster
recovery. `pg_verifybackup` is not used for logical dumps. A table-of-contents/checksum
check alone is not claimed as proof of restoration. Windows ACLs, a backup account,
production scheduling and actual restore sign-off remain administrator tasks.

## 6. Security and reliability review

Existing bcrypt authentication, session regeneration, expiry/logout, generic login
errors, throttling, HttpOnly/SameSite cookies, HTTPS Secure configuration, trusted
loopback proxy handling and CSRF/origin checks remain unchanged. The static allowlist
adds the required modules and explicitly public offline resources; private source
paths remain inaccessible. Public offline resources issue no session cookies.

Parameterized SQL, limited application role, loopback database configuration, row
locks, exact NUMERIC values, atomic transactions and durable retry receipts remain.
Archive tests also exercise authentication/CSRF/version rejection. The PWA E2E suite
uses real PostgreSQL Admin/session storage, not the in-memory session fixture used
by some existing isolated tests. No new user-role system was added.

No demonstrable auth/CSRF bypass was found in tested paths. The dormant worker draft
would have cached protected HTML if enabled unchanged; it was replaced before
registration. Full LAN security still needs a reviewed proxy, firewall, trusted HTTPS,
least-privilege grants, protected secrets, backups and operational review.

No new runtime dependencies, framework, WebSockets or global polling layer. Existing
coalesced reads and idle refresh remain. Archive history flags use the existing
material-history index. Test concurrency is bounded to two files to reduce simultaneous
disposable-cluster startup/cleanup pressure on Windows; no assertions are disabled.

## 7. Multi-client evidence

Independent clients were authenticated against one real test Express/PostgreSQL
instance. Verified creation visibility, stock visibility, concurrent negative-stock
prevention, stale metadata rejection, relationship refresh, session expiry, offline
blocking and same-UUID retry. The new PWA suite adds three independent browser contexts
with PostgreSQL sessions and a same-profile second tab retaining its unsaved draft
during worker activation. These are simulated clients on this machine, not three
physical university computers. The physical checklist is in
[LAN-DEPLOYMENT-CHECKLIST.md](LAN-DEPLOYMENT-CHECKLIST.md).

## 8. Verification results

The completed full `npm test` run reports **148 passed, 0 failed, 0 skipped**.

| Non-overlapping automated group | Passed |
| --- | ---: |
| Unit/model/configuration/client and worker-policy tests | 75 |
| Express HTTP tests with synthetic dependencies | 27 |
| Real PostgreSQL scenarios: metadata 17, stock 21, archive 4, restore 1 | 43 |
| PostgreSQL parent containers counted by Node | 3 |
| Total | 148 |

The original 137 tests remain; 11 tests/countable containers were added. Translation
completeness checks every dictionary pair. Auth-specific tests remain included in
these totals, with additional real-session/PWA browser coverage.

Final browser results: **99 passed, 0 failed, 0 skipped**.

| Browser suite | Passed |
| --- | ---: |
| Authentication | 8 |
| Main CRUD/navigation | 19 |
| Redesign | 9 |
| Redesign edge cases | 7 |
| Stock and print | 9 |
| QA | 11 |
| UI stabilization | 6 |
| Frontend/Express/PostgreSQL integration | 22 |
| PWA/archive/three independent clients | 8 |
| Total | 99 |

Stock/print, stabilization, integration and PWA suites were rerun after their final
related changes. Both primary 224-case main-section matrices pass, plus 32
archive-enabled width/language/theme cases: **480 matrix-case executions**. Eight
offline widths, adjacent breakpoints and other targeted checks also pass. These are
executed cases, not unique physical devices. All eight requested widths are covered.

The three new automated PWA checks and eight PWA browser checks pass. Browser
installability errors and unexpected PWA page errors are empty. The archive filter's
visibility, checkbox width and readable caption are asserted, and its focused
320px Pashto screenshot was visually inspected. Desktop/mobile dashboards, tablet
materials, direct stock dialogs and Pashto print output were also inspected.

All **23 changed/new JavaScript files** passed `node --check`; `git diff --check`
passed. A final focused repository/link/resource/translation/model run passed
**17 tests** (already included in the 148, not additional unique tests).

Early runs exposed test expectation changes (new material booleans and exact zero
scale), private-profile installation policy, an obsolete two-click update expectation,
and interrupted/failed Windows fixture runs. A final screenshot rerun also hit an
`initdb` disk-sync timeout and a Windows runner exit; the subsequent isolated run
completed all eight checks and exited successfully. An Escape test was synchronized
with the native dialog's queued close/reopen event, with added assertions for one
open dialog and preserved draft quantities. Final counts above use completed passing
runs only. Expected deliberately injected API failures are distinguished from
unexpected console/page/resource errors. No tests were removed or weakened.

Evidence: `tests/artifacts/phase-3b-4/automated-final.log`, `archive-backup.log`,
`browser.log`, `integration-final.log`, `stock-layout-final.log`, `pwa-verification.log`,
`pwa-results.json`, `adjust-320-ps.png`, `adjust-1440-en.png`,
`archive-materials-320-ps.png`, `archive-filter-320-ps.png` and `offline.png`. Existing suites also refresh their
original screenshot/result locations. Generated artifacts are ignored by Git.

## 9. Important changed files

Production: `app/main.js`, `app/stock-input.js`, `app/pwa.js`, `app/api.js`,
`app/i18n.js`, `app/styles.css`, `index.html`, `server/app.js`, `server/inventory.js`,
`server/inventory-routes.js`, `server/material-archive.js`, `server/stock.js`,
`service-worker.js`, `manifest.webmanifest`, `offline.html/css/js`,
`assets/icon-192.png`, `assets/icon-512.png`, migration 004 and the backup tool.

Tests: new `stock-input.test.js`, `archive-postgres.test.js`, `backup-postgres.test.js`,
`pwa.test.js`, `pwa-browser.mjs`; updated main/integration/redesign/stock-print suites
and material response expectations. `package.json` adds the PWA test script and
bounded test concurrency; dependencies/lockfile are unchanged.

Docs: README, deployment notes, this report, [system overview](SYSTEM-OVERVIEW.md),
[staff guide](STAFF-GUIDE.md), [administrator guide](ADMINISTRATOR-GUIDE.md),
[PWA guide](PWA.md), [backup/recovery](BACKUP-AND-RECOVERY.md),
[LAN checklist](LAN-DEPLOYMENT-CHECKLIST.md), and current test/API notes.

## 10. Data safety and operational limits

No production inventory, history, schema, sessions or credentials were modified.
No production migration, import, schedule, firewall/proxy/HTTPS change, commit, push
or deployment was performed. Tests use synthetic data and self-created clusters;
they do not seed a supplied live URL or read `.env`.

Archive activation requires migration review/application. Physical three-computer
LAN testing, production HTTPS/certificate trust, OS installation/uninstallation,
physical phone keyboards, fluent Pashto review, screen-reader speech and physical
printing remain manual. A 200% equivalent viewport and touch emulation are not
physical-device certification. Cross-collection reads are not one database snapshot;
uncertain-request recovery remains tab-scoped. Keep a pending tab open.

The original user-reported live stock failure remains unconfirmed without its
reproduction details. The identified numeral defect and demonstrated UX problems
are fixed; exercised stock/API/database workflows pass. No unsupported root cause
or blanket production-readiness claim is made.

## 11. Deployment readiness

The safe local implementation has passed final verification and is ready for
supervised deployment preparation. It is not an already deployed or fully
operationally approved LAN system. Complete the supervised checklist, optional archive
migration, actual backup setup/rehearsal, trusted HTTPS and physical-client acceptance
before university deployment. No follow-on deployment work is started automatically.

## 12. Next steps

1. Review this report, [staff guide](STAFF-GUIDE.md) and [administrator guide](ADMINISTRATOR-GUIDE.md).
2. Restart the existing server with `npm start`, then use the existing authorized
   login at `http://127.0.0.1:8080`. No new packages are required for this phase.
3. Have the administrator review migration 004 and backup/recovery before any live
   application. Do not run the test fixture schema on the university database.
4. Prepare the approved hostname/HTTPS, scheduled backups and physical-client checks
   using the LAN checklist. Do not expose Express/PostgreSQL ports directly.
5. If the reported removal failure still appears, retain its exact visible message,
   material/quantity and browser request status; do not clear history or site data.

Exact isolated verification commands are in the administrator guide. This phase
stops after verified source/documentation delivery; no commit, push or deployment.
