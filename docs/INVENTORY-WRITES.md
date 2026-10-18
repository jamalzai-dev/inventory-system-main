# Phase 3B-1: secure inventory writes

This extends the existing [read API](INVENTORY-API.md). The nine write endpoints
are implemented in the existing Express server; the frontend still uses
localStorage. Do not feed these records into `app/data.js` directly.

**Manual prerequisite:** POST requires the separately reviewed
[003-inventory-create-requests.sql](../db/migrations/003-inventory-create-requests.sql).
It has not been applied to `university_inventory`. Existing inventory tables,
constraints, timestamps, roles and credentials are not automatically changed.
PATCH/DELETE and reads do not depend on the new receipt table.

## Endpoints and security

| Resource | Create | Partial update | Delete |
| --- | --- | --- | --- |
| Categories | `POST /api/categories` | `PATCH /api/categories/:id` | `DELETE /api/categories/:id` |
| Suppliers | `POST /api/suppliers` | `PATCH /api/suppliers/:id` | `DELETE /api/suppliers/:id` |
| Materials | `POST /api/materials` | `PATCH /api/materials/:id` | `DELETE /api/materials/:id` |

All require the existing Admin session and `X-CSRF-Token` obtained from
`GET /api/auth/csrf` **after login**. Existing origin, cross-site metadata, token,
credential-version, secure-cookie and session checks remain in force. No CORS,
roles, login endpoints or public inventory access were added. Authentication runs
before write handlers and their CSRF checks. The existing global JSON parser still
rejects malformed/oversized JSON before routing with generic 400/413 errors.
Its existing strict mode also rejects non-object/non-array JSON primitives with 400;
the write validator rejects arrays and missing/non-object payloads with 422.

Send `Content-Type: application/json`. The existing 4 KiB request limit applies.
POST requires a new random UUID in `Idempotency-Key`; reuse that same key and body
when retrying that same creation. PATCH and DELETE require a quoted `If-Match`
containing the latest record's `version`. DELETE accepts no fields (omit its body).

POST returns 201 `{ "data": record }`; PATCH returns 200 `{ "data": record }`;
DELETE returns 204 without a body. All responses retain `Cache-Control: no-store`.
Existing Phase 3A names, NUMERIC strings, nulls and `{ "data": ... }` wrappers remain.
One additive read/write field, `version`, supplies an opaque 32-character token.
Do not treat it as a timestamp or derive it from `updatedAt`.

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON/path UUID or missing/malformed Idempotency-Key / If-Match |
| 401 | No valid Admin session |
| 403 | Existing CSRF verification failed |
| 404 | PATCH/DELETE record missing; existing read behavior unchanged |
| 409 | Duplicate name/serial, stale version, dependent records, positive stock, conflicting retry key, deleted retry target, or transaction conflict |
| 413 | Existing 4 KiB JSON limit exceeded |
| 422 | Invalid body/field/type/date/decimal, prohibited field/stock change, missing reference, or database value constraint |
| 503 | Database/permission/migration/connectivity failure |

Errors retain `{ "error": "safe message" }`. Raw driver errors, SQL, session
tokens, credentials and record contents are not logged or returned as diagnostics.
Parameterized queries bind every supplied value. Table/column identifiers are
fixed server allowlists; unsupported fields cannot become SQL identifiers.

## Write validation

Required on creation: `name` for every resource, plus `categoryId` for materials.
Every supplied name must be a nonempty string after trimming surrounding whitespace.
Unicode, including Pashto, is preserved. Category/supplier normalized uniqueness
and material nonblank serial uniqueness remain enforced by the existing indexes.

Allowed optional fields:

- Category: `description`.
- Supplier: `contact`, `phone`, `email`, `address`, `description`.
- Material: `supplierId`, `unit`, `serial`, `location`, `condition`, `price`,
  `purchaseDate`, `responsible`, `reorderLevel`, `description`.

All optional fields accept explicit null. Optional text accepts an empty string;
surrounding whitespace is trimmed. Objects, arrays, booleans/numbers in text fields,
NUL characters and malformed Unicode are rejected. A nonempty email must have a
basic address shape; phone/address/contact are Unicode text, not numeric fields.
Condition/location remain optional text, matching PostgreSQL rather than the
browser's mandatory fields and condition enumeration.

UUID references must be canonical hyphenated UUID text (case insensitive).
`categoryId` cannot be null. `supplierId` may be null; an empty string is invalid.
The database rejects missing references atomically, including deletion races.

Prices and reorder levels accept **decimal strings only**, or null:

- `price`: 0 through 999999999.99; at most two fractional digits.
- `reorderLevel`: 0 through 999999999.999; at most three fractional digits.
- No signs, exponents, grouping separators, surrounding whitespace, leading zeros
  except the single integral zero, NaN/Infinity, or JSON numeric values.
- Excess precision is rejected even for trailing zeros. Values are never rounded,
  parsed as floating point, or silently changed to zero. Supplied valid scale is
  preserved by PostgreSQL NUMERIC and returned as text.

`purchaseDate` accepts an actual calendar date in `YYYY-MM-DD`, years 0001–9999,
or null. Empty strings and timestamps are rejected. SQL returns calendar dates
without timezone conversion; created/updated timestamps retain Phase 3A's UTC
ISO/millisecond serialization. Timestamp precision is not used as a client version.

PATCH omission means unchanged; explicit null clears a nullable field; `""` remains
empty text; `"0"` remains decimal zero. Empty PATCH objects are rejected. Client
IDs, timestamps, versions in the body, snake_case column names, and unknown fields
are rejected. The database continues to generate IDs and timestamps.

### Stock boundary and deletion

