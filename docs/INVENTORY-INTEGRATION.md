# PostgreSQL frontend integration

Phase 3B-3 now implements the server-backed frontend. See the
[implementation, audit mapping, architecture and verification report](PHASE-3B-3-VERIFICATION.md)
for current behavior. The planning notes below are retained as historical contract
analysis; their “future/not implemented” wording describes the pre-integration state.

## Historical planning notes

The browser still uses its existing localStorage repository. Do not restore API
records as browser backups or synchronize localStorage and PostgreSQL implicitly.
The server must become authoritative through a separately reviewed integration.
See [read mapping](INVENTORY-API.md), [write contract](INVENTORY-WRITES.md), and
the implemented [stock API](STOCK-API.md). Frontend integration is Phase 3B-3.

| Current difference | Required future behavior |
| --- | --- |
| Frontend integers/JavaScript numbers versus NUMERIC strings | Keep decimal text through inputs, validation and transport; use decimal-safe arithmetic or scaled integers with explicit scales. Stock supports three places, prices two. Never Number/parseFloat authoritative quantities. |
| Required frontend location/condition | Allow null optional fields; do not supply arbitrary defaults, classify an absent condition as Good, or turn absent prices/reorder levels into zero. |
| Numeric stock comparisons/classification | Compare exact quantities; zero is out of stock. Decide an explicit policy for null reorder levels before classifying low stock. Do not rely on coercion or lexicographic string comparisons. |
| Quantity sorting and charts | Use decimal-safe ordering/comparisons. Preserve record-count charts and existing visuals; any approximate chart coordinates must remain display-only, with exact labels and authoritative totals. |
| Reports and printing multiply quantity × price | Compute products/sums exactly (up to five combined fractional places). Define display rounding explicitly and show unknown values separately when price is null. Never silently count null price as free. |
| Global search/table text assumes strings | Handle null without indexing/displaying literal `null` or `undefined`; keep Unicode and existing safe text rendering, relationship-name lookup, keyboard navigation and persistent search. |
| Optional supplier uses empty browser string | API requires null or UUID. Deleted supplier becomes null without deleting materials; reload affected records/versions. Category remains required and deletion may return 409. |
| Browser date/timestamp handling | Preserve `YYYY-MM-DD` as a calendar date; timestamps are UTC ISO strings. Never use the displayed updatedAt as a write precondition; use the server version. |
| Synchronous local writes | Await API success before presenting persisted state. Keep edits on 422, explain 409 and offer reload/reconciliation, reauthenticate on 401, refresh CSRF appropriately on 403, and preserve drafts on 503. |
| Retries and concurrency | Store one pending POST key per creation across retries; send latest quoted If-Match for PATCH/DELETE. Never silently retry conflicts against a newer version. A POST replay returns the current record, not a historic snapshot. |
| Generic quantity editing | Create zero-stock materials and edit metadata through Phase 3B-1. Add/remove stock through `POST /api/stock-operations`; never send quantity through generic PATCH. |
| Batch Remove Materials | Send positive decimal strings with `type: remove`; the server combines duplicate selections exactly. Respect 25 selections and 4 KiB, preserve drafts on insufficient stock, and show success only after the entire batch commits. Do not split an atomic batch into independent calls. |
| Stock retries | Retain one operation UUID plus unchanged payload until its outcome is resolved. Retry lost/503 responses with that identity. Distinguish 201 first application from 200 replay; never resubmit a timeout with a fresh UUID. |
| Multi-client stock refresh | Treat returned balances/versions as point-in-time values; replay balances are current, not historic. Refresh affected records, dashboard, search, reports and history after success or conflict and when returning to stale views. |
| Movement history | Use authenticated history routes with returned opaque cursors; refresh the first page for new activity. Render reason/name as text, and retain exact signed quantities. No edit/delete history action exists. |
| Server unreachable | Preserve drafts and unresolved operation identities; show uncertainty rather than success/failure guesses. Do not introduce offline stock writes or silently fall back to localStorage. Reauthenticate and refresh CSRF before safe retries when needed. |

Keep English/Pashto, RTL, Settings, mobile actions, dashboards, search, printing and
backup features intact when the adapter is built. Backend 422 errors should be
shown safely, with deliberate localization and field feedback; never parse raw SQL
messages. Do not replace backups until a database-specific backup/restore plan is
reviewed. Browser dummy records require no migration.

Phase 3B-2 now implements exact decimal additions/deductions, atomic transactions,
protected history, concurrency and durable operation IDs. It does not implement
arbitrary adjustments, frontend adapters, decimal migration, offline stock editing,
database backup/restore integration or live refresh notifications. Phase 3B-3 must
cover nullable fields, exact dashboard totals/stock groups, decimal quantity sorting,
donut/bar chart labels, global search, reports/printing and batch removal together.
Phase 3B-2.1 repaired the translation regression and all three known overflow
failures, refined the existing interface, and verified the responsive/browser
workflows; see [UI verification](PHASE-3B-2-1-VERIFICATION.md). Frontend PostgreSQL
integration and deployment review remain separate work.
