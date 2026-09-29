-- ==========================================================================
-- PPMC (PadmaPriya Multi Choice) Seed v1
-- Run AFTER schema.sql has completed.
-- Source: existing index.html hard-coded catalog + designs.csv
-- ==========================================================================

-- ==========================================================================
-- 0. HOW TO CREATE THE FIRST ADMIN (MANDATORY BEFORE USING ADMIN UI)
--
--   a) Go to Supabase → Authentication → Users → Add user → Create new user
--      (email + password). This creates an auth.users row.
--   b) Copy the UUID shown next to that user.
--   c) Run this, replacing the two placeholders:
--
--        INSERT INTO public.admins (id, email)
--        VALUES ('<YOUR-ADMIN-UUID>', '<your@admin.email>');
--
--      Example:
--        INSERT INTO public.admins (id, email)
--        VALUES ('a1b2c3d4-0000-0000-0000-000000000000',
--                'padmapriyamultichoice@gmail.com');
--
--   Do NOT delete the template row below — it has no effect.
-- ==========================================================================
-- INSERT INTO public.admins (id, email, role, active)
--   VALUES ('<YOUR-ADMIN-UUID>', '<your@admin.email>', 'admin', true);

-- ==========================================================================
-- 1. product_categories — seed categories actually in use
-- ==========================================================================
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

-- ==========================================================================
-- 2. design_categories — seed categories actually in use
-- ==========================================================================
INSERT INTO public.design_categories (name, slug, active) VALUES
  ('Saree Blouses',        'saree-blouses',          true),
  ('Kurti',                'kurti',                  true),
  ('Chudidar / Salwar',    'chudidar-salwar',        true),
  ('Dresses',              'dresses',                true),
  ('Bridal',               'bridal',                 true),
  ('Party Wear',           'party-wear',             true),
  ('Kids Wear',            'kids-wear',              true),
  ('Men''s Alterations',   'mens-alterations',       true),
  ('Trending Designs',     'trending-designs',       true)
ON CONFLICT (slug) DO NOTHING;

