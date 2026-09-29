# PPMC Admin System — Specification v1

## 1. Problem

PadmaPriya Multi Choice boutique currently has a public-facing landing page with hard-coded products and designs. Adding, editing, or removing catalog content requires manual code edits and a redeployment. There is no authenticated admin dashboard, no Supabase-backed authorization for editors, no Row Level Security, no structured products table, and no Storage-backed image pipeline. A production-grade content management system is needed so the owner can update the catalog safely, in real time, without touching code.

## 2. Users

| User | Capabilities |
|---|---|
| Public Visitor | Browse active products, active designs, active categories, enquire via WhatsApp. |
| Active Admin (`admins.active = true`) | Login via Supabase Auth; CRUD products, designs, categories; upload/replace/delete Storage images; view dashboard statistics; manage own session. |
| Authenticated Non-Admin User | Cannot read or write admin data; auto signed out and redirected if they reach `/admin.html`. |

## 3. Goals

- Replace the hard-coded catalog (tailoring essentials, featured collection, designs grid) with live Supabase data.
- Provide a production admin dashboard with login, authorization, CRUD tables, modals, toasts, filters, pagination and responsive layout.
- Store product and design images in dedicated Supabase Storage buckets with proper policies.
- Enforce strict PostgreSQL RLS so public readers can only see `active = true` rows and only active admins can mutate.
- Preserve every existing piece of business content (WhatsApp number, address, email, existing CSV products/designs, services, hero text, booking/upload modals, images table).
- Create a reproducible SQL schema + seed so the Supabase project can be set up or migrated safely.

## 4. Non-Goals

- No Firebase usage anywhere (storage, auth, database).
- No payment gateway, no e-commerce cart, no online checkout.
- No self-service admin registration — admins are added via SQL / Supabase dashboard only.
- No admin UI for changing role or resetting another admin's password (use Supabase Auth dashboard).
- No introduction of a build/bundler step; keep the project as plain HTML + vanilla ES modules alongside current structure.

## 5. Functional Requirements

### 5.1 Admin Authentication & Authorization

FR-1. `/admin-login.html` page with Email + Password form, Login button, Supabase `signInWithPassword()`, clear validation/error messages.
FR-2. On successful login redirect to `/admin.html`.
FR-3. On `/admin.html` load: (a) get current session via `supabase.auth.getUser()`, (b) look up user UUID in `admins` table, (c) require `active = true`; otherwise sign out + redirect to `/admin-login.html`.
FR-4. Logout button calls `signOut()` and redirects to login.
FR-5. Session expiry or revoked session → redirect to login with informative message.
FR-6. Never store roles or passwords in `localStorage`.

### 5.2 Database Schema

FR-7. `admins` table: `id UUID PK REFERENCES auth.users(id)`, `email TEXT`, `role TEXT DEFAULT 'admin'`, `active BOOLEAN DEFAULT true`, `created_at TIMESTAMPTZ DEFAULT now()`.
FR-8. `products` table with columns: `id UUID PK gen_random_uuid()`, `name`, `description`, `category`, `subcategory`, `price NUMERIC`, `price_type TEXT DEFAULT 'request' CHECK IN ('fixed','request')`, `main_image TEXT`, `gallery_images JSONB DEFAULT '[]'`, `featured BOOLEAN`, `active BOOLEAN DEFAULT true`, `stock_status TEXT DEFAULT 'available' CHECK IN ('in_stock','out_of_stock','made_to_order','available_on_request')`, `whatsapp_enabled BOOLEAN DEFAULT true`, `created_at`, `updated_at`.
FR-9. `designs` table: `id UUID PK`, `title`, `description`, `category`, `occasion`, `main_image TEXT`, `gallery_images JSONB DEFAULT '[]'`, `featured`, `active`, `created_at`, `updated_at`. Occasion values: Bridal, Wedding, Festive, Party, Everyday, Custom.
FR-10. `product_categories` and `design_categories` tables: `id, name, slug, active, created_at, updated_at`.
FR-11. `enquiries` table: `id, customer_name, phone, email, message, product_id UUID, design_id UUID, status TEXT DEFAULT 'new' CHECK IN ('new','contacted','completed','cancelled'), created_at`.
FR-12. Reusable `moddatetime()` trigger + trigger function auto-updating `updated_at` on products, designs, both category tables.
FR-13. Indices on frequently filtered columns (active, featured, category, created_at).

### 5.3 RLS Policies

FR-14. Enable RLS on `admins, products, designs, product_categories, design_categories, enquiries`.
FR-15. Public SELECT on products/designs only when `active = true`. Public SELECT on categories where `active = true`.
FR-16. Admin write policies (INSERT / UPDATE / DELETE) for products, designs, categories — guarded by `is_active_admin()` SECURITY DEFINER helper that checks `EXISTS (SELECT 1 FROM admins WHERE id = auth.uid() AND active = true)`.
FR-17. `admins` table: admins can only read own row. No public access.
FR-18. `enquiries`: public INSERT (for future integration); active admins can SELECT/UPDATE status.

