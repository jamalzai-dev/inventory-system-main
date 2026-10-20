# Transactional stock API — Phase 3B-2

Implemented on 19 October 2026. Phase 3B-3 now connects these APIs to stock forms,
history and shared frontend state. See the [integration report](PHASE-3B-3-VERIFICATION.md).

## Routes and security

| Method and path | Result |
| --- | --- |
| `POST /api/stock-operations` | Add or remove stock for one or more materials |
| `GET /api/stock-movements` | Paginated history across materials |
| `GET /api/materials/:id/movements` | Paginated history for one material |

All routes require the existing shared Admin session, including its credential
version check. POST also requires `Content-Type: application/json` and the current
`X-CSRF-Token` from `GET /api/auth/csrf` after login. Existing origin, cross-site,
cookie, logout and session protections apply. Responses retain `Cache-Control:
no-store`. No new role, public endpoint or credential is introduced.

## Operation request

```http
POST /api/stock-operations
Content-Type: application/json
X-CSRF-Token: <current-token>

{
  "operationId": "a37edcd9-bfa3-4eb6-b7d5-a4930fca10a2",
  "type": "remove",
  "reason": "Equipment issued to laboratory",
  "items": [
    {"materialId": "ec74a0ab-7073-471d-866f-7f940f59e6c1", "quantity": "2.500"},
    {"materialId": "333bd9d4-1e23-4c8c-80cc-4c99fd039b2d", "quantity": "1"}
  ]
}
```

IDs here and below are fictional. Use actual returned material IDs. Change `type`
to `add` for an addition, using a new operation UUID for that new logical action.
One item uses exactly the same contract as a batch.

- `operationId`: required hyphenated UUID; uppercase is normalized to lowercase.
  Generate and retain one UUID per logical operation. This endpoint uses the body
  UUID, not metadata creation's `Idempotency-Key` header.
- `type`: exactly `add` or `remove`. Quantities are positive for both; only the
  server creates signed deltas. Arbitrary adjustments are not supported.
- `reason`: optional text or null. Omission and null are equivalent. Surrounding
  whitespace is trimmed; empty text remains distinct from null. Unicode/Pashto is
  preserved; NUL and malformed Unicode are rejected.
- `items`: 1–25 selections before combining duplicates. Each item accepts only
  `materialId` and `quantity`. The existing 4 KiB JSON limit also applies, so a long
  reason can reduce the number of selections that fit.
- All unsupported fields are rejected, including `adminId`, `quantityDelta`,
  timestamps, versions and direct database column names. The Admin reference comes
  from the authenticated session.

Quantities must be decimal **strings** greater than zero and no greater than
`999999999.999`, with at most three fractional digits. `"2"`, `"2.5"`, `"0.125"`
and `"150.750"` are valid. JSON numbers, signs, exponents, grouping separators,
whitespace, leading integral zeros, NaN, Infinity, zero, negative values and excess
precision (even `"1.0000"`) are rejected. Nothing is silently rounded.

Repeated material selections are combined using exact BigInt thousandths, sorted
by UUID and checked against the same maximum. Thus `"2.500"` plus `"3"` becomes
`"5.5"`, with one movement for that material. PostgreSQL performs updates using
NUMERIC; its parser is unchanged. Returned decimals are exact strings; their
trailing-zero scale is not a stable formatting contract.

## Successful response

First application returns **201** with `replayed: false`; an equivalent completed
retry returns **200** with `replayed: true`. Example for a separate single-item
addition of `"2.500"` to an initially empty material:

```json
{
  "data": {
    "operationId": "71e6bd75-3b31-44e3-8562-3448ed83a227",
    "type": "add",
    "reason": null,
    "replayed": false,
    "movements": [{
      "id": "48589070-9775-4133-bcb9-67a0e96ab012",
      "materialId": "ec74a0ab-7073-471d-866f-7f940f59e6c1",
      "materialName": "Training laptop",
      "operationId": "71e6bd75-3b31-44e3-8562-3448ed83a227",
      "quantityDelta": "2.5",
      "type": "add",
      "reason": null,
      "createdAt": "2026-10-19T04:00:00.000Z"
    }],
    "balances": [{
      "materialId": "ec74a0ab-7073-471d-866f-7f940f59e6c1",
      "quantity": "2.5",
      "updatedAt": "2026-10-19T04:00:00.000Z",
      "version": "11111111111111111111111111111111"
    }]
  }
}
```

Movement and balance arrays are sorted by material UUID. Movement IDs/timestamps
are database generated. The example version is illustrative; clients must use the
actual opaque version returned. A removal returns negative `quantityDelta` text.
No account, password or session fields appear in history.

On first application balances are those computed within the committing transaction.
On replay, movement identities/deltas are the original committed rows, while
balances/versions and material names are **current reads**, not a historical
response snapshot. Other operations may change stock after any response. The
material name is its current name, not a name captured at movement creation.

## Atomicity, concurrency and deletion

Pure input validation runs before acquiring a connection. Every database-dependent
step then uses one pool client in one READ COMMITTED transaction:

1. Acquire a transaction-scoped advisory lock for the normalized operation UUID.
2. Check existing movements for an exact whole-operation replay or conflict.
3. For a new operation, lock all affected materials with `ORDER BY id FOR UPDATE`.
4. Check that every material exists and every resulting balance is within range.
5. Update each balance using NUMERIC and insert its signed movement on that client.
6. Commit once; return success only after COMMIT completes.

