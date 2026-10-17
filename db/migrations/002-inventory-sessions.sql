-- Run once in university_inventory through pgAdmin as the PostgreSQL administrator.
-- This only adds session storage; it does not change the five existing tables.
BEGIN;
CREATE TABLE public.inventory_sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX inventory_sessions_expire_idx ON public.inventory_sessions (expire);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_sessions TO inventory_app;
COMMIT;
