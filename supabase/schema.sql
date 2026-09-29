-- ==========================================================================
-- PPMC (PadmaPriya Multi Choice) Supabase Schema v1
-- Run the contents of this file in order inside Supabase SQL Editor.
-- ==========================================================================
-- ORDER:
--   1. Moddatetime trigger function
--   2. Tables + defaults + CHECK constraints
--   3. Indices
--   4. Attach moddatetime triggers to tables with updated_at
--   5. is_active_admin() SECURITY DEFINER helper
--   6. ENABLE ROW LEVEL SECURITY on all tables
--   7. RLS policies per table
--   8. Storage bucket + policies setup guide (manual steps via Dashboard)
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. MODDATETIME TRIGGER FUNCTION
--    Sets NEW.updated_at = now() for any row UPDATE.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moddatetime()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2. TABLES
-- --------------------------------------------------------------------------

-- admins — every admin maps 1:1 to an auth.users(id) record
CREATE TABLE IF NOT EXISTS public.admins (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  role       TEXT      DEFAULT 'admin',
  active     BOOLEAN   DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- products — tailoring essentials + featured collection + any boutique products
CREATE TABLE IF NOT EXISTS public.products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  subcategory      TEXT,
  price            NUMERIC,
  price_type       TEXT    DEFAULT 'request'
                     CHECK (price_type IN ('fixed', 'request')),
  main_image       TEXT,
  gallery_images   JSONB   DEFAULT '[]'::jsonb,
  featured         BOOLEAN DEFAULT false,
  active           BOOLEAN DEFAULT true,
  stock_status     TEXT    DEFAULT 'available_on_request'
                     CHECK (stock_status IN (
                       'in_stock','out_of_stock',
                       'made_to_order','available_on_request'
                     )),
  whatsapp_enabled BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- designs — stitching / boutique design catalog
CREATE TABLE IF NOT EXISTS public.designs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  occasion       TEXT
                   CHECK (occasion IN (
                     'Bridal','Wedding','Festive','Party',
                     'Everyday','Custom'
                   )),
  main_image     TEXT,
  gallery_images JSONB   DEFAULT '[]'::jsonb,
  featured       BOOLEAN DEFAULT false,
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- product_categories — categories used by the products table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- design_categories — categories used by the designs table
CREATE TABLE IF NOT EXISTS public.design_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- enquiries — architecture placeholder for future form submissions
CREATE TABLE IF NOT EXISTS public.enquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  phone         TEXT,
  email         TEXT,
  message       TEXT,
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  design_id     UUID REFERENCES public.designs(id)  ON DELETE SET NULL,
  status        TEXT    DEFAULT 'new'
                  CHECK (status IN (
                    'new','contacted','completed','cancelled'
                  )),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 3. INDICES
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS products_active_idx
  ON public.products (active);
CREATE INDEX IF NOT EXISTS products_featured_idx
  ON public.products (featured);
CREATE INDEX IF NOT EXISTS products_category_idx
  ON public.products (category);
CREATE INDEX IF NOT EXISTS products_created_at_idx
  ON public.products (created_at DESC);

CREATE INDEX IF NOT EXISTS designs_active_idx
  ON public.designs (active);
CREATE INDEX IF NOT EXISTS designs_featured_idx
  ON public.designs (featured);
CREATE INDEX IF NOT EXISTS designs_category_idx
  ON public.designs (category);
CREATE INDEX IF NOT EXISTS designs_created_at_idx
  ON public.designs (created_at DESC);

CREATE INDEX IF NOT EXISTS product_categories_active_idx
  ON public.product_categories (active);
CREATE INDEX IF NOT EXISTS design_categories_active_idx
  ON public.design_categories (active);

CREATE INDEX IF NOT EXISTS enquiries_status_idx
  ON public.enquiries (status);
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx
  ON public.enquiries (created_at DESC);

-- --------------------------------------------------------------------------
-- 4. MODDATETIME TRIGGERS — auto set updated_at on row UPDATE
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS products_moddatetime ON public.products;
CREATE TRIGGER products_moddatetime
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

DROP TRIGGER IF EXISTS designs_moddatetime ON public.designs;
CREATE TRIGGER designs_moddatetime
BEFORE UPDATE ON public.designs
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

DROP TRIGGER IF EXISTS product_categories_moddatetime ON public.product_categories;
CREATE TRIGGER product_categories_moddatetime
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

DROP TRIGGER IF EXISTS design_categories_moddatetime ON public.design_categories;
CREATE TRIGGER design_categories_moddatetime
BEFORE UPDATE ON public.design_categories
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- --------------------------------------------------------------------------
-- 5. SECURITY DEFINER HELPER — is_active_admin()
--    Safe from RLS recursion because the function owns the lookup table.
--    SET search_path so SECURITY DEFINER cannot be tricked into using
--    attacker-controlled objects.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _uid UUID;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.id = _uid
      AND a.active = true
  );
END;
$$;

-- Grant execution to authenticated role (anon never needs it)
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO service_role;