Any failure rolls back all balance, timestamp and movement changes. The client is
released in finally; a failed rollback discards it. Deterministic row locking
prevents opposite input order from creating a row-lock cycle. Database stock
constraints, foreign keys and movement uniqueness remain a second defense.

Two concurrent removals of 15 from 20 produce one success and one 409, leaving 5.
A batch that removes 10 from a balance of 20 and 8 from a balance of 5 returns 409;
both original balances and all history remain unchanged.

Stock updates use the existing timestamp trigger and invalidate metadata versions.
They change only `current_stock`; concurrent metadata edits cannot be overwritten.
Stock POST does not require `If-Match`: it applies a delta to the locked current
balance. Metadata PATCH/DELETE still require their current quoted version.
Generic material PATCH cannot change stock; material creation still starts at zero.
Zero-stock materials remain present. Positive stock blocks deletion, and the
existing RESTRICT foreign key blocks deleting even zero-stock materials with
history. No movement edit/delete API or history cleanup job exists.

## Durable idempotency and uncertain outcomes

The advisory lock is held until commit/rollback and uses a stock-specific namespace.
After acquiring it, the operation reads **all** persisted movements for that UUID.
It compares the complete normalized material set/count, each exact signed quantity
(including operation type), and the normalized reason on every row. A subset,
superset or changed amount/type/reason returns 409 without applying anything.
Equivalent order, duplicate splitting, decimal scale and UUID casing replay safely.
The unique `(operation_id, material_id)` constraint is additional protection; it is
not the sole whole-batch identity check. A hash collision can serialize unrelated
operations, but identity is still checked with the actual UUID.

Concurrent identical requests serialize and apply once. Durable movement rows
survive server/repository recreation. A fully rolled-back operation leaves no
receipt; retrying it can succeed. Stock does not use `inventory_create_requests`.

If the response is lost or POST returns 503, its outcome may be unknown. The API
states: `Stock operation could not be confirmed. Retry with the same operationId
and unchanged request.` Preserve the pending UUID and payload, then retry after
connectivity/authentication is restored. A committed first attempt returns replay
success; an uncommitted attempt can apply once. **Never generate a fresh UUID just
because an attempt timed out.** Reload authoritative stock after resolution. A new
UUID means a genuinely new action. Do not automatically change a conflicting body.

**Retention requirement:** movement rows are both audit history and durable retry
evidence. Preserve them indefinitely and back them up/restore them with materials.
Do not edit/delete them through manual SQL or introduce purging without a new
idempotency protocol. The inspected runtime role's existing broad table grants
were not changed; immutability is enforced by these API paths and existing deletion
restrictions, not a new database append-only privilege policy.

## Movement history and pagination

```http
GET /api/stock-movements?limit=50
GET /api/materials/ec74a0ab-7073-471d-866f-7f940f59e6c1/movements?limit=10
```

Both return `{ "data": [movement], "page": { "limit": 50, "nextCursor": "..." } }`.
Each movement has the fields shown above. `nextCursor` is null on the final page.
For the next page, pass the returned opaque value as `before`, preserving the same
route/filter, for example `?limit=50&before=<url-encoded-nextCursor>`.

`limit` defaults to 50 and accepts integer text 1–100. Unknown, repeated, malformed
or out-of-range query parameters return 400. A malformed material UUID returns 400;
a nonexistent material returns 404. Empty global history or a material with no
history returns `data: []`, with `nextCursor: null`.

Ordering is `created_at DESC, id DESC`. The validated base64url cursor carries the
full PostgreSQL microsecond timestamp and UUID, avoiding lost rows when timestamps
tie or share the same displayed millisecond. The existing API timestamp display
remains UTC ISO milliseconds; do not construct cursors from it. Cursors are paging
positions, not credentials; authentication applies independently.

Pagination is not a transaction snapshot across requests. Concurrent commits can
add records on either side of a cursor (CURRENT_TIMESTAMP reflects transaction
start, not commit order). Refresh from the first page for the latest history; an
exhaustive snapshot/export protocol is future work. Global history uses bounded
results but may require index tuning if measured production volume warrants it.

## Errors and database dependencies

All errors use `{ "error": "safe message" }`; SQL, driver details and inventory
payloads are not exposed or logged. Every supplied SQL value is parameterized.

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON/UUID or invalid history pagination |
| 401 | Authentication absent, expired, revoked or logged out |
| 403 | Existing CSRF/origin/cross-site checks failed |
| 404 | One or more selected materials missing, or history material missing |
| 409 | Insufficient stock, resulting-stock overflow, changed operation reuse, or concurrent state conflict |
| 413 | Existing 4 KiB JSON request limit exceeded |
| 422 | Invalid type/quantity/reason/body, excessive combined quantity, or unsupported fields |
| 503 | Database unavailable or stock outcome could not be confirmed |

**No new migration is required.** Read-only inspection confirmed the existing
stock domain, nonzero signed movement constraint, unique operation/material index,
material-history RESTRICT foreign key, Admin reference, timestamp trigger and
runtime privileges. Migration 003 is already manually applied; do not rerun it.
No existing migration, schema, permission or production inventory was changed.

See [verification](PHASE-3B-2-VERIFICATION.md) and the
[Phase 3B-3 integration requirements](INVENTORY-INTEGRATION.md).
