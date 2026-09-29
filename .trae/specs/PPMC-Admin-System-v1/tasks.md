# PPMC Admin System — Implementation Tasks v1

Derived from `spec.md`. Each task has a Status (pending / in_progress / completed / blocked / cancelled), priority, local Test Requirements (rule/rubric), and completion evidence placeholders.

Coverage map: every AC in spec.md maps to at least one task-local TR.

---

## Task 1: Database schema — schema.sql (tables, indices, trigger/function, RLS, policies)

- **Priority**: high
- **Status**: pending
- **Depends On**: —
- **Files to write**: `supabase/schema.sql`
- **Scope**:
  - `moddatetime()` trigger function auto-setting `updated_at`
  - Tables: `admins`, `products`, `designs`, `product_categories`, `design_categories`, `enquiries`
  - CHECK constraints (price_type, stock_status, enquiries.status)
  - Indices: active, featured, category, created_at
  - RLS ENABLE on all 6 tables
  - SECURITY DEFINER `is_active_admin()` helper safe from RLS recursion
  - Policies: public SELECT (active only) on products/designs/categories; admin write on them; admins self-read only; enquiries public-insert / admin-select-update
  - Storage policy SQL documented (because Storage DDL goes via dashboard) for both buckets
- **Test Requirements**:
  - TR-1 (rule): `schema.sql` is valid PostgreSQL that runs in Supabase SQL Editor without hard errors (verified by reading every CREATE TABLE / CREATE POLICY / CREATE FUNCTION grammar shape).
  - TR-2 (rule): All 6 tables present with all columns and all specified defaults and CHECK constraints present.
  - TR-3 (rule): `is_active_admin()` SECURITY DEFINER function exists and is referenced by write policies.
  - TR-4 (rule): All 6 tables have RLS enabled; every table has at least 1 policy and no table has an unconditional permissive policy.
  - TR-5 (rule): moddatetime trigger attached to products, designs, product_categories, design_categories.

---