-- --------------------------------------------------------------------------
-- 6. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- --------------------------------------------------------------------------
ALTER TABLE public.admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries           ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 7. RLS POLICIES
-- --------------------------------------------------------------------------

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.1 admins
-- ~~~~~~~~~~~~~~~~~~~~
-- Self-read only. No public/anon access. No direct writes via client (use SQL).
DROP POLICY IF EXISTS admins_select_self ON public.admins;
CREATE POLICY admins_select_self ON public.admins
  FOR SELECT
  USING (id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.2 products
-- ~~~~~~~~~~~~~~~~~~~~
DROP POLICY IF EXISTS products_select_public ON public.products;
CREATE POLICY products_select_public ON public.products
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS products_insert_admin ON public.products;
CREATE POLICY products_insert_admin ON public.products
  FOR INSERT
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS products_update_admin ON public.products;
CREATE POLICY products_update_admin ON public.products
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS products_delete_admin ON public.products;
CREATE POLICY products_delete_admin ON public.products
  FOR DELETE
  USING (public.is_active_admin() = true);

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.3 designs
-- ~~~~~~~~~~~~~~~~~~~~
DROP POLICY IF EXISTS designs_select_public ON public.designs;
CREATE POLICY designs_select_public ON public.designs
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS designs_insert_admin ON public.designs;
CREATE POLICY designs_insert_admin ON public.designs
  FOR INSERT
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS designs_update_admin ON public.designs;
CREATE POLICY designs_update_admin ON public.designs
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS designs_delete_admin ON public.designs;
CREATE POLICY designs_delete_admin ON public.designs
  FOR DELETE
  USING (public.is_active_admin() = true);

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.4 product_categories
-- ~~~~~~~~~~~~~~~~~~~~
DROP POLICY IF EXISTS product_categories_select_public ON public.product_categories;
CREATE POLICY product_categories_select_public ON public.product_categories
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS product_categories_insert_admin ON public.product_categories;
CREATE POLICY product_categories_insert_admin ON public.product_categories
  FOR INSERT
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS product_categories_update_admin ON public.product_categories;
CREATE POLICY product_categories_update_admin ON public.product_categories
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS product_categories_delete_admin ON public.product_categories;
CREATE POLICY product_categories_delete_admin ON public.product_categories
  FOR DELETE
  USING (public.is_active_admin() = true);

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.5 design_categories
-- ~~~~~~~~~~~~~~~~~~~~
DROP POLICY IF EXISTS design_categories_select_public ON public.design_categories;
CREATE POLICY design_categories_select_public ON public.design_categories
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS design_categories_insert_admin ON public.design_categories;
CREATE POLICY design_categories_insert_admin ON public.design_categories
  FOR INSERT
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS design_categories_update_admin ON public.design_categories;
CREATE POLICY design_categories_update_admin ON public.design_categories
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

DROP POLICY IF EXISTS design_categories_delete_admin ON public.design_categories;
CREATE POLICY design_categories_delete_admin ON public.design_categories
  FOR DELETE
  USING (public.is_active_admin() = true);

-- ~~~~~~~~~~~~~~~~~~~~
-- 7.6 enquiries
-- ~~~~~~~~~~~~~~~~~~~~
-- Public anon can INSERT (future upload/booking/enquiry forms)
DROP POLICY IF EXISTS enquiries_insert_public ON public.enquiries;
CREATE POLICY enquiries_insert_public ON public.enquiries
  FOR INSERT
  WITH CHECK (true);

-- Admins can SELECT/UPDATE status
DROP POLICY IF EXISTS enquiries_select_admin ON public.enquiries;
CREATE POLICY enquiries_select_admin ON public.enquiries
  FOR SELECT
  USING (public.is_active_admin() = true);

DROP POLICY IF EXISTS enquiries_update_admin ON public.enquiries;
CREATE POLICY enquiries_update_admin ON public.enquiries
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

-- ==========================================================================
-- 8. STORAGE BUCKETS + OBJECT POLICIES — MANUAL DASHBOARD SETUP
-- ==========================================================================
-- Storage DDL cannot be executed from SQL Editor reliably across Supabase
-- releases. Please complete these steps by hand in the Supabase Dashboard
-- after schema.sql and seed.sql have run successfully.
--
--   Bucket 1 — product-images
--     • Visibility: Make public (so URLs render without signed tokens)
--
--   Bucket 2 — design-images
--     • Visibility: Make public
--
-- Then, inside Dashboard → Storage → Policies, add 3 policies per bucket
-- (repeat replacing BUCKET_NAME below with "product-images" and then
-- "design-images"):
--
--   POLICY A — Allow public SELECT on BUCKET_NAME
--     Definition:
--       true
--     OR, if you want to be explicit by bucket:
--       bucket_id = 'BUCKET_NAME'
--
--   POLICY B — Allow active admins to INSERT into BUCKET_NAME
--     Definition:
--       bucket_id = 'BUCKET_NAME'
--       AND auth.role() = 'authenticated'
--       AND EXISTS (
--         SELECT 1 FROM public.admins
--         WHERE id = auth.uid() AND active = true
--       )
--
--   POLICY C — Allow active admins to UPDATE / DELETE in BUCKET_NAME
--     Definition:
--       bucket_id = 'BUCKET_NAME'
--       AND auth.role() = 'authenticated'
--       AND EXISTS (
--         SELECT 1 FROM public.admins
--         WHERE id = auth.uid() AND active = true
--       )
--
-- Alternatively, as a shortcut, you can create the following 2 broad
-- INSERT/UPDATE/DELETE policies once each (they cover BOTH buckets):
--
--   Admin-write storage policy (covers both buckets):
--     auth.role() = 'authenticated'
--     AND bucket_id IN ('product-images', 'design-images')
--     AND EXISTS (
--       SELECT 1 FROM public.admins
--       WHERE id = auth.uid() AND active = true
--     )
--
--   Public-read storage policy (covers both buckets):
--     bucket_id IN ('product-images', 'design-images')
--
-- After bucket creation, client code stores images at:
--   product-images : products/{productId}/main/{filename}
--                    products/{productId}/gallery/{filename}
--   design-images  : designs/{designId}/main/{filename}
--                    designs/{designId}/gallery/{filename}
-- ==========================================================================
