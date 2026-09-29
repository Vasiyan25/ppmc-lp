-- ==========================================================================
-- PPMC FIX: Storage RLS policies for image upload.
--
-- PROBLEM: Admin panel image upload fails with
--   403 "new row violates row-level security policy"
--   because the storage policies from schema.sql section 8 (listed as
--   "manual dashboard steps") were never created.
--
-- HOW TO RUN:
--   1. Open https://supabase.com/dashboard → your project → SQL Editor
--   2. Paste this ENTIRE file and click "Run"
--   3. Retry the image upload in the admin panel.
--
-- Safe to run multiple times (idempotent).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. PUBLIC READ — anyone can view images (needed for the public site)
--    Covers all three buckets. If a bucket was already made public via the
--    dashboard, this extra policy is harmless (policies are OR'd together).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS ppmc_storage_public_read ON storage.objects;
CREATE POLICY ppmc_storage_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('product-images', 'design-images', 'site_images'));

-- --------------------------------------------------------------------------
-- 2. ADMIN INSERT — active admins can upload images
--    is_active_admin() is the SECURITY DEFINER helper from schema.sql
--    (checks the caller's UUID exists in public.admins with active = true).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS ppmc_storage_admin_insert ON storage.objects;
CREATE POLICY ppmc_storage_admin_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('product-images', 'design-images', 'site_images')
    AND public.is_active_admin() = true
  );

-- --------------------------------------------------------------------------
-- 3. ADMIN UPDATE — active admins can replace images
--    Required because the admin app uploads with `upsert: true`.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS ppmc_storage_admin_update ON storage.objects;
CREATE POLICY ppmc_storage_admin_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('product-images', 'design-images', 'site_images')
    AND public.is_active_admin() = true
  )
  WITH CHECK (
    bucket_id IN ('product-images', 'design-images', 'site_images')
    AND public.is_active_admin() = true
  );

-- --------------------------------------------------------------------------
-- 4. ADMIN DELETE — active admins can remove images
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS ppmc_storage_admin_delete ON storage.objects;
CREATE POLICY ppmc_storage_admin_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('product-images', 'design-images', 'site_images')
    AND public.is_active_admin() = true
  );

-- ==========================================================================
-- DONE. Verify with:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects';
-- Expected: ppmc_storage_public_read (SELECT), ppmc_storage_admin_insert
--   (INSERT), ppmc_storage_admin_update (UPDATE), ppmc_storage_admin_delete
--   (DELETE) — plus any policies Supabase created automatically.
-- ==========================================================================