Material POST omits `current_stock` from SQL and uses its database default zero.
The optional POST `quantity` accepts only exact zero strings (`"0"`, `"0.0"`,
`"0.00"`, `"0.000"`); its input scale is not stored, because the default supplies
the stock. Nonzero stock is explicitly rejected. Every material PATCH `quantity`
and every direct `current_stock` field is prohibited. No movements are inserted.

Category deletion relies on RESTRICT and returns 409 when materials reference it.
Supplier deletion relies on SET NULL: materials remain, their supplier becomes
null, and their existing update trigger changes their versions. Material deletion
requires zero stock and no protected references. A row lock protects the stock
check through commit; RESTRICT preserves movement history. No cascade cleanup,
soft deletion or constraint removal was introduced.

## Transactions, concurrency and retries

Each write acquires one pool client, begins READ COMMITTED, executes every dependent
statement on that client, commits once, and releases in finally. Failures roll back;
failed rollback discards the connection. No transaction mixes separate pool queries.

PATCH/DELETE lock the target row with `FOR UPDATE`, then compare the client's
version to the current row. A waiting writer sees the committed winning version
and receives 409 instead of overwriting it. No automatic retry overwrites a newer
record. The token combines PostgreSQL's row transaction identity with its exact
timestamp, hashed to an opaque value. This avoids relying on the millisecond API
timestamp or on transaction ID alone. Existing triggers use CURRENT_TIMESTAMP;
they were inspected and left unchanged. Tokens are concurrency preconditions, not
authorization secrets. Treat them as invalid after database restore/cutover.

For POST, a transaction-scoped advisory lock serializes a retry key before checking
its durable receipt. The hash includes the resource and validated, normalized
payload with sorted keys; null, omission and empty string remain distinct. The
inventory INSERT and receipt INSERT commit together. A failure leaves neither.
The same key with a different normalized payload/resource returns 409. New keys
for genuinely new requests still undergo database uniqueness constraints.

Receipts store only key, SHA-256 request digest, resource, record UUID and creation
timestamp. They do not store request/response bodies, contact details, credentials
or session tokens. A retry of a successful POST returns 201 with the **current**
record, which may have been edited since creation. It never reapplies old input.
If the record has since been deleted, retry returns 409 and cannot recreate it.
Uncertain POST outcomes should be retried with the original key. After an uncertain
PATCH/DELETE outcome, reload: a stale version or absent record prevents repetition.

**Retention:** retain receipts indefinitely, including deleted records' receipts.
There is no expiry job and the application role has no UPDATE/DELETE grant on the
receipt table. Back up/restore receipts together with inventory. Deleting old keys
would reopen duplicate creation; any future retention policy needs an explicit
protocol for rejecting expired keys before cleanup is introduced. Different keys
represent different creations, so clients must persist each pending key across
network retries rather than generating a new key for every attempt.

## Fictional request examples

Use your authenticated session and current CSRF token; the placeholders below
are documentation, not usable credentials.

```http
POST /api/categories
Content-Type: application/json
X-CSRF-Token: <current-token>
Idempotency-Key: 87b1db39-a9a8-4b3e-a86d-98118ae77b2c

{"name":"Teaching equipment","description":null}
```

```json
{"data":{"id":"3e727dea-b75d-4400-9df6-c4168bc1f0b4","name":"Teaching equipment","description":null,"createdAt":"2026-10-18T04:00:00.000Z","updatedAt":"2026-10-18T04:00:00.000Z","version":"11111111111111111111111111111111"}}
```

The IDs and versions in these examples are fictional. Use actual returned values:

```http
POST /api/materials
Content-Type: application/json
X-CSRF-Token: <current-token>
Idempotency-Key: 74a91e48-e219-44c6-988d-61b94b102bd2

{"name":"Training laptop","categoryId":"3e727dea-b75d-4400-9df6-c4168bc1f0b4","quantity":"0","price":"12500.50","reorderLevel":"2.125","supplierId":null,"location":null,"condition":null}
```

The 201 response wraps the complete Phase 3A material shape, with `quantity: "0"`,
`price: "12500.50"`, `reorderLevel: "2.125"`, and null optional values, plus `version`.

```http
PATCH /api/materials/20bbaf66-e151-4c68-a14f-6dc74ce67be1
Content-Type: application/json
X-CSRF-Token: <current-token>
If-Match: "11111111111111111111111111111111"

{"location":"Lab 2","price":null}
```

This changes only location/price and returns the complete record with a new version.
DELETE the same URL using its current quoted version and CSRF token, with no body;
success is 204. `{"quantity":"1"}` in PATCH returns 422. Reusing the old version
returns 409 with `{"error":"This record has changed. Reload it before trying again."}`.

## Manual migration instructions

1. Review migration 003. It adds only `public.inventory_create_requests` and grants
   the existing `inventory_app` role SELECT/INSERT on that table. No new schema
   columns on inventory tables, existing-grant changes, or seed records are needed.
2. After approval, open pgAdmin's Query Tool as the database administrator, explicitly
   select `university_inventory`, and execute that migration once. It intentionally
   fails if the table already exists; inspect existing state instead of rerunning.
3. Restart/start the application normally. No new environment variable or automatic
   migration runner was added. Until migration 003 exists, valid POST attempts fail
   safely with 503 before inserting inventory; existing read APIs remain usable.

The live runtime role already has the required inventory SELECT/INSERT/UPDATE/DELETE
privileges and schema USAGE. No live permissions were modified during this work.
See [verification results](PHASE-3B-1-VERIFICATION.md) and the
[future frontend integration requirements](INVENTORY-INTEGRATION.md).
