-- MANUAL REVIEW/APPLICATION ONLY. Never run automatically on university_inventory.
-- Take and rehearse a database backup first. Existing records remain active.
BEGIN;
ALTER TABLE public.materials ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.materials ADD CONSTRAINT materials_archived_zero_stock
  CHECK (NOT archived OR current_stock = 0);
COMMENT ON COLUMN public.materials.archived IS
  'Inactive zero-stock record. Preserve all stock history and relationships; reversible.';
COMMIT;
-- Existing table-level inventory_app UPDATE/SELECT grants cover this column.
-- The existing updated_at trigger keeps archive changes versioned.
-- Do not drop records/history to reverse this migration. Reactivate via the API.