### 5.4 Storage

FR-19. Create / verify buckets `product-images` (public) and `design-images` (public).
FR-20. Public READ on both buckets. INSERT/UPDATE/DELETE restricted to active admins only via Storage policies (using the same admin check).
FR-21. Path convention: `products/{productId}/main/{filename}`, `products/{productId}/gallery/{filename}`, `designs/{designId}/main/{filename}`, `designs/{designId}/gallery/{filename}`.
FR-22. Validate uploads client-side: JPG/JPEG/PNG/WEBP only, max 5 MB per image, with clear errors.
FR-23. Never base64 images into PostgreSQL — store only the storage public URL or path.

### 5.5 Admin UI

FR-24. Separate admin look (sidebar + main on desktop, collapsible sidebar on mobile) in `admin.html` with distinct visual tokens (charcoal/cream/gold palette but layout distinct from boutique).
FR-25. Navigation: Dashboard · Products · Designs · Categories · Enquiries · Settings · Logout.
FR-26. Dashboard stats cards: Total/Active/Featured Products and Total/Active/Featured Designs — all counts fetched from Supabase, never hard-coded.
FR-27. Products table columns: Image, Product, Category, Price, Stock, Featured, Status, Updated, Actions (Edit / Delete / Duplicate / Toggle Active). Include search, filters (category, stock, active, featured), sort (newest/oldest/name/price), pagination for large sets.
FR-28. Designs table columns: Image, Design, Category, Occasion, Featured, Status, Updated, same actions + search/filtering/sort.
FR-29. Product & Design modals for Create/Edit with all fields, live image upload + preview + replace + delete, clear field-level validation, Save/Update/Cancel/Delete buttons, toast on success/error.
FR-30. Categories sub-page with tabs for Product & Design categories, CRUD, active toggle, delete confirmation, protection against deleting a category in use.
FR-31. Settings page shows logged-in admin email, role, account status, and Logout button.
FR-32. Enquiries page placeholder listing enquiries table with status filter (architecture only, no fake data).
FR-33. Every table/section shows loading skeleton, empty state, error state with actionable message.
FR-34. Toast notifications for every mutation ("Product saved successfully.", "Unable to upload image.", etc.).

### 5.6 Public Website Integration

FR-35. `index.html` featured collection section (`#tailoring-essentials` + featured collection section) dynamically populated from `products` WHERE `active = true AND featured = true`, limited to ~6-8 items, with "View All Collection" link to catalog anchor.
FR-36. Tailoring essentials category cards section populated from active product categories where appropriate, preserving existing visuals.
FR-37. Designs catalog grid populated live from `designs` WHERE `active = true`, merged with the existing designs refresh function; featured designs promoted in a new "Crafted By Us" gallery section before the designs grid, with "View All Designs" anchor link.
FR-38. WhatsApp enquiry per product using the EXISTING business number `919008765431` and prefilled message `Hi, I am interested in {ProductName}.`; per-product `whatsapp_enabled` flag respected.
FR-39. Preserve: hero copy, signature services section, how-it-works, upload-your-design modal flow, booking modal, about copy + stats, CTA band, footer address/email/phone/socials links, responsive breakpoints and design language.
FR-40. Handle Supabase fetch errors gracefully (console errors + fallback to empty/placeholder visuals instead of crashing UI).

### 5.7 Data Migration

