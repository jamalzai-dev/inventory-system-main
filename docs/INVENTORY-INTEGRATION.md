# Future PostgreSQL frontend integration (not implemented)

The browser still uses its existing localStorage repository. Do not restore API
records as browser backups or synchronize localStorage and PostgreSQL implicitly.
The server must become authoritative through a separately reviewed integration.
See [read mapping](INVENTORY-API.md) and [write contract](INVENTORY-WRITES.md).

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
| Generic quantity editing | Phase 3B-1 only creates zero-stock materials and edits metadata. Route stock changes through future explicit transactional movement APIs with their own duplicate-operation protection. |

Keep English/Pashto, RTL, Settings, mobile actions, dashboards, search, printing and
backup features intact when the adapter is built. Backend 422 errors should be
shown safely, with deliberate localization and field feedback; never parse raw SQL
messages. Do not replace backups until a database-specific backup/restore plan is
reviewed. Browser dummy records require no migration.

Phase 3B-2 is limited to a separately authorized stock-operation design: exact
decimal additions/deductions/adjustments, transactions, immutable movement history,
concurrency and durable operation IDs. This phase implements none of those APIs.
The three known overflow failures also need a separate focused responsiveness fix
before deployment; backend completion is not deployment readiness.
