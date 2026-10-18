-- TEST FIXTURE ONLY: schema-only snapshot from 2026-10-18. Never run on university_inventory.
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: price_amount; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.price_amount AS numeric
	CONSTRAINT price_amount_range_and_precision CHECK (((VALUE >= (0)::numeric) AND (VALUE <= 999999999.99) AND (VALUE = trunc(VALUE, 2))));


--
-- Name: stock_amount; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.stock_amount AS numeric
	CONSTRAINT stock_amount_range_and_precision CHECK (((VALUE >= (0)::numeric) AND (VALUE <= 999999999.999) AND (VALUE = trunc(VALUE, 3))));


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_account (
    id smallint DEFAULT 1 NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT admin_account_id_check CHECK ((id = 1)),
    CONSTRAINT admin_account_password_hash_check CHECK ((btrim(password_hash) <> ''::text)),
    CONSTRAINT admin_account_username_check CHECK ((btrim(username) <> ''::text))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT categories_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: inventory_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category_id uuid NOT NULL,
    current_stock public.stock_amount DEFAULT 0 NOT NULL,
    supplier_id uuid,
    unit text,
    serial_number text,
    location text,
    condition text,
    price public.price_amount,
    purchase_date date,
    responsible_person text,
    reorder_level public.stock_amount,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT materials_current_stock_check CHECK (((current_stock)::numeric >= (0)::numeric)),
    CONSTRAINT materials_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    quantity_delta numeric NOT NULL,
    reason text,
    admin_id smallint DEFAULT 1 NOT NULL,
    operation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT stock_movements_quantity_delta_check CHECK (((quantity_delta <> (0)::numeric) AND ((quantity_delta >= '-999999999.999'::numeric) AND (quantity_delta <= 999999999.999)) AND (quantity_delta = trunc(quantity_delta, 3))))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact text,
    phone text,
    email text,
    address text,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT suppliers_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: admin_account admin_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_account
    ADD CONSTRAINT admin_account_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: inventory_sessions inventory_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_sessions
    ADD CONSTRAINT inventory_sessions_pkey PRIMARY KEY (sid);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_operation_material_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_operation_material_unique UNIQUE (operation_id, material_id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: categories_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_normalized_name_unique ON public.categories USING btree (lower(btrim(name)));


--
-- Name: inventory_sessions_expire_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_sessions_expire_idx ON public.inventory_sessions USING btree (expire);


--
-- Name: materials_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materials_category_id_idx ON public.materials USING btree (category_id);


--
-- Name: materials_serial_normalized_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX materials_serial_normalized_unique ON public.materials USING btree (lower(btrim(serial_number))) WHERE ((serial_number IS NOT NULL) AND (btrim(serial_number) <> ''::text));


--
-- Name: materials_supplier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materials_supplier_id_idx ON public.materials USING btree (supplier_id);


--
-- Name: stock_movements_material_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_material_created_idx ON public.stock_movements USING btree (material_id, created_at DESC);


--
-- Name: suppliers_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX suppliers_normalized_name_unique ON public.suppliers USING btree (lower(btrim(name)));


--
-- Name: admin_account admin_account_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_account_set_updated_at BEFORE UPDATE ON public.admin_account FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: categories categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: materials materials_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materials_set_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers suppliers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: materials materials_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: materials materials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin_account(id) ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--