FR-41. Migrate the 7 tailoring essentials products and 6 featured products hardcoded in `index.html` into the `products` table (seed.sql) preserving name, description, category, image placeholders, default WhatsApp enabled, `active=true`.
FR-42. Migrate the 9 designs from `designs.csv` into `designs` (seed.sql) preserving title, description, category; set `active=true`; map `bridal` entries → occasion Bridal, party → Party, men's → Everyday, kids → Everyday, remainder → Custom/Everyday as appropriate; no invented fields.
FR-43. Seed design_categories and product_categories based on categories actually in use in the existing site (Saree Blouses, Kurti, Chudidar / Salwar, Dresses, Bridal, Party Wear, Kids Wear, Men's Alterations, Trending Designs for designs; plus Threads, Lining, Fall, Lace & Trims, Cutters & Trimmers, Scissors, Machine Oil for products).
FR-44. Preserve `site_images` table and CSV content — do not drop or modify existing section image mapping.

### 5.8 Security

FR-45. Client code uses only Supabase anon/publishable key. service_role key must not appear in any file under the project root (scan to verify).
FR-46. All sensitive authorization enforced in PostgreSQL RLS + Storage policies. Frontend checks are UX-only.
FR-47. Environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` documented (Vercel naming) and existing `.env.local` left intact.

## 6. Non-Functional Requirements

NFR-1. **Error handling**: every Supabase call has loading/success/error/empty branches with user-facing messages.
NFR-2. **Responsive**: admin usable on ≥360px width; catalog on ≥320px; media queries at end of style blocks.
NFR-3. **Mobile nav trigger breakpoint**: public site retains 1200px header toggle.
NFR-4. **Uppercase UI elements**: buttons, nav links, eyebrows on admin use system sans-serif stack to avoid Jost uppercase rendering bugs (per project_memory convention).
NFR-5. **Flex/grid items**: `min-width: 0`, `flex-shrink: 0`, `word-break: break-word` applied to admin tables and footer elements to avoid overflow.
NFR-6. **No silent failures**: every mutation shows a toast; every network error logs console context (message, code, hint).
NFR-7. **Realtime optional**: do not enable Realtime by default; rely on standard fetches to keep things reliable.
NFR-8. **Schema portability**: a single `supabase/schema.sql` file (CREATE TABLE + indices + RLS + policies + trigger/function) and a single `supabase/seed.sql` file (existing products/designs/categories) must be runnable in Supabase SQL Editor in order.

## 7. Constraints, Dependencies, Assumptions

- Constraint: No Firebase, no service_role in browser, no fake logins, no localStorage roles.
- Constraint: Do not delete existing WhatsApp, contact, CSV, or image rows.
- Dependency: Existing `@supabase/supabase-js@2` already in package.json; use ESM import from CDN in new pages.
- Assumption: Admin accounts will be created in Supabase Auth dashboard first (email+password), then added to `admins` table by running the INSERT template in seed.sql manually.
- Assumption: Storage buckets and policies must be created manually via Supabase Dashboard (policy SQL documented in schema.sql comments because Storage DDL isn't runnable via SQL Editor).

## 8. Open Questions

None at specification time. Admin creation flow, WhatsApp number, catalog contents were all verified against existing project files.

## 9. Acceptance Criteria

| ID | Type | Criterion |
|---|---|---|
| AC-1 | rule | `/admin-login.html` accepts email/password, calls `signInWithPassword`, redirects to `/admin.html` on success; shows error on failure. |
| AC-2 | rule | `/admin.html` blocks unauthenticated access → redirects to login. |
| AC-3 | rule | Authenticated user UUID NOT in `admins` or with `active=false` → signOut() + redirect to login. |
| AC-4 | rule | `supabase/schema.sql` creates all 6 tables + moddatetime trigger + RLS enable + all policies + indices. |
| AC-5 | rule | RLS: anon client can SELECT only active products/designs/categories; cannot INSERT/UPDATE/DELETE any. |
| AC-6 | rule | RLS: authenticated active admin can INSERT/UPDATE/DELETE products/designs/categories. |
| AC-7 | rule | `product-images` and `design-images` Storage buckets exist (documented), public read, admin-only write. |
| AC-8 | rule | Product CRUD: create, read, update, delete + image upload/replace/delete work end-to-end with toasts. |
| AC-9 | rule | Design CRUD mirrors product CRUD with occasion + category support. |
| AC-10 | rule | Category CRUD prevents deletion of in-use category with confirmation. |
| AC-11 | rule | Dashboard 6 stats are live COUNTs from Supabase (verified by adding/removing rows). |
| AC-12 | rule | Public homepage Featured Products show only `active=true AND featured=true`, ≤8 items, WhatsApp buttons use `919008765431` with prefilled message containing product name. |
| AC-13 | rule | Public homepage "Crafted By Us" section shows featured active designs, with "View All Designs" link. |
| AC-14 | rule | Designs catalog grid loads from Supabase `designs` active rows, search/filter/category chips continue to work. |
| AC-15 | rule | Seed imports the 13 products (7 essentials + 6 featured) and 9 designs from CSV without invented fields. |
| AC-16 | rule | Existing business content preserved: hero, services, steps, about, CTA, footer (address, phone `+91 90087 65431`, email), upload & booking modals. |
| AC-17 | rule | `service_role` string does not appear anywhere under project root (search all files). |
| AC-18 | rule | Responsive: both admin and public pages render without horizontal scroll at 375px (mobile) and 1920px (desktop). |
| AC-19 | rule | Browser console shows no red errors after page load and after a typical CRUD workflow. |
| AC-20 | rubric | Admin UI quality (0-2): 2 = polished dashboard, clear tables/modals/toasts, loading/empty/error states; 1 = usable but rough edges; 0 = broken. Pass threshold ≥2. |
| AC-21 | rubric | Fidelity to existing boutique design on public site (0-2): 2 = layout identical, only dynamic data swapped, no visual regressions; 1 = mostly preserved, minor visual drift; 0 = obvious redesign. Pass threshold ≥2. |
