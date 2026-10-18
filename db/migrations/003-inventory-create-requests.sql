-- MANUAL REVIEW ONLY. Run as database administrator in university_inventory.
-- Durable POST retry receipts; does not alter or seed existing inventory tables.
-- Required before enabling the Phase 3B-1 POST endpoints. Never run automatically.
BEGIN;
CREATE TABLE public.inventory_create_requests (
    request_key UUID PRIMARY KEY,
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    resource TEXT NOT NULL CHECK (resource IN ('categories', 'suppliers', 'materials')),
    record_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
GRANT SELECT, INSERT ON public.inventory_create_requests TO inventory_app;
-- Keep receipts indefinitely, including after record deletion. Deleting receipts
-- would make old retry keys reusable. No automatic cleanup or runtime DELETE grant.
-- Stores only a request digest and resource identity, not request/response bodies.
COMMIT;