## Task 2: Data seed — seed.sql (existing products, designs, categories)

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 1
- **Files to write**: `supabase/seed.sql`
- **Scope**:
  - 7 tailoring-essentials product entries extracted from index.html (Threads, Lining, Fall, Lace & Trims, Cutters & Trimmers, Scissors, Machine Oil)
  - 6 featured product entries (Kanchi Silk Edit, Signature Blouse Line, Festive Wear Edit, Perfect Fit Studio, Everyday Elegance, The Sewing Room Edit), featured=true
  - 9 design entries from designs.csv
  - product_categories & design_categories matching actually-used categories with slugs
  - SQL template for manually inserting first admin UUID + email into admins (INSERT INTO admins(id, email) VALUES ('<UUID from auth dashboard>', '<email>');
- **Test Requirements**:
  - TR-1 (rule): seed.sql is runnable after schema.sql; contains exactly 13 products, 9 designs, ~16 categories with no invented descriptions or prices.
  - TR-2 (rule): All 9 designs from designs.csv appear with title/description/category preserved.
  - TR-3 (rule): Admin insertion template comment block present.

---

## Task 3: Shared client libs — shared Supabase config, admin auth guards, helpers

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 1
- **Files to write/update**:
  - Update `src/lib/supabase.js` to export `SUPABASE_URL`, `SUPABASE_PROJECT`, `STORAGE_BASE`, `WHATSAPP_NUMBER`, `BUSINESS_EMAIL`, utility `resolvePublicUrl`, `formatCurrency`, `showToast`, `formatDate`, `confirmDialog` helpers.
  - New `src/lib/auth.js` — `ensureActiveAdmin()` guard, `redirectIfUnauthenticated()`, `logoutAdmin()`
- **Scope**:
  - Keep existing anon key usage.
  - WHATSAPP_NUMBER = '919008765431', email from existing footer
  - Toast markup injection helper.
- **Test Requirements**:
  - TR-1 (rule): `service_role` string does not appear in any new lib file.
  - TR-2 (rule): `ensureActiveAdmin()` calls `getUser()` → `from('admins').select().eq('id', uid).eq('active', true).single()` → rejects if fails calls signOut and redirects to admin-login.html.
  - TR-3 (rule): Helper module exports are ES modules consumable by both admin pages.

---

## Task 4: Admin Login page — admin-login.html

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 3
- **Files to write**: `admin-login.html` + inline `<style>` + `<script type="module">`
- **Scope**:
  - Centered branded PPMC Admin card with PADMAPRIYA MULTI CHOICE header
  - Email + password fields, Login button, disabled loading state, toast for errors
  - On success: `signInWithPassword` → redirect to admin.html
  - On invalid: "Invalid email or password." style toast
  - On session expiry message handling
- **Test Requirements**:
  - TR-1 (rule): Form prevents submission with empty fields (client-side messages).
  - TR-2 (rule): On bad credentials → toast, no redirect.
  - TR-3 (rule): Admin UI font conventions (system sans-serif stack) applied; uppercase UI elements

---

## Task 5: Admin shell — admin.html structure, sidebar, routing, settings page

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 3
- **Files to write**: `admin.html` with full markup, inline styles, inline script skeleton + new file `src/admin/app.js`
- **Scope**:
  - Sidebar + topbar, sidebar collapse/expand on mobile, header "PPMC ADMIN / Padmapriya Multi Choice"
  - 7 nav items: Dashboard, Products, Designs, Categories, Enquiries, Settings, Logout
  - Each nav click → toggle visible section `data-section="..."`
  - Settings section: email, role, account status pulled from admins row + Logout button
  - Session guard on load → on every page load via ensureActiveAdmin()
  - Toast container, loading states
- **Test Requirements**:
  - TR-1 (rule): Unauthenticated → redirected to admin-login.html within 2s without seeing content.
  - TR-2 (rule): Authenticated non-admin (no admins row OR active=false) → signOut + redirect + toast.
  - TR-3 (rule): All 7 nav items exist; mobile sidebar toggles.
  - TR-4 (rule): Settings displays email / role / status.

---

## Task 6: Dashboard statistics + product & design tables (CRUD UI, tables, filters, sort, pagination)

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 5
- **Files to write/update**: extend `src/admin/app.js`, inline modals
- **Scope — Dashboard**:
  - 6 stat cards via 3 queries or single aggregate RPC if not available → 6 separate COUNT(*) queries with filters.
- **Scope — Products**:
  - Product table columns: image, name, category, price + type, stock_status, featured badge, status badge, updated_at, actions (Edit / Delete / Duplicate / Toggle Active)
  - Search bar + filters: category select, stock select, active select, featured select
  - Sort: newest / oldest / name / price
  - Pagination (pagesize=10)
  - Modal form: all fields + main image upload + gallery multi upload + validation + Save/Update/Cancel/Delete/Confirm Delete
- **Scope — Designs**:
  - Same pattern with occasion dropdown (Bridal / Wedding / Festive / Party / Everyday / Custom)
  - Occasion select + category select populated from design_categories active rows
- **Test Requirements**:
  - TR-1 (rule): Dashboard 6 cards: add a product → total products count increases by 1; toggle featured → featured card changes; feature/ def featured → featured card counts match (rule): Product create → toast success + row appears with image.
  - TR-3 (rule): Product edit → product saved → values persisted after refresh.
  - TR-4 (rule): Product delete confirmation → row gone after.
  - TR-5 (rule): Product duplicate → new product name copy created with featured=false copied.
  - TR-6 (rule): Filter by category dropdown → only products of the filtered
  - TR-7 (rule): Sort by newest / oldest / name (toggle work (rule): Designs CRUD + create/edit/delete/duplicate/toggle active.
  - TR-9 (rule): Invalid image files rejected files (non jpg / webp  large (>5MB) → toast error and prevented.

---

## Task 7: Categories admin CRUD + in-use protection

- **Priority**: medium
- **Status**: pending
- **Depends On**: Task 6
- **Files**: extend `src/admin/app.js`
- **Scope**:
  - Tabs: Product Categories · Design Categories
  - Add/Edit modal: name, slug (simple slug auto-generated from name (simple slugif), active toggle
  - Delete: first checks if currently referenced in products (or designs); if used → "Cannot delete: used by products" error.
  - Enable/disable toggle row.
- **Test Requirements**:
  - TR-1 (rule): Add category name → appears in product/design form dropdowns (active only (rule): Delete an unused category → row removed. Used category → blocked with message + confirmation prevented.

---

## Task 8: Enquiries page (architecture placeholder)

- **Priority**: low
- **Status**: pending
- **Depends On**: Task 5
- **Files**: extend `src/admin/app.js`
- **Scope**:
  - Enquiries section: columns: created_at, customer name, phone, email, product/design links, status badge, actions.
  - Status filter dropdown.
  - Empty state ("No enquiries yet.").
  - No fake data seeded.
- **Test Requirements**:
  - TR-1 (rule): Empty enquiries page renders. Section is accessible.

---

## Task 9: Public website Supabase data integration — products, designs, crafted by us, whatsapp

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 1, 2
- **Files to update**: `index.html` bottom module script section; (update `<head>`:
  - Tailoring Essentials cards: replace hard-coded cards → dynamic product_categories active + products featured featured featured featured active products (with fallback to static if zero rows)
  - Featured collection section → featured active products (6-8 (limit 8 sorted by created desc); empty message. Add "View All Collection" → scroll to #designs or anchor.
  - Crafted By Us gallery section inserted before designs grid. Limit 8 featured active designs. Add "View All Designs" → scroll link
  - Product cards: WhatsApp buttons render only if whatsapp_enabled true; message = Hi, I am interested in {name}
  - Designs grid continues existing `loadDesignsFromSupabase updated to use new designs schema fields; categories chips read from design_categories active list if rows → preserve existing PPMC_DESIGNS_REFRESH API so
  - Existing bookings/ upload modals untouched)
- **Test Requirements**:
  - TR-1 (rule): public visitor sees only active=true rows (rule): featured product appears in featured sections; deleting a (rule): WhatsApp number on products cards → `https://wa.me/919008765431?text=Hi%2C%20I%20am%20interested%20in%20{Name}`
  - TR-4 (rule): Crafted By Us section inserted with at most 8 featured active designs, view all link scrolls
  - TR-5 (rule): designs grid loads all active designs, existing search / filter / category chips still functions
  - TR-6 (rule): if all existing sections (hero, services, steps, about, CTA, booking/upload modals, footer address/phone/email) visually identical to original.

---

## Task 10: Storage bucket policies, storage policies for buckets created, policies created manually dashboard)

- **Priority**: high
- **Status**: pending
- **Depends On**: Task 1
- **Files**: README-like SQL code inside schema.sql comments documenting exact steps for creating the buckets and adding storage policies in Supabase dashboard:
  - product-images public, design-images public
  - storage.objects RLS-like policies
    - SELECT: public if bucket = product-images OR bucket = design-images → anon can SELECT
    - INSERT/UPDATE/DELETE: only if is_active_admin() equivalent via auth.uid() admins check
- **Test Requirements**:
  - TR-1 (rule): Schema.sql contains exact step-by-step that admin must take in Supabase dashboard → Storage section.

---

## Task 11: Final testing, verification & verification verification; lint; clean up

- **Priority**: high
- **Status**: pending
- **Depends On**: Tasks 1–10
- **Scope**:
  - Grep project root for `service_role` string → zero occurrences in user code (node_modules allowed)
  - Open pages: index.html, admin-login.html, admin.html
  - responsive checks: run local dev server, spot-test workflows end-to-end:
    1. invalid login
    2. valid login
    3. unauthorized admin.html access
    4. product create/edit/delete/image upload
    5. design create/edit/delete/image upload
    6. category add/delete in-use
    7. public pages load without red errors
  - GetDiagnostics / type or any errors

- **Test Requirements**:
  - TR-1 (rule): no service_role in frontend-reachable files (grep result: exclude node_modules count 0)
  - TR-2 (rule): no red console errors visiting index.html and admin.html after login)
  - TR-3 (rubric): overall admin UI quality AC-20 ≥ 2
  - TR-4 (rubric): public site visual fidelity AC-21 ≥ 2