-- ==========================================================================
-- 3. products — 13 migrated rows
--    7 tailoring-essentials (from #tailoring-essentials category cards)
--    6 featured-collection   (from .featured .collection-grid)
--
--    NOTE: main_image fields are left empty / mapped to the keys used by
--    the site_images Supabase table. Real image uploads go to the
--    product-images bucket via the admin UI.
-- ==========================================================================

-- 7 × Tailoring Essentials
INSERT INTO public.products
  (name, description, category, subcategory,
   price, price_type, main_image, gallery_images,
   featured, active, stock_status, whatsapp_enabled)
VALUES
  (
    'Threads',
    'Strong, smooth threads in everyday and vibrant colours for every stitching project.',
    'Threads', NULL,
    NULL, 'request',
    'site_images/product-threads', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Lining',
    'Comfortable, quality lining fabrics for clean structure and a polished garment finish.',
    'Lining', NULL,
    NULL, 'request',
    'site_images/product-lining', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Fall',
    'Reliable saree fall material that adds weight, shape and a graceful drape.',
    'Fall', NULL,
    NULL, 'request',
    'site_images/product-fall', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Lace & Trims',
    'Decorative lace, borders and trims for adding character to every custom creation.',
    'Lace & Trims', NULL,
    NULL, 'request',
    'site_images/product-lace-trims', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Cutters & Trimmers',
    'Practical cutting tools for accurate fabric shaping and neat professional edges.',
    'Cutters & Trimmers', NULL,
    NULL, 'request',
    'site_images/product-cutters-trimmers', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Scissors',
    'Sharp, comfortable scissors designed for clean fabric cuts and everyday tailoring work.',
    'Scissors', NULL,
    NULL, 'request',
    'site_images/product-scissors', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),
  (
    'Machine Oil',
    'Essential sewing-machine oil for smooth running, regular care and reliable performance.',
    'Machine Oil', NULL,
    NULL, 'request',
    'site_images/product-machine-oil', '[]'::jsonb,
    false, true, 'available_on_request', true
  ),

  -- 6 × Featured Collection (featured=true so homepage picks them up)
  (
    'Kanchi Silk Edit',
    'Handwoven silk sarees finished with delicate zari borders.',
    'Women''s Wear', 'Sarees',
    NULL, 'request',
    'site_images/featured-01', '[]'::jsonb,
    true, true, 'made_to_order', true
  ),
  (
    'Signature Blouse Line',
    'Tailored blouses in bespoke cuts, fitted to your measurements.',
    'Custom Stitching', 'Blouses',
    NULL, 'request',
    'site_images/featured-02', '[]'::jsonb,
    true, true, 'made_to_order', true
  ),
  (
    'Festive Wear Edit',
    'Statement pieces designed for celebrations and special occasions.',
    'Women''s Wear', 'Festive',
    NULL, 'request',
    'site_images/featured-03', '[]'::jsonb,
    true, true, 'made_to_order', true
  ),
  (
    'Perfect Fit Studio',
    'Complete resizing and reshaping for garments old and new.',
    'Alterations', NULL,
    NULL, 'request',
    'site_images/featured-04', '[]'::jsonb,
    true, true, 'available_on_request', true
  ),
  (
    'Everyday Elegance',
    'Effortless kurtas and co-ords built for daily comfort and style.',
    'Women''s Wear', 'Everyday',
    NULL, 'request',
    'site_images/featured-05', '[]'::jsonb,
    true, true, 'made_to_order', true
  ),
  (
    'The Sewing Room Edit',
    'Premium threads, linings and trims curated for every project.',
    'Essentials', NULL,
    NULL, 'request',
    'site_images/featured-06', '[]'::jsonb,
    true, true, 'available_on_request', true
  );

-- ==========================================================================
-- 4. designs — migrated from designs.csv (9 rows)
--    Occasion mapping rules (no invented data, conservative mapping):
--      Bridal                  → Bridal
--      Party Wear              → Party
--      Men's Alterations       → Everyday
--      Kids Wear               → Everyday
--      remainder               → Custom
-- ==========================================================================
INSERT INTO public.designs
  (title, description, category, occasion,
   main_image, gallery_images,
   featured, active)
VALUES
  (
    'Classic Saree Blouse',
    'Custom-fitted saree blouse with a clean elegant finish.',
    'Saree Blouses', 'Custom',
    'site_images/service-custom-tailoring', '[]'::jsonb,
    true, true
  ),
  (
    'Straight Cut Kurti',
    'Comfortable made-to-measure kurti for everyday wear.',
    'Kurti', 'Everyday',
    'site_images/service-personalized-designs', '[]'::jsonb,
    true, true
  ),
  (
    'Classic Salwar Set',
    'Traditional salwar set tailored for comfort and grace.',
    'Chudidar / Salwar', 'Everyday',
    'site_images/service-alterations', '[]'::jsonb,
    false, true
  ),
  (
    'A Line Dress',
    'Contemporary dress designed for a clean personal fit.',
    'Dresses', 'Party',
    'site_images/service-custom-tailoring', '[]'::jsonb,
    false, true
  ),
  (
    'Bridal Silk Blouse',
    'Statement bridal blouse with refined detailing.',
    'Bridal', 'Bridal',
    'site_images/about', '[]'::jsonb,
    true, true
  ),
  (
    'Sequin Party Gown',
    'Festive gown designed for celebrations and special occasions.',
    'Party Wear', 'Party',
    'site_images/service-personalized-designs', '[]'::jsonb,
    true, true
  ),
  (
    'Kids Festive Set',
    'Comfortable festive outfit sized for growing children.',
    'Kids Wear', 'Everyday',
    'site_images/service-essentials', '[]'::jsonb,
    false, true
  ),
  (
    'Shirt Fitting',
    'Precise shirt resizing for a sharper comfortable fit.',
    'Men''s Alterations', 'Everyday',
    'site_images/service-alterations', '[]'::jsonb,
    false, true
  ),
  (
    'Boho Fusion Set',
    'Fresh fusion outfit designed around your style.',
    'Trending Designs', 'Custom',
    'site_images/service-custom-tailoring', '[]'::jsonb,
    true, true
  );
