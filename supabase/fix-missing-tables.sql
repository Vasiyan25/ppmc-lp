-- ==========================================================================
-- PPMC FIX: Recreate missing tables (product_categories, design_categories,
-- enquiries) that were never created when schema.sql was partially applied.
--
-- HOW TO RUN:
--   1. Open https://supabase.com/dashboard → your project → SQL Editor
--   2. Paste this ENTIRE file and click "Run"
--   3. Then run seed.sql (or just section 1 & 2 below) to populate categories
--
-- Safe to run multiple times (idempotent).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. MISSING TABLES
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.design_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
-- 2. INDICES
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS product_categories_active_idx
  ON public.product_categories (active);
CREATE INDEX IF NOT EXISTS design_categories_active_idx
  ON public.design_categories (active);
CREATE INDEX IF NOT EXISTS enquiries_status_idx
  ON public.enquiries (status);
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx
  ON public.enquiries (created_at DESC);

-- --------------------------------------------------------------------------
-- 3. MODDATETIME TRIGGERS (only if the function exists from schema.sql;
--    create it here too so this file is self-contained)
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

DROP TRIGGER IF EXISTS product_categories_moddatetime ON public.product_categories;
CREATE TRIGGER product_categories_moddatetime
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

DROP TRIGGER IF EXISTS design_categories_moddatetime ON public.design_categories;
CREATE TRIGGER design_categories_moddatetime
BEFORE UPDATE ON public.design_categories
FOR EACH ROW EXECUTE FUNCTION public.moddatetime();

-- --------------------------------------------------------------------------
-- 4. SECURITY DEFINER HELPER (recreate to be safe — same as schema.sql)
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

REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO service_role;

-- --------------------------------------------------------------------------
-- 5. ENABLE ROW LEVEL SECURITY
-- --------------------------------------------------------------------------
ALTER TABLE public.product_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries           ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 6. RLS POLICIES
-- --------------------------------------------------------------------------

-- ~~~~~~~~~~~~~~~~~~~~
-- 6.1 product_categories
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
-- 6.2 design_categories
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
-- 6.3 enquiries
-- ~~~~~~~~~~~~~~~~~~~~
DROP POLICY IF EXISTS enquiries_insert_public ON public.enquiries;
CREATE POLICY enquiries_insert_public ON public.enquiries
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS enquiries_select_admin ON public.enquiries;
CREATE POLICY enquiries_select_admin ON public.enquiries
  FOR SELECT
  USING (public.is_active_admin() = true);

DROP POLICY IF EXISTS enquiries_update_admin ON public.enquiries;
CREATE POLICY enquiries_update_admin ON public.enquiries
  FOR UPDATE
  USING (public.is_active_admin() = true)
  WITH CHECK (public.is_active_admin() = true);

-- --------------------------------------------------------------------------
-- 7. SEED CATEGORIES (from seed.sql — safe to re-run, ON CONFLICT DO NOTHING)
-- --------------------------------------------------------------------------
INSERT INTO public.product_categories (name, slug, active) VALUES
  ('Threads',              'threads',                true),
  ('Lining',               'lining',                 true),
  ('Fall',                 'fall',                   true),
  ('Lace & Trims',         'lace-trims',             true),
  ('Cutters & Trimmers',   'cutters-trimmers',       true),
  ('Scissors',             'scissors',               true),
  ('Machine Oil',          'machine-oil',            true),
  ('Women''s Wear',        'womens-wear',            true),
  ('Custom Stitching',     'custom-stitching',       true),
  ('Alterations',          'alterations',            true),
  ('Essentials',           'essentials',             true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.design_categories (name, slug, active) VALUES
  ('Saree Blouses',        'saree-blouses',          true),
  ('Kurti',                'kurti',                  true),
  ('Chudidar / Salwar',    'chudidar-salwar',        true),
  ('Dresses',              'dresses',                true),
  ('Bridal',                'bridal',                 true),
  ('Party Wear',            'party-wear',             true),
  ('Kids Wear',             'kids-wear',              true),
  ('Men''s Alterations',    'mens-alterations',       true),
  ('Trending Designs',      'trending-designs',       true)
ON CONFLICT (slug) DO NOTHING;

-- ==========================================================================
-- DONE. Verify in the SQL Editor with:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- Expected: admins, designs, enquiries, product_categories,
--           product_categories, products
-- ==========================================================================
