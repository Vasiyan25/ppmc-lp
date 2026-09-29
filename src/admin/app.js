import {
  supabase,
  SUPABASE_URL,
  STORAGE_BASE,
  WHATSAPP_NUMBER,
  showToast,
  formatCurrency,
  formatDate,
  validateImageFile,
  resolvePublicUrl,
  resolveImageUrlFromRow,
  confirmDialog,
  slugify,
  buildWhatsAppProductLink,
  ALLOWED_IMAGE_EXT,
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES
} from '../lib/supabase.js';
import { ensureActiveAdmin, logoutAdmin, getCurrentUser, getAdminRecord } from '../lib/auth.js';

/* ========================================================================
   PPMC ADMIN APP — vanilla JS, ES module, injected into admin.html.
   Responsibilities:
     • Session guard + current admin context
     • Navigation between 7 sections
     • Dashboard 6 live counts
     • Products + Designs CRUD tables (filters, sort, pagination, modals,
       image upload/replace/delete, duplicate, toggle active)
     • Categories (product + design tabs) with in-use deletion protection
     • Enquiries (architecture placeholder, status filter)
     • Settings section (email, role, status, logout)
   ======================================================================== */

const PRODUCTS_BUCKET = 'product-images';
const DESIGNS_BUCKET  = 'design-images';
const PRICE_TYPES = ['fixed', 'request'];
const STOCK_STATUS = ['in_stock','out_of_stock','made_to_order','available_on_request'];
const DESIGN_OCCASIONS = ['Bridal','Wedding','Festive','Party','Everyday','Custom'];
const ENQUIRY_STATUS = ['new','contacted','completed','cancelled'];
const PAGE_SIZE = 10;

let state = {
  admin: null,
  user: null,
  productCategories: [],
  designCategories: [],
  products: [],
  designs: [],
  enquiries: [],
  stats: {
    totalProducts: 0, activeProducts: 0,
    totalDesigns: 0, activeDesigns: 0, featuredDesigns: 0
  },
  ui: {
    section: 'dashboard',
    products: { page: 1, search: '', category: '', stock: '', active: '', sort: 'newest' },
    designs:  { page: 1, search: '', category: '', occasion: '', active: '', featured: '', sort: 'newest' },
    enquiries:{ page: 1, status: '' },
    catActiveTab: 'product',
    editingProductId: null,
    editingDesignId: null,
    editingCatTab: null,
    editingCatId: null
  },
  productForm: null,  // {…} object during modal
  designForm: null,
  catForm: null
};

/* ========== Boot ========== */
export async function bootApp() {
  const guard = await ensureActiveAdmin();
  if (!guard || !guard.ok) return;
  state.user = guard.user;
  state.admin = guard.admin;
  renderAdminIdentity();
  wireNavigation();
  await loadInitialData();
  await showSection(state.ui.section);
}

function renderAdminIdentity() {
  const els = document.querySelectorAll('[data-admin-email]');
  els.forEach((e) => (e.textContent = state.admin.email || state.user.email || ''));
  const roleEls = document.querySelectorAll('[data-admin-role]');
  roleEls.forEach((e) => (e.textContent = state.admin.role || 'admin'));
  const statusEls = document.querySelectorAll('[data-admin-status]');
  statusEls.forEach((e) => {
    e.textContent = state.admin.active ? 'Active' : 'Disabled';
    e.style.color = state.admin.active ? '#2D7A47' : '#A5432B';
    e.style.fontWeight = 600;
  });
}

/* ========== Navigation ========== */
function wireNavigation() {
  const navBtns = document.querySelectorAll('[data-nav]');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-nav');
      if (target === 'logout') {
        const ok = await confirmDialog('Sign out of the admin dashboard?', 'Log Out');
        if (!ok) return;
        await logoutAdmin();
        return;
      }
      await showSection(target);
    });
  });
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  const sidebar = document.querySelector('[data-sidebar]');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('is-open');
    });
    document.querySelectorAll('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 960px)').matches) sidebar.classList.remove('is-open');
      });
    });
  }
}

export async function showSection(name) {
  state.ui.section = name;
  document.querySelectorAll('[data-section]').forEach((s) => {
    s.hidden = s.getAttribute('data-section') !== name;
  });
  document.querySelectorAll('[data-nav]').forEach((b) => {
    const t = b.getAttribute('data-nav');
    b.classList.toggle('is-active', t === name);
  });
  const main = document.querySelector('[data-main-title]');
  if (main) {
    const titles = {
      dashboard: 'Dashboard',
      products:  'Products',
      designs:   'Designs',
      categories:'Categories',
      enquiries: 'Enquiries',
      settings:  'Settings'
    };
    main.textContent = titles[name] || name;
  }
  if (name === 'dashboard')  { await refreshStats(); renderDashboard(); }
  if (name === 'products')   { await refreshProducts();  renderProducts(); }
  if (name === 'designs')    { await refreshDesigns();   renderDesigns(); }
  if (name === 'categories') { await refreshCategories();renderCategories(); }
  if (name === 'enquiries')  { await refreshEnquiries(); renderEnquiries(); }
  if (name === 'settings')   { renderSettings(); }
}

/* ========== Data loaders ========== */
async function loadInitialData() {
  await Promise.all([refreshCategories(), refreshProducts(), refreshDesigns(), refreshStats(), refreshEnquiries()]);
}

async function refreshStats() {
  const q = (tbl, where) => {
    let b = supabase.from(tbl).select('id', { count: 'exact', head: true });
    Object.entries(where || {}).forEach(([k, v]) => (b = b.eq(k, v)));
    return b.then((r) => (r.error ? 0 : r.count || 0));
  };
  const [tp, ap, td, ad, fd] = await Promise.all([
    q('products', {}),
    q('products', { active: true }),
    q('designs', {}),
    q('designs', { active: true }),
    q('designs', { active: true, featured: true })
  ]);
  state.stats = {
    totalProducts: tp, activeProducts: ap,
    totalDesigns: td, activeDesigns: ad, featuredDesigns: fd
  };
}

async function refreshCategories() {
  const [pc, dc] = await Promise.all([
    supabase.from('product_categories').select('*').order('name'),
    supabase.from('design_categories').select('*').order('name')
  ]);
  state.productCategories = pc.error ? [] : (pc.data || []);
  state.designCategories  = dc.error ? [] : (dc.data || []);
  if (pc.error) {
    console.error('product_categories:', pc.error);
    if (isMissingTableError(pc.error)) {
      showToast('The "product_categories" table is missing in Supabase. Run supabase/fix-missing-tables.sql in the SQL Editor.', 'error');
    }
  }
  if (dc.error) {
    console.error('design_categories:', dc.error);
    if (isMissingTableError(dc.error)) {
      showToast('The "design_categories" table is missing in Supabase. Run supabase/fix-missing-tables.sql in the SQL Editor.', 'error');
    }
  }
}

function isMissingTableError(err) {
  const msg = (err && (err.message || err.code)) || '';
  return /404|does not exist|relation/i.test(String(msg)) || err && err.code === 'PGRST205';
}

async function refreshProducts() {
  let q = supabase.from('products').select('*').limit(500);
  const s = state.ui.products.sort;
  if (s === 'newest') q = q.order('created_at', { ascending: false });
  else if (s === 'oldest') q = q.order('created_at', { ascending: true });
  else if (s === 'name') q = q.order('name', { ascending: true });
  else if (s === 'price') q = q.order('price', { ascending: true, nullsFirst: false });
  const r = await q;
  if (r.error) { showToast('Unable to load products.', 'error'); console.error(r.error); state.products = []; return; }
  state.products = r.data || [];
}

async function refreshDesigns() {
  let q = supabase.from('designs').select('*').limit(500);
  const s = state.ui.designs.sort;
  if (s === 'newest') q = q.order('created_at', { ascending: false });
  else if (s === 'oldest') q = q.order('created_at', { ascending: true });
  else if (s === 'name') q = q.order('title', { ascending: true });
  const r = await q;
  if (r.error) { showToast('Unable to load designs.', 'error'); console.error(r.error); state.designs = []; return; }
  state.designs = r.data || [];
}

async function refreshEnquiries() {
  let q = supabase.from('enquiries').select('*').order('created_at', { ascending: false }).limit(200);
  const r = await q;
  if (r.error) {
    if (isMissingTableError(r.error)) {
      console.error('enquiries:', r.error);
      showToast('The "enquiries" table is missing in Supabase. Run supabase/fix-missing-tables.sql in the SQL Editor.', 'error');
    }
    state.enquiries = [];
    return;
  }
  state.enquiries = r.data || [];
}

/* ========== Dashboard ========== */
function renderDashboard() {
  const s = state.stats;
  const set = (id, v) => { const el = document.querySelector(`[data-stat="${id}"]`); if(el) el.textContent = v; };
  set('totalProducts', s.totalProducts);
  set('activeProducts', s.activeProducts);
  set('totalDesigns', s.totalDesigns);
  set('activeDesigns', s.activeDesigns);
  set('featuredDesigns', s.featuredDesigns);
}

/* ========== Filter helpers ========== */
function filterProducts() {
  const u = state.ui.products;
  const term = u.search.trim().toLowerCase();
  return state.products.filter((p) => {
    if (u.category && p.category !== u.category) return false;
    if (u.stock && p.stock_status !== u.stock) return false;
    if (u.active !== '' && String(p.active) !== u.active) return false;
    if (term) {
      const hay = [p.name, p.description, p.category, p.subcategory, p.id].filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(term) === -1) return false;
    }
    return true;
  });
}

function filterDesigns() {
  const u = state.ui.designs;
  const term = u.search.trim().toLowerCase();
  return state.designs.filter((d) => {
    if (u.category && d.category !== u.category) return false;
    if (u.occasion && d.occasion !== u.occasion) return false;
    if (u.active !== '' && String(d.active) !== u.active) return false;
    if (u.featured !== '' && String(d.featured) !== u.featured) return false;
    if (term) {
      const hay = [d.title, d.description, d.category, d.occasion, d.id].filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(term) === -1) return false;
    }
    return true;
  });
}

function paginate(list, page, size) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  return { items: list.slice(start, start + size), pages, page: p, total };
}

/* ========== Products table ========== */
function productImage(p) {
  const url = resolveImageUrlFromRow(p, '');
  if (url) return url;
  return '';
}

function renderProducts() {
  const items = filterProducts();
  const p = paginate(items, state.ui.products.page, PAGE_SIZE);
  state.ui.products.page = p.page;
  wireProductsToolbar();
  const tbody = document.querySelector('[data-products-body]');
  const empty = document.querySelector('[data-products-empty]');
  const countEl = document.querySelector('[data-products-count]');
  const pagEl = document.querySelector('[data-products-pagination]');
  if (countEl) countEl.textContent = `${p.total} product${p.total === 1 ? '' : 's'} · Page ${p.page} of ${p.pages}`;
  if (!tbody) return;
  tbody.innerHTML = '';
  if (p.total === 0) {
    if (empty) empty.hidden = false;
    if (pagEl) pagEl.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  const rows = p.items.map((pr) => {
    const img = productImage(pr);
    return `<tr data-id="${pr.id}">
      <td style="padding:10px 14px; width:80px; min-width:0;">
        <div style="width:56px; height:56px; border-radius:3px; background:linear-gradient(155deg,#E7D4AC,#8C6A3C); display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${img ? `<img src="${img}" alt="" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-family:'Cormorant Garamond',serif; color:#FAF6EE; font-style:italic;">PP</span>`}
        </div>
      </td>
      <td style="padding:10px 14px; min-width:0;">
        <div style="font-weight:600; color:#2A2019; font-size:14px; word-break:break-word;">${escapeHtml(pr.name)}</div>
        <div style="font-size:12px; color:#5C4C3E; margin-top:2px; word-break:break-word;">${escapeHtml(pr.description || '—').slice(0, 100)}</div>
      </td>
      <td style="padding:10px 14px; min-width:0;"><span style="font-size:12px; padding:4px 8px; background:#ECDFC2; border:1px solid #D9BC85; border-radius:3px; color:#604519;">${escapeHtml(pr.category || '—')}</span></td>
      <td style="padding:10px 14px; min-width:0; white-space:nowrap;">
        <div style="font-weight:600; color:#2A2019;">${pr.price_type === 'fixed' ? formatCurrency(pr.price, '—') : '<em style="color:#B58A4A;">On Request</em>'}</div>
      </td>
      <td style="padding:10px 14px; min-width:0; white-space:nowrap;">${stockBadge(pr.stock_status)}</td>
      <td style="padding:10px 14px; min-width:0;">${pr.active ? '<span class="pill pill-active">Active</span>' : '<span class="pill pill-inactive">Hidden</span>'}</td>
      <td style="padding:10px 14px; min-width:0; white-space:nowrap; font-size:12.5px; color:#5C4C3E;">${formatDate(pr.updated_at)}</td>
      <td style="padding:10px 14px; min-width:0; white-space:nowrap;">
        <div class="row-actions">
          <button class="btn btn-link" data-action="p-edit" data-id="${pr.id}">Edit</button>
          <button class="btn btn-link" data-action="p-toggle" data-id="${pr.id}">${pr.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn-link" data-action="p-dup" data-id="${pr.id}">Duplicate</button>
          <button class="btn btn-link btn-danger" data-action="p-del" data-id="${pr.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
  tbody.querySelectorAll('button[data-action^="p-"]').forEach((b) => {
    b.addEventListener('click', () => productAction(b.getAttribute('data-action'), b.getAttribute('data-id')));
  });
  renderPagination(pagEl, p.page, p.pages, (np) => { state.ui.products.page = np; renderProducts(); });
}

function wireProductsToolbar() {
  const searchEl = document.querySelector('[data-products-search]');
  if (searchEl && !searchEl._bound) {
    searchEl._bound = true;
    searchEl.addEventListener('input', () => {
      state.ui.products.search = searchEl.value;
      state.ui.products.page = 1;
      renderProducts();
    });
  }
  const map = [
    ['category','data-products-filter-category'],
    ['stock','data-products-filter-stock'],
    ['active','data-products-filter-active'],
    ['sort','data-products-sort']
  ];
  map.forEach(([k, sel]) => {
    const el = document.querySelector(`[${sel}]`);
    if (!el) return;
    if (el.tagName === 'SELECT' && k === 'category' && !el._bound) {
      el._bound = true;
      el.innerHTML = `<option value="">All Categories</option>` + state.productCategories.map((c)=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (!el._bound2) {
      el._bound2 = true;
      el.addEventListener('change', () => {
        state.ui.products[k] = el.value;
        state.ui.products.page = 1;
        renderProducts();
      });
    }
    el.value = state.ui.products[k] || '';
  });
  const addBtn = document.querySelector('[data-products-add]');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', () => openProductModal(null));
  }
}

async function productAction(action, id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  if (action === 'p-edit')   { openProductModal(p); return; }
  if (action === 'p-toggle') {
    const patch = { active: !p.active };
    const r = await supabase.from('products').update(patch).eq('id', p.id).select().single();
    if (r.error) { showToast('Unable to update product status.', 'error'); console.error(r.error); return; }
    showToast(patch.active ? 'Product is now visible.' : 'Product is now hidden.', 'success');
    await refreshProducts(); await refreshStats(); renderProducts(); renderDashboard(); return;
  }
  if (action === 'p-dup') {
    const ok = await confirmDialog('Duplicate this product?', 'Duplicate Product');
    if (!ok) return;
    const { id:_, created_at:__c, updated_at:__u, ...rest } = p;
    const copy = { ...rest, name: p.name + ' (Copy)', featured: false };
    const r = await supabase.from('products').insert(copy).select().single();
    if (r.error) { showToast('Unable to duplicate product.', 'error'); console.error(r.error); return; }
    showToast('Product duplicated.', 'success');
    await refreshProducts(); await refreshStats(); renderProducts(); renderDashboard(); return;
  }
  if (action === 'p-del') {
    const ok = await confirmDialog('Delete this product? This cannot be undone.', 'Delete Product');
    if (!ok) return;
    const r = await supabase.from('products').delete().eq('id', p.id);
    if (r.error) { showToast('Unable to delete product.', 'error'); console.error(r.error); return; }
    showToast('Product deleted successfully.', 'success');
    await refreshProducts(); await refreshStats(); renderProducts(); renderDashboard(); return;
  }
}

/* ========== Product modal (create / edit) ========== */
function openProductModal(p) {
  state.ui.editingProductId = p ? p.id : null;
  state.productForm = p ? JSON.parse(JSON.stringify({
    name: p.name, description: p.description || '', category: p.category || '', subcategory: p.subcategory || '',
    price: p.price != null ? p.price : '', price_type: p.price_type || 'request',
    stock_status: p.stock_status || 'available_on_request',
    active: p.active !== false, whatsapp_enabled: p.whatsapp_enabled !== false,
    main_image: p.main_image || '', gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images.slice() : []
  })) : {
    name: '', description: '', category: '', subcategory: '',
    price: '', price_type: 'request', stock_status: 'available_on_request',
    active: true, whatsapp_enabled: true,
    main_image: '', gallery_images: []
  };
  renderProductModal();
  openModal('product');
}

function renderProductModal() {
  const f = state.productForm;
  const host = document.querySelector('[data-product-modal-host]'); if(!host) return;
  const catOpts = state.productCategories.map((c) => `<option value="${escapeHtml(c.name)}"${c.name === f.category ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const typeOpts = PRICE_TYPES.map((v)=>`<option value="${v}"${v===f.price_type?' selected':''}>${capitalize(v)}</option>`).join('');
  const stockOpts = STOCK_STATUS.map((v)=>`<option value="${v}"${v===f.stock_status?' selected':''}>${humanizeStock(v)}</option>`).join('');
  const galleryGrid = f.gallery_images.length === 0
    ? '<div class="image-empty">No gallery images yet.</div>'
    : f.gallery_images.map((g, i) => imageTile(resolveImageUrlFromRow({main_image: g}, ''), i, 'pgallery')).join('');
  host.innerHTML = `
    <div class="modal-grid">
      <div class="modal-field"><label>Product Name *</label><input id="pf-name" type="text" value="${escapeAttr(f.name)}" placeholder="e.g. Kanchi Silk Edit"></div>
      <div class="modal-row">
        <div class="modal-field"><label>Category</label>
          <select id="pf-category">
            <option value="">Select…</option>${catOpts}
          </select>
        </div>
        <div class="modal-field"><label>Subcategory</label><input id="pf-subcategory" type="text" value="${escapeAttr(f.subcategory)}"></div>
      </div>
      <div class="modal-field"><label>Description</label><textarea id="pf-description" rows="3" placeholder="Short product description">${escapeHtml(f.description||'')}</textarea></div>
      <div class="modal-row">
        <div class="modal-field"><label>Price</label><input id="pf-price" type="number" min="0" step="0.01" value="${f.price===''?'':f.price}" placeholder="Leave blank if on request"></div>
        <div class="modal-field"><label>Price Type</label><select id="pf-price-type">${typeOpts}</select></div>
        <div class="modal-field"><label>Stock Status</label><select id="pf-stock-status">${stockOpts}</select></div>
      </div>
      <div class="modal-row">
        <div class="modal-field checkbox-row"><input id="pf-active" type="checkbox"${f.active?' checked':''}><label for="pf-active">Active / visible</label></div>
        <div class="modal-field checkbox-row"><input id="pf-whatsapp-enabled" type="checkbox"${f.whatsapp_enabled?' checked':''}><label for="pf-whatsapp-enabled">WhatsApp Enquiry</label></div>
      </div>
      <div class="modal-field">
        <label>Main Image</label>
        <div class="image-upload-row">
          <div class="image-slot image-slot-main">
            ${ f.main_image
              ? `<img src="${resolveImageUrlFromRow({main_image: f.main_image}, '')}" alt="main image preview">
                 <div class="image-actions">
                   <button type="button" class="btn btn-link" data-img="pmain-replace">Replace</button>
                   <button type="button" class="btn btn-link btn-danger" data-img="pmain-remove">Remove</button>
                 </div>`
              : `<label class="image-upload-btn">
                   <span class="upload-plus">＋</span><span>Upload Main Image</span>
                   <input type="file" data-img="pmain-upload" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden>
                 </label>`
            }
          </div>
        </div>
      </div>
      <div class="modal-field">
        <label>Gallery Images (additional)</label>
        <div class="image-grid">
          ${galleryGrid}
          <label class="image-slot image-slot-add">
            <span class="upload-plus">＋</span><span>Add Gallery Image</span>
            <input type="file" data-img="pgallery-add" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden multiple>
          </label>
        </div>
      </div>
    </div>
  `;
  // wire fields
  host.querySelectorAll('input, select, textarea').forEach((el) => {
    const mapField = () => {
      if (!el.id || el.id.indexOf('pf-') !== 0) return;
      const key = el.id.replace(/^pf-/, '').replace(/-/g, '_');
      if (!key) return;
      if (el.type === 'checkbox') f[key] = el.checked;
      else if (el.type === 'number') f[key] = el.value === '' ? '' : Number(el.value);
      else f[key] = el.value;
    };
    el.addEventListener('change', mapField);
    el.addEventListener('input', mapField);
  });
  // image actions
  host.querySelectorAll('[data-img]').forEach((btn) => {
    const act = btn.getAttribute('data-img');
    const evt = btn.tagName.toLowerCase() === 'input' ? 'change' : 'click';
    btn.addEventListener(evt, async (ev) => {
      if (act === 'pmain-replace' || act === 'pmain-upload') {
        if (act === 'pmain-replace') {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
          inp.onchange = () => handleProductImage(inp.files && inp.files[0], 'main', -1);
          inp.click();
        } else {
          handleProductImage(btn.files && btn.files[0], 'main', -1);
        }
      } else if (act === 'pmain-remove') {
        f.main_image = '';
        renderProductModal();
      } else if (act === 'pgallery-add') {
        const files = btn.files ? Array.from(btn.files) : [];
        for (const file of files) await handleProductImage(file, 'gallery', -1);
        renderProductModal();
      } else if (/^pgallery-del-(\d+)$/.test(act)) {
        const i = Number(RegExp.$1);
        f.gallery_images.splice(i, 1);
        renderProductModal();
      } else if (/^pgallery-replace-(\d+)$/.test(act)) {
        const i = Number(RegExp.$1);
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
        inp.onchange = () => handleProductImage(inp.files && inp.files[0], 'gallery', i);
        inp.click();
      }
    });
  });
  // for dynamically generated image-tile buttons
  host.querySelectorAll('[data-imgaction]').forEach((b) => {
    const [kind, idxStr] = (b.getAttribute('data-imgaction') || '').split(':');
    const i = Number(idxStr);
    b.addEventListener('click', async () => {
      if (kind === 'pgallerydel') {
        f.gallery_images.splice(i, 1);
        renderProductModal();
      } else if (kind === 'pgalleryreplace') {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
        inp.onchange = () => handleProductImage(inp.files && inp.files[0], 'gallery', i);
        inp.click();
      }
    });
  });
}

async function handleProductImage(file, slot, index) {
  const v = validateImageFile(file);
  if (!v.ok) { showToast(v.reason, 'error'); return; }
  // determine product id (existing or temp placeholder first)
  let productId = state.ui.editingProductId;
  if (!productId) {
    // Save a stub product first to get an id for the storage path
    const stub = {
      name: state.productForm.name || 'Untitled Product',
      active: false, price_type: 'request'
    };
    const r = await supabase.from('products').insert(stub).select().single();
    if (r.error) { showToast('Unable to create product stub for image upload.', 'error'); console.error(r.error); return; }
    productId = r.data.id;
    state.ui.editingProductId = productId;
  }
  const path = slot === 'main'
    ? `products/${productId}/main/${timestampFilename(file.name)}`
    : `products/${productId}/gallery/${timestampFilename(file.name)}`;
  const up = await supabase.storage.from(PRODUCTS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
  if (up.error) {
    const reason = up.error && up.error.message ? up.error.message : '';
    const hint = /row-level security|AccessDenied|Unauthorized/i.test(reason)
      ? 'Storage permission denied — run supabase/fix-storage-policies.sql in the Supabase SQL Editor.'
      : reason;
    showToast('Unable to upload image. ' + hint, 'error');
    console.error(up.error);
    return;
  }
  const storageRef = PRODUCTS_BUCKET + '/' + path;
  if (slot === 'main') state.productForm.main_image = storageRef;
  else if (index >= 0) state.productForm.gallery_images[index] = storageRef;
  else state.productForm.gallery_images.push(storageRef);
  showToast('Image uploaded successfully.', 'success');
  renderProductModal();
}

async function saveProductFromModal() {
  const f = state.productForm;
  const name = (f.name || '').trim();
  if (!name) { showToast('Product Name is required.', 'error'); return; }
  if (f.price_type === 'fixed' && (f.price === '' || f.price == null || Number(f.price) < 0)) {
    showToast('Fixed-price products must have a valid price.', 'error'); return;
  }
  const payload = {
    name,
    description: (f.description || '').trim() || null,
    category: (f.category || '').trim() || null,
    subcategory: (f.subcategory || '').trim() || null,
    price: f.price_type === 'fixed' ? (Number(f.price) || null) : null,
    price_type: f.price_type || 'request',
    stock_status: f.stock_status || 'available_on_request',
    active: !!f.active,
    whatsapp_enabled: !!f.whatsapp_enabled,
    main_image: f.main_image || null,
    gallery_images: Array.isArray(f.gallery_images) ? f.gallery_images : []
  };
  let r;
  if (state.ui.editingProductId) {
    r = await supabase.from('products').update(payload).eq('id', state.ui.editingProductId).select().single();
  } else {
    r = await supabase.from('products').insert(payload).select().single();
  }
  if (r.error) {
    showToast(state.ui.editingProductId ? 'Unable to update product.' : 'Unable to save product.', 'error');
    console.error(r.error);
    return;
  }
  showToast(state.ui.editingProductId ? 'Product updated successfully.' : 'Product saved successfully.', 'success');
  closeModal('product');
  state.ui.editingProductId = null; state.productForm = null;
  await refreshProducts(); await refreshStats(); renderProducts(); renderDashboard();
}

async function deleteProductFromModal() {
  const id = state.ui.editingProductId;
  if (!id) { closeModal('product'); return; }
  const ok = await confirmDialog('Delete this product? This cannot be undone.', 'Delete Product');
  if (!ok) return;
  const r = await supabase.from('products').delete().eq('id', id);
  if (r.error) { showToast('Unable to delete product.', 'error'); console.error(r.error); return; }
  showToast('Product deleted successfully.', 'success');
  closeModal('product');
  state.ui.editingProductId = null; state.productForm = null;
  await refreshProducts(); await refreshStats(); renderProducts(); renderDashboard();
}

/* ========== Designs table + modal ========== */
function designImage(d) { return resolveImageUrlFromRow(d, ''); }

function renderDesigns() {
  const items = filterDesigns();
  const p = paginate(items, state.ui.designs.page, PAGE_SIZE);
  state.ui.designs.page = p.page;
  wireDesignsToolbar();
  const tbody = document.querySelector('[data-designs-body]');
  const empty = document.querySelector('[data-designs-empty]');
  const countEl = document.querySelector('[data-designs-count]');
  const pagEl = document.querySelector('[data-designs-pagination]');
  if (countEl) countEl.textContent = `${p.total} design${p.total === 1 ? '' : 's'} · Page ${p.page} of ${p.pages}`;
  if (!tbody) return;
  tbody.innerHTML = '';
  if (p.total === 0) {
    if (empty) empty.hidden = false;
    if (pagEl) pagEl.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  const rows = p.items.map((d)=>`
    <tr data-id="${d.id}">
      <td style="padding:10px 14px; width:80px;">
        <div style="width:56px; height:56px; border-radius:3px; background:linear-gradient(155deg,#EAD7AE,#5E4326); overflow:hidden;">
          ${designImage(d) ? `<img src="${designImage(d)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<span style="color:#FAF6EE; font-style:italic; font-family:'Cormorant Garamond',serif; display:flex; width:100%; height:100%; align-items:center; justify-content:center;">PP</span>`}
        </div>
      </td>
      <td style="padding:10px 14px; min-width:0;">
        <div style="font-weight:600; color:#2A2019; word-break:break-word;">${escapeHtml(d.title)}</div>
        <div style="font-size:12px; color:#5C4C3E; margin-top:2px; word-break:break-word;">${escapeHtml((d.description||'').slice(0,100) || '—')}</div>
      </td>
      <td style="padding:10px 14px; min-width:0;"><span class="chip">${escapeHtml(d.category || '—')}</span></td>
      <td style="padding:10px 14px; min-width:0;"><span class="chip chip-alt">${escapeHtml(d.occasion || '—')}</span></td>
      <td style="padding:10px 14px;">${d.featured ? '<span class="pill pill-featured">Featured</span>' : '<span class="pill pill-muted">—</span>'}</td>
      <td style="padding:10px 14px;">${d.active ? '<span class="pill pill-active">Active</span>' : '<span class="pill pill-inactive">Hidden</span>'}</td>
      <td style="padding:10px 14px; white-space:nowrap; font-size:12.5px; color:#5C4C3E;">${formatDate(d.updated_at)}</td>
      <td style="padding:10px 14px; white-space:nowrap;">
        <div class="row-actions">
          <button class="btn btn-link" data-action="d-edit" data-id="${d.id}">Edit</button>
          <button class="btn btn-link" data-action="d-toggle" data-id="${d.id}">${d.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn-link" data-action="d-dup" data-id="${d.id}">Duplicate</button>
          <button class="btn btn-link btn-danger" data-action="d-del" data-id="${d.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
  tbody.innerHTML = rows;
  tbody.querySelectorAll('button[data-action^="d-"]').forEach((b) => {
    b.addEventListener('click', () => designAction(b.getAttribute('data-action'), b.getAttribute('data-id')));
  });
  renderPagination(pagEl, p.page, p.pages, (np) => { state.ui.designs.page = np; renderDesigns(); });
}

function wireDesignsToolbar() {
  const s = document.querySelector('[data-designs-search]');
  if (s && !s._bound) { s._bound = true; s.addEventListener('input', () => { state.ui.designs.search = s.value; state.ui.designs.page = 1; renderDesigns(); }); }
  const catEl = document.querySelector('[data-designs-filter-category]');
  if (catEl && !catEl._bound) {
    catEl._bound = true;
    catEl.innerHTML = `<option value="">All Categories</option>` + state.designCategories.map((c)=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  }
  const occEl = document.querySelector('[data-designs-filter-occasion]');
  if (occEl && !occEl._bound) {
    occEl._bound = true;
    occEl.innerHTML = `<option value="">All Occasions</option>` + DESIGN_OCCASIONS.map((o)=>`<option value="${o}">${o}</option>`).join('');
  }
  const selMap = [
    ['category', 'data-designs-filter-category'],
    ['occasion', 'data-designs-filter-occasion'],
    ['active',   'data-designs-filter-active'],
    ['featured', 'data-designs-filter-featured'],
    ['sort',     'data-designs-sort']
  ];
  selMap.forEach(([k, attr]) => {
    const el = document.querySelector(`[${attr}]`);
    if (!el) return;
    if (!el._bound2) {
      el._bound2 = true;
      el.addEventListener('change', () => { state.ui.designs[k] = el.value; state.ui.designs.page = 1; renderDesigns(); });
    }
    el.value = state.ui.designs[k] || '';
  });
  const addBtn = document.querySelector('[data-designs-add]');
  if (addBtn && !addBtn._bound) { addBtn._bound = true; addBtn.addEventListener('click', () => openDesignModal(null)); }
  const bulkBtn = document.querySelector('[data-designs-bulk]');
  if (bulkBtn && !bulkBtn._bound) { bulkBtn._bound = true; bulkBtn.addEventListener('click', () => openBulkDesignsModal()); }
}

async function designAction(action, id) {
  const d = state.designs.find((x) => x.id === id);
  if (!d) return;
  if (action === 'd-edit')   { openDesignModal(d); return; }
  if (action === 'd-toggle') {
    const patch = { active: !d.active };
    const r = await supabase.from('designs').update(patch).eq('id', d.id).select().single();
    if (r.error) { showToast('Unable to update design status.', 'error'); console.error(r.error); return; }
    showToast(patch.active ? 'Design is now visible.' : 'Design is now hidden.', 'success');
    await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard(); return;
  }
  if (action === 'd-dup') {
    const ok = await confirmDialog('Duplicate this design?', 'Duplicate Design');
    if (!ok) return;
    const { id:_, created_at:__c, updated_at:__u, ...rest } = d;
    const copy = { ...rest, title: d.title + ' (Copy)', featured: false };
    const r = await supabase.from('designs').insert(copy).select().single();
    if (r.error) { showToast('Unable to duplicate design.', 'error'); console.error(r.error); return; }
    showToast('Design duplicated.', 'success');
    await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard(); return;
  }
  if (action === 'd-del') {
    const ok = await confirmDialog('Delete this design? This cannot be undone.', 'Delete Design');
    if (!ok) return;
    const r = await supabase.from('designs').delete().eq('id', d.id);
    if (r.error) { showToast('Unable to delete design.', 'error'); console.error(r.error); return; }
    showToast('Design deleted successfully.', 'success');
    await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard(); return;
  }
}

function openDesignModal(d) {
  state.ui.editingDesignId = d ? d.id : null;
  state.designForm = d ? JSON.parse(JSON.stringify({
    title: d.title, description: d.description || '', category: d.category || '', occasion: d.occasion || 'Custom',
    featured: !!d.featured, active: d.active !== false,
    main_image: d.main_image || '', gallery_images: Array.isArray(d.gallery_images) ? d.gallery_images.slice() : []
  })) : {
    title: '', description: '', category: '', occasion: 'Custom',
    featured: false, active: true,
    main_image: '', gallery_images: []
  };
  renderDesignModal();
  openModal('design');
}

function renderDesignModal() {
  const f = state.designForm;
  const host = document.querySelector('[data-design-modal-host]'); if (!host) return;
  const catOpts = state.designCategories.map((c)=>`<option value="${escapeHtml(c.name)}"${c.name === f.category ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const occOpts = DESIGN_OCCASIONS.map((o)=>`<option value="${o}"${o === f.occasion ? ' selected' : ''}>${o}</option>`).join('');
  const galleryGrid = f.gallery_images.length === 0
    ? '<div class="image-empty">No gallery images yet.</div>'
    : f.gallery_images.map((g, i) => imageTile(resolveImageUrlFromRow({main_image: g}, ''), i, 'dgallery')).join('');
  host.innerHTML = `
    <div class="modal-grid">
      <div class="modal-field"><label>Design Title *</label><input id="df-title" type="text" value="${escapeAttr(f.title)}" placeholder="e.g. Bridal Silk Blouse"></div>
      <div class="modal-row">
        <div class="modal-field"><label>Category</label><select id="df-category"><option value="">Select…</option>${catOpts}</select></div>
        <div class="modal-field"><label>Occasion</label><select id="df-occasion">${occOpts}</select></div>
      </div>
      <div class="modal-field"><label>Description</label><textarea id="df-description" rows="3" placeholder="Short design description">${escapeHtml(f.description||'')}</textarea></div>
      <div class="modal-row">
        <div class="modal-field checkbox-row"><input id="df-featured" type="checkbox"${f.featured?' checked':''}><label for="df-featured">Featured (Crafted By Us)</label></div>
        <div class="modal-field checkbox-row"><input id="df-active" type="checkbox"${f.active?' checked':''}><label for="df-active">Active / visible</label></div>
      </div>
      <div class="modal-field">
        <label>Main Image</label>
        <div class="image-upload-row">
          <div class="image-slot image-slot-main">
            ${ f.main_image
              ? `<img src="${resolveImageUrlFromRow({main_image: f.main_image}, '')}" alt="main image preview">
                 <div class="image-actions">
                   <button type="button" class="btn btn-link" data-dimg="dmain-replace">Replace</button>
                   <button type="button" class="btn btn-link btn-danger" data-dimg="dmain-remove">Remove</button>
                 </div>`
              : `<label class="image-upload-btn">
                   <span class="upload-plus">＋</span><span>Upload Main Image</span>
                   <input type="file" data-dimg="dmain-upload" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden>
                 </label>`
            }
          </div>
        </div>
      </div>
      <div class="modal-field">
        <label>Gallery Images (additional)</label>
        <div class="image-grid">
          ${galleryGrid}
          <label class="image-slot image-slot-add">
            <span class="upload-plus">＋</span><span>Add Gallery Image</span>
            <input type="file" data-dimg="dgallery-add" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden multiple>
          </label>
        </div>
      </div>
    </div>
  `;
  host.querySelectorAll('input, select, textarea').forEach((el) => {
    const mapField = () => {
      if (!el.id || el.id.indexOf('df-') !== 0) return;
      const key = el.id.replace(/^df-/, '').replace(/-/g, '_');
      if (!key) return;
      if (el.type === 'checkbox') f[key] = el.checked;
      else f[key] = el.value;
    };
    el.addEventListener('change', mapField);
    el.addEventListener('input', mapField);
  });
  host.querySelectorAll('[data-dimg]').forEach((el) => {
    const act = el.getAttribute('data-dimg');
    const evt = el.tagName.toLowerCase() === 'input' ? 'change' : 'click';
    el.addEventListener(evt, async () => {
      if (act === 'dmain-replace') {
        const inp = mkFileInput(); inp.onchange = () => handleDesignImage(inp.files[0], 'main', -1); inp.click();
      } else if (act === 'dmain-upload') {
        handleDesignImage(el.files && el.files[0], 'main', -1);
      } else if (act === 'dmain-remove') {
        f.main_image = ''; renderDesignModal();
      } else if (act === 'dgallery-add') {
        const files = el.files ? Array.from(el.files) : [];
        for (const file of files) await handleDesignImage(file, 'gallery', -1);
        renderDesignModal();
      }
    });
  });
  host.querySelectorAll('[data-dimgaction]').forEach((b) => {
    const [kind, idxStr] = (b.getAttribute('data-dimgaction') || '').split(':');
    const i = Number(idxStr);
    b.addEventListener('click', async () => {
      if (kind === 'dgallerydel') { f.gallery_images.splice(i,1); renderDesignModal(); }
      else if (kind === 'dgalleryreplace') {
        const inp = mkFileInput(); inp.onchange = () => handleDesignImage(inp.files[0], 'gallery', i); inp.click();
      }
    });
  });
}

async function handleDesignImage(file, slot, index) {
  const v = validateImageFile(file);
  if (!v.ok) { showToast(v.reason, 'error'); return; }
  let designId = state.ui.editingDesignId;
  if (!designId) {
    const stub = { title: state.designForm.title || 'Untitled Design', active: false, occasion: state.designForm.occasion || 'Custom' };
    const r = await supabase.from('designs').insert(stub).select().single();
    if (r.error) { showToast('Unable to create design stub for image upload.', 'error'); console.error(r.error); return; }
    designId = r.data.id;
    state.ui.editingDesignId = designId;
  }
  const path = slot === 'main'
    ? `designs/${designId}/main/${timestampFilename(file.name)}`
    : `designs/${designId}/gallery/${timestampFilename(file.name)}`;
  const up = await supabase.storage.from(DESIGNS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
  if (up.error) {
    const reason = up.error && up.error.message ? up.error.message : '';
    const hint = /row-level security|AccessDenied|Unauthorized/i.test(reason)
      ? 'Storage permission denied — run supabase/fix-storage-policies.sql in the Supabase SQL Editor.'
      : reason;
    showToast('Unable to upload image. ' + hint, 'error');
    console.error(up.error);
    return;
  }
  const storageRef = DESIGNS_BUCKET + '/' + path;
  if (slot === 'main') state.designForm.main_image = storageRef;
  else if (index >= 0) state.designForm.gallery_images[index] = storageRef;
  else state.designForm.gallery_images.push(storageRef);
  showToast('Image uploaded successfully.', 'success');
  renderDesignModal();
}

async function saveDesignFromModal() {
  const f = state.designForm;
  const title = (f.title || '').trim();
  if (!title) { showToast('Design Title is required.', 'error'); return; }
  const payload = {
    title,
    description: (f.description || '').trim() || null,
    category: (f.category || '').trim() || null,
    occasion: f.occasion || 'Custom',
    featured: !!f.featured,
    active: !!f.active,
    main_image: f.main_image || null,
    gallery_images: Array.isArray(f.gallery_images) ? f.gallery_images : []
  };
  let r;
  if (state.ui.editingDesignId) {
    r = await supabase.from('designs').update(payload).eq('id', state.ui.editingDesignId).select().single();
  } else {
    r = await supabase.from('designs').insert(payload).select().single();
  }
  if (r.error) {
    showToast(state.ui.editingDesignId ? 'Unable to update design.' : 'Unable to save design.', 'error');
    console.error(r.error); return;
  }
  showToast(state.ui.editingDesignId ? 'Design updated successfully.' : 'Design saved successfully.', 'success');
  closeModal('design');
  state.ui.editingDesignId = null; state.designForm = null;
  await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard();
}

async function deleteDesignFromModal() {
  const id = state.ui.editingDesignId;
  if (!id) { closeModal('design'); return; }
  const ok = await confirmDialog('Delete this design? This cannot be undone.', 'Delete Design');
  if (!ok) return;
  const r = await supabase.from('designs').delete().eq('id', id);
  if (r.error) { showToast('Unable to delete design.', 'error'); console.error(r.error); return; }
  showToast('Design deleted successfully.', 'success');
  closeModal('design');
  state.ui.editingDesignId = null; state.designForm = null;
  await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard();
}

/* ========== Bulk design import ========== */
let bulkRows = [];      // { file, url, title, titleEdited, category, occasion, csv, status, error }
let bulkCsvRows = [];   // { title, description, category, occasion, image, active }
let bulkRunning = false;

function deriveTitleFromFilename(name) {
  const base = String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return 'Untitled Design';
  return base.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvText(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const t = String(text || '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function openBulkDesignsModal() {
  wireBulkModal();
  const catSel = document.querySelector('[data-bulk-category]');
  if (catSel) {
    catSel.innerHTML = '<option value="">— none —</option>' +
      state.designCategories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  }
  renderBulkList();
  updateBulkUi();
  openModal('bulk-designs');
}

function wireBulkModal() {
  const filesInp = document.querySelector('[data-bulk-files]');
  if (filesInp && !filesInp._bound) {
    filesInp._bound = true;
    filesInp.addEventListener('change', () => { handleBulkFiles(filesInp.files); filesInp.value = ''; });
  }
  const csvInp = document.querySelector('[data-bulk-csv]');
  if (csvInp && !csvInp._bound) {
    csvInp._bound = true;
    csvInp.addEventListener('change', () => { handleBulkCsv(csvInp.files && csvInp.files[0]); csvInp.value = ''; });
  }
  const clearBtn = document.querySelector('[data-bulk-clear]');
  if (clearBtn && !clearBtn._bound) {
    clearBtn._bound = true;
    clearBtn.addEventListener('click', () => {
      if (bulkRunning) return;
      bulkRows.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url); });
      bulkRows = [];
      renderBulkList(); updateBulkUi();
    });
  }
  const cancelBtn = document.querySelector('[data-bulk-cancel]');
  if (cancelBtn && !cancelBtn._bound) {
    cancelBtn._bound = true;
    cancelBtn.addEventListener('click', () => {
      closeModal('bulk-designs');
      if (bulkRunning) showToast('Import keeps running in the background — keep this tab open.', 'warning');
    });
  }
  const startBtn = document.querySelector('[data-bulk-start]');
  if (startBtn && !startBtn._bound) {
    startBtn._bound = true;
    startBtn.addEventListener('click', () => startBulkImport());
  }
}

function handleBulkFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  let added = 0, skipped = 0;
  for (const file of files) {
    const name = (file.name || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();
    const typeOk = ALLOWED_IMAGE_EXT.some((e) => name.endsWith('.' + e)) || ALLOWED_IMAGE_MIME.includes(mime);
    if (!typeOk) { skipped++; console.warn('Skipped ' + file.name + ': unsupported type'); continue; }
    if (bulkRows.some((r) => r.file.name === file.name && r.file.size === file.size)) { skipped++; continue; }
    bulkRows.push({
      file, url: URL.createObjectURL(file),
      title: deriveTitleFromFilename(file.name), titleEdited: false,
      category: '', occasion: '', csv: null,
      status: 'pending', error: ''
    });
    added++;
  }
  applyBulkCsvMatches();
  renderBulkList();
  updateBulkUi();
  if (skipped > 0) showToast(skipped + ' file(s) skipped — unsupported type or duplicate.', 'warning');
  if (added > 0) showToast(added + ' image(s) added to the import list.', 'success');
}

async function handleBulkCsv(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const table = parseCsvText(text);
    if (table.length < 2) { showToast('CSV looks empty — it needs a header row plus at least one data row.', 'error'); return; }
    const headers = table[0].map((h) => String(h || '').trim().toLowerCase());
    const idx = (names) => { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; };
    const iT = idx(['title', 'name', 'design']);
    if (iT === -1) { showToast('CSV needs a "title" column.', 'error'); return; }
    const iD = idx(['description', 'desc', 'details']);
    const iC = idx(['category', 'type', 'design_type']);
    const iO = idx(['occasion']);
    const iU = idx(['image_url', 'image', 'photo', 'filename', 'file']);
    const iA = idx(['is_active', 'active']);
    bulkCsvRows = table.slice(1).map((cells) => ({
      title: (cells[iT] || '').trim(),
      description: iD !== -1 ? (cells[iD] || '').trim() : '',
      category: iC !== -1 ? (cells[iC] || '').trim() : '',
      occasion: iO !== -1 ? (cells[iO] || '').trim() : '',
      image: iU !== -1 ? (cells[iU] || '').trim() : '',
      active: iA === -1 ? true : String(cells[iA] || '').trim().toLowerCase() !== 'false'
    })).filter((r) => r.title || r.image);
    bulkRows.forEach((r) => { r.csv = null; });
    applyBulkCsvMatches();
    renderBulkList();
    updateBulkUi();
    showToast(bulkCsvRows.length + ' CSV row(s) loaded and matched by filename/title.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Unable to read the CSV file.', 'error');
  }
}

function applyBulkCsvMatches() {
  const used = new Set();
  bulkRows.forEach((row) => {
    if (row.csv) return;
    const fn = normalizeForMatch(row.file.name);
    const derived = normalizeForMatch(row.title);
    let matchIdx = bulkCsvRows.findIndex((c, i) => !used.has(i) && (
      (c.image && normalizeForMatch(c.image) === fn) ||
      (c.title && normalizeForMatch(c.title) === derived) ||
      (c.title && normalizeForMatch(c.title) === fn)
    ));
    if (matchIdx === -1) return;
    used.add(matchIdx);
    const m = bulkCsvRows[matchIdx];
    row.csv = m;
    if (m.title && !row.titleEdited) row.title = m.title;
    if (m.category) row.category = m.category;
    if (m.occasion && DESIGN_OCCASIONS.includes(m.occasion)) row.occasion = m.occasion;
  });
}

function renderBulkList() {
  const list = document.querySelector('[data-bulk-list]');
  if (!list) return;
  list.hidden = bulkRows.length === 0;
  list.innerHTML = bulkRows.map((r, i) => {
    const occOpts = [''].concat(DESIGN_OCCASIONS).map((o) =>
      `<option value="${escapeHtml(o)}"${r.occasion === o ? ' selected' : ''}>${o === '' ? '— global —' : o}</option>`
    ).join('');
    const statusCell = bulkStatusCellHtml(r, i);
    return `<div class="bulk-row" data-bulk-row="${i}">
      <img class="bulk-thumb" src="${r.url}" alt="">
      <input type="text" data-bulk-title="${i}" value="${escapeAttr(r.title)}" placeholder="Design title">
      <input type="text" class="bulk-row-cat" data-bulk-cat="${i}" value="${escapeAttr(r.category)}" placeholder="— global —">
      <select class="bulk-row-occ" data-bulk-occ="${i}">${occOpts}</select>
      <div style="text-align:center;">${statusCell}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-bulk-title]').forEach((el) => {
    el.addEventListener('input', () => {
      const r = bulkRows[Number(el.getAttribute('data-bulk-title'))];
      r.title = el.value; r.titleEdited = true;
    });
  });
  list.querySelectorAll('[data-bulk-cat]').forEach((el) => {
    el.addEventListener('input', () => { bulkRows[Number(el.getAttribute('data-bulk-cat'))].category = el.value; });
  });
  list.querySelectorAll('[data-bulk-occ]').forEach((el) => {
    el.addEventListener('change', () => { bulkRows[Number(el.getAttribute('data-bulk-occ'))].occasion = el.value; });
  });
  list.querySelectorAll('[data-bulk-rm]').forEach((b) => {
    b.addEventListener('click', () => {
      if (bulkRunning) return;
      const i = Number(b.getAttribute('data-bulk-rm'));
      if (bulkRows[i] && bulkRows[i].url) URL.revokeObjectURL(bulkRows[i].url);
      bulkRows.splice(i, 1);
      renderBulkList();
      updateBulkUi();
    });
  });
}

function bulkStatusCellHtml(r, i) {
  if (r.status === 'done') return '<span style="color:#2D7A47; font-weight:700;" title="Imported">✓</span>';
  if (r.status === 'error') return `<span style="color:#A5432B; font-weight:700; cursor:help;" title="${escapeAttr(r.error)}">✗</span>`;
  return `<button type="button" class="btn btn-link btn-danger" data-bulk-rm="${i}" title="Remove">✕</button>`;
}

function updateBulkRowStatus(i) {
  const rowEl = document.querySelector(`[data-bulk-row="${i}"]`);
  if (!rowEl || !rowEl.lastElementChild) return;
  rowEl.lastElementChild.innerHTML = bulkStatusCellHtml(bulkRows[i], i);
}

function updateBulkUi() {
  const host = document.querySelector('[data-bulk-host]');
  const hint = document.querySelector('[data-bulk-hint]');
  const clearBtn = document.querySelector('[data-bulk-clear]');
  const startBtn = document.querySelector('[data-bulk-start]');
  const done = bulkRows.filter((r) => r.status === 'done').length;
  const failed = bulkRows.filter((r) => r.status === 'error').length;
  const pending = bulkRows.length - done;
  if (hint) hint.textContent = bulkRows.length === 0
    ? 'No images selected yet.'
    : `${bulkRows.length} image(s) · ${done} imported · ${failed} failed`;
  if (clearBtn) clearBtn.hidden = bulkRows.length === 0 || bulkRunning;
  if (startBtn) {
    startBtn.disabled = bulkRunning || pending === 0;
    startBtn.textContent = bulkRunning ? 'Importing…'
      : (failed > 0 && pending === failed) ? `Retry Failed (${failed})`
      : 'Import Designs';
  }
  if (host) host.classList.toggle('is-locked', bulkRunning);
}

async function optimizeImageFile(file) {
  if (!file || !/^image\//.test(file.type || '')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const MAX_DIM = 1600;
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size <= MAX_IMAGE_BYTES) {
      if (bmp.close) bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    const isPng = (file.type || '') === 'image/png';
    const blob = await new Promise((res) => canvas.toBlob(res, isPng ? 'image/png' : 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const newName = String(file.name || 'image').replace(/\.[^.]+$/, '') + (isPng ? '.png' : '.jpg');
    return new File([blob], newName, { type: isPng ? 'image/png' : 'image/jpeg' });
  } catch (_) {
    return file;
  }
}

async function startBulkImport() {
  if (bulkRunning) return;
  const todo = bulkRows.filter((r) => r.status !== 'done');
  if (todo.length === 0) return;
  const g = (sel) => document.querySelector(sel);
  const globalCat = (g('[data-bulk-category]') || {}).value || '';
  const globalOcc = ((g('[data-bulk-occasion]') || {}).value || 'Custom').trim();
  const optimize = !!(g('[data-bulk-optimize]') || {}).checked;
  const featured = !!(g('[data-bulk-featured]') || {}).checked;
  const activeGlobal = !!(g('[data-bulk-active]') || {}).checked;
  bulkRunning = true;
  updateBulkUi();
  const progWrap = g('[data-bulk-progress]');
  const bar = g('[data-bulk-bar]');
  const progText = g('[data-bulk-progress-text]');
  if (progWrap) progWrap.hidden = false;
  let done = 0, ok = 0, fail = 0;
  for (let i = 0; i < bulkRows.length; i++) {
    const row = bulkRows[i];
    if (row.status === 'done') continue;
    done++;
    if (bar) bar.style.width = Math.round((done / todo.length) * 100) + '%';
    if (progText) progText.textContent = `Importing ${done} of ${todo.length} — ${row.file.name}`;
    try {
      let file = row.file;
      if (optimize) file = await optimizeImageFile(file);
      const v = validateImageFile(file);
      if (!v.ok) throw new Error(v.reason);
      const title = (row.title || '').trim() || deriveTitleFromFilename(row.file.name);
      const occasionRaw = (row.occasion || globalOcc || 'Custom').trim();
      const occasion = DESIGN_OCCASIONS.includes(occasionRaw) ? occasionRaw : 'Custom';
      const category = (row.category || globalCat || (row.csv && row.csv.category) || '').trim() || null;
      const description = ((row.csv && row.csv.description) || '').trim() || null;
      const isActive = row.csv && typeof row.csv.active === 'boolean' ? row.csv.active : activeGlobal;
      const path = `designs/bulk-import/${timestampFilename(file.name)}`;
      const up = await supabase.storage.from(DESIGNS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
      if (up.error) throw up.error;
      const r = await supabase.from('designs').insert({
        title, description, category, occasion,
        featured, active: isActive,
        main_image: DESIGNS_BUCKET + '/' + path,
        gallery_images: []
      }).select().single();
      if (r.error) throw r.error;
      row.status = 'done'; row.error = '';
      ok++;
    } catch (err) {
      row.status = 'error';
      const reason = (err && err.message) ? err.message : 'Unknown error';
      row.error = /row-level security|AccessDenied|Unauthorized/i.test(reason)
        ? 'Storage permission denied — run supabase/fix-storage-policies.sql in the SQL Editor.'
        : reason;
      fail++;
      console.error('Bulk import failed for ' + row.file.name, err);
    }
    updateBulkRowStatus(i);
    updateBulkUi();
  }
  bulkRunning = false;
  if (progText) progText.textContent = `Finished — ${ok} imported, ${fail} failed.`;
  if (bar) bar.style.width = '100%';
  renderBulkList();
  updateBulkUi();
  if (ok > 0) {
    await refreshDesigns(); await refreshStats(); renderDesigns(); renderDashboard();
  }
  showToast(`Bulk import finished — ${ok} imported${fail ? ', ' + fail + ' failed (hover ✗ for details)' : ''}.`, fail ? 'warning' : 'success');
}

/* ========== Categories page ========== */
function renderCategories() {
  // tab switching
  const tabBar = document.querySelector('[data-cat-tabs]');
  if (tabBar && !tabBar._bound) {
    tabBar._bound = true;
    tabBar.querySelectorAll('[data-cat-tab]').forEach((t) => {
      t.addEventListener('click', () => {
        state.ui.catActiveTab = t.getAttribute('data-cat-tab') === 'design' ? 'design' : 'product';
        renderCategories();
      });
    });
  }
  document.querySelectorAll('[data-cat-tab]').forEach((t) => {
    t.classList.toggle('is-active', t.getAttribute('data-cat-tab') === state.ui.catActiveTab);
  });
  document.querySelectorAll('[data-cat-section]').forEach((s) => {
    s.hidden = s.getAttribute('data-cat-section') !== state.ui.catActiveTab;
  });
  const isDesign = state.ui.catActiveTab === 'design';
  const list = isDesign ? state.designCategories : state.productCategories;
  const table = isDesign
    ? document.querySelector('[data-design-cat-body]')
    : document.querySelector('[data-product-cat-body]');
  const refTable = isDesign ? state.designs : state.products;
  const refField = 'category';
  if (table) {
    table.innerHTML = list.map((c) => {
      const inUse = refTable.filter((r) => r[refField] === c.name).length;
      return `<tr data-id="${c.id}">
        <td style="padding:10px 14px; min-width:0; word-break:break-word;"><strong>${escapeHtml(c.name)}</strong>
          <div style="font-size:12px; color:#5C4C3E; margin-top:2px;">Slug: ${escapeHtml(c.slug)}${inUse>0?` · <span style="color:#B58A4A;">Used by ${inUse} ${isDesign?'design(s)':'product(s)'}</span>`:''}</div>
        </td>
        <td style="padding:10px 14px;">${c.active ? '<span class="pill pill-active">Active</span>' : '<span class="pill pill-inactive">Hidden</span>'}</td>
        <td style="padding:10px 14px; white-space:nowrap; font-size:12.5px; color:#5C4C3E;">${formatDate(c.updated_at)}</td>
        <td style="padding:10px 14px; white-space:nowrap;">
          <div class="row-actions">
            <button class="btn btn-link" data-action="c-edit" data-id="${c.id}">Edit</button>
            <button class="btn btn-link" data-action="c-toggle" data-id="${c.id}">${c.active ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-link btn-danger" data-action="c-del" data-id="${c.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    table.querySelectorAll('button[data-action^="c-"]').forEach((b) => {
      b.addEventListener('click', () => categoryAction(b.getAttribute('data-action'), b.getAttribute('data-id')));
    });
  }
  // add category buttons bind
  const addSel = isDesign ? '[data-design-cat-add]' : '[data-product-cat-add]';
  const addBtn = document.querySelector(addSel);
  if (addBtn && !addBtn._bound) { addBtn._bound = true; addBtn.addEventListener('click', () => openCategoryModal(state.ui.catActiveTab, null)); }
}

async function categoryAction(action, id) {
  const isDesign = state.ui.catActiveTab === 'design';
  const tbl = isDesign ? 'design_categories' : 'product_categories';
  const list = isDesign ? state.designCategories : state.productCategories;
  const cat = list.find((c) => c.id === id);
  if (!cat) return;
  if (action === 'c-edit') { openCategoryModal(state.ui.catActiveTab, cat); return; }
  if (action === 'c-toggle') {
    const r = await supabase.from(tbl).update({ active: !cat.active }).eq('id', id).select().single();
    if (r.error) { showToast('Unable to update category.', 'error'); console.error(r.error); return; }
    showToast(!cat.active ? 'Category enabled.' : 'Category disabled.', 'success');
    await refreshCategories(); renderCategories(); return;
  }
  if (action === 'c-del') {
    const refTable = isDesign ? state.designs : state.products;
    const inUse = refTable.filter((r) => r.category === cat.name).length;
    if (inUse > 0) {
      showToast(`Cannot delete: category is used by ${inUse} ${isDesign?'design(s)':'product(s)'}.`, 'error');
      return;
    }
    const ok = await confirmDialog(`Delete category "${cat.name}"? This cannot be undone.`, 'Delete Category');
    if (!ok) return;
    const r = await supabase.from(tbl).delete().eq('id', id);
    if (r.error) { showToast('Unable to delete category.', 'error'); console.error(r.error); return; }
    showToast('Category deleted.', 'success');
    await refreshCategories(); renderCategories(); return;
  }
}

function openCategoryModal(tab, cat) {
  state.ui.editingCatTab = tab;
  state.ui.editingCatId = cat ? cat.id : null;
  state.catForm = cat ? JSON.parse(JSON.stringify({ name: cat.name, slug: cat.slug, active: !!cat.active }))
                      : { name: '', slug: '', active: true };
  renderCategoryModal();
  openModal('category');
}

function renderCategoryModal() {
  const host = document.querySelector('[data-category-modal-host]'); if (!host) return;
  const f = state.catForm;
  const label = state.ui.editingCatTab === 'design' ? 'Design' : 'Product';
  host.innerHTML = `
    <div class="modal-grid">
      <div class="modal-field"><label>${label} Category Name *</label><input id="cf-name" type="text" value="${escapeAttr(f.name)}" placeholder="e.g. Bridal"></div>
      <div class="modal-field"><label>Slug</label><input id="cf-slug" type="text" value="${escapeAttr(f.slug)}" placeholder="auto-generated if blank"></div>
      <div class="modal-field checkbox-row"><input id="cf-active" type="checkbox"${f.active?' checked':''}><label for="cf-active">Active / visible in public UI</label></div>
    </div>
  `;
  const nameEl = document.getElementById('cf-name');
  const slugEl = document.getElementById('cf-slug');
  const activeEl = document.getElementById('cf-active');
  let lastAuto = '';
  nameEl.addEventListener('input', () => {
    f.name = nameEl.value;
    if (!slugEl.value || slugEl.value === lastAuto) {
      f.slug = slugify(f.name); lastAuto = f.slug; slugEl.value = f.slug;
    }
  });
  slugEl.addEventListener('input', () => { f.slug = slugEl.value; });
  activeEl.addEventListener('change', () => { f.active = activeEl.checked; });
}

async function saveCategoryFromModal() {
  const f = state.catForm;
  const name = (f.name || '').trim();
  if (!name) { showToast('Category name is required.', 'error'); return; }
  const slug = (f.slug || '').trim() || slugify(name);
  const payload = { name, slug, active: !!f.active };
  const tbl = state.ui.editingCatTab === 'design' ? 'design_categories' : 'product_categories';
  let r;
  if (state.ui.editingCatId) {
    r = await supabase.from(tbl).update(payload).eq('id', state.ui.editingCatId).select().single();
  } else {
    r = await supabase.from(tbl).insert(payload).select().single();
  }
  if (r.error) {
    const msg = r.error && /duplicate|unique/i.test(r.error.message || '') ? 'That slug or category already exists.' : 'Unable to save category.';
    showToast(msg, 'error'); console.error(r.error); return;
  }
  showToast(state.ui.editingCatId ? 'Category updated.' : 'Category created.', 'success');
  closeModal('category');
  state.ui.editingCatId = null; state.ui.editingCatTab = null; state.catForm = null;
  await refreshCategories(); renderCategories();
}

/* ========== Enquiries ========== */
function renderEnquiries() {
  const tbody = document.querySelector('[data-enquiries-body]');
  const empty = document.querySelector('[data-enquiries-empty]');
  const filter = document.querySelector('[data-enquiries-filter-status]');
  if (filter && !filter._bound) {
    filter._bound = true;
    filter.addEventListener('change', () => { state.ui.enquiries.status = filter.value; renderEnquiries(); });
  }
  if (filter) filter.value = state.ui.enquiries.status || '';
  const list = state.enquiries.filter((e) => !state.ui.enquiries.status || e.status === state.ui.enquiries.status);
  const p = paginate(list, state.ui.enquiries.page, PAGE_SIZE);
  if (!tbody) return;
  tbody.innerHTML = '';
  if (p.total === 0) { if (empty) empty.hidden = false; return; }
  if (empty) empty.hidden = true;
  tbody.innerHTML = p.items.map((e) => `
    <tr>
      <td style="padding:10px 14px; white-space:nowrap;">${formatDate(e.created_at)}</td>
      <td style="padding:10px 14px; min-width:0; word-break:break-word;">${escapeHtml(e.customer_name || '—')}</td>
      <td style="padding:10px 14px; min-width:0; word-break:break-word;">${escapeHtml(e.phone || '—')}</td>
      <td style="padding:10px 14px; min-width:0; word-break:break-word;">${escapeHtml(e.email || '—')}</td>
      <td style="padding:10px 14px; min-width:0;">${(e.product_id ? '<span class="chip">Product</span>' : '') + (e.design_id ? '<span class="chip chip-alt">Design</span>' : '') || '<span class="pill pill-muted">—</span>'}</td>
      <td style="padding:10px 14px;">${statusBadge(e.status)}</td>
    </tr>
  `).join('');
  renderPagination(document.querySelector('[data-enquiries-pagination]'), p.page, p.pages, (np)=>{ state.ui.enquiries.page = np; renderEnquiries(); });
}

/* ========== Settings ========== */
function renderSettings() {
  // identity already rendered at top; ensure settings section has them too
  const email = document.querySelector('[data-settings-email]');
  const role = document.querySelector('[data-settings-role]');
  const status = document.querySelector('[data-settings-status]');
  const since = document.querySelector('[data-settings-since]');
  if (email) email.textContent = state.admin.email || state.user.email || '';
  if (role) role.textContent = state.admin.role || 'admin';
  if (status) {
    status.textContent = state.admin.active ? 'Active' : 'Disabled';
    status.style.color = state.admin.active ? '#2D7A47' : '#A5432B';
    status.style.fontWeight = 600;
  }
  if (since) since.textContent = formatDate(state.admin.created_at);
  const btn = document.querySelector('[data-settings-logout]');
  if (btn && !btn._bound) {
    btn._bound = true;
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('Sign out of the admin dashboard?', 'Log Out');
      if (!ok) return;
      await logoutAdmin();
    });
  }
}

/* ========== Modal system ========== */
function openModal(name) {
  const el = document.querySelector(`[data-modal="${name}"]`);
  if (!el) return;
  el.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  const modal = el.querySelector('.modal') || el.children[0];
  if (modal) {
    const f = modal.querySelector('input, select, textarea');
    if (f) setTimeout(()=> f.focus(), 50);
  }
  // bind the modal footer buttons
  const save = el.querySelector('[data-modal-action="save"]');
  const cancel = el.querySelector('[data-modal-action="cancel"]');
  const del = el.querySelector('[data-modal-action="delete"]');
  if (save && !save._bound_once) {
    save._bound_once = true;
    save.addEventListener('click', async () => {
      if (name === 'product') await saveProductFromModal();
      else if (name === 'design') await saveDesignFromModal();
      else if (name === 'category') await saveCategoryFromModal();
    });
  }
  if (cancel && !cancel._bound_once) {
    cancel._bound_once = true;
    cancel.addEventListener('click', () => closeModal(name));
  }
  if (del && !del._bound_once) {
    del._bound_once = true;
    del.addEventListener('click', async () => {
      if (name === 'product') await deleteProductFromModal();
      else if (name === 'design') await deleteDesignFromModal();
    });
  }
  if (del) {
    del.style.display = (name === 'product' && state.ui.editingProductId) ||
                         (name === 'design'  && state.ui.editingDesignId) ? 'inline-flex' : 'none';
  }
  if (save) save.textContent =
    (name === 'product' ? (state.ui.editingProductId ? 'Update Product' : 'Save Product')
     : name === 'design' ? (state.ui.editingDesignId ? 'Update Design' : 'Save Design')
     : state.ui.editingCatId ? 'Update Category' : 'Add Category');
}

function closeModal(name) {
  const el = document.querySelector(`[data-modal="${name}"]`);
  if (!el) return;
  el.classList.remove('is-open');
  document.body.style.overflow = '';
}

/* Close on backdrop, Esc, close button — wire once per modal */
document.querySelectorAll('[data-modal]').forEach((overlay) => {
  const name = overlay.getAttribute('data-modal');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(name); });
  overlay.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', () => closeModal(name)));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('[data-modal].is-open').forEach((o) => {
      closeModal(o.getAttribute('data-modal'));
    });
  }
});

/* ========== Tiny UI helpers ========== */
function mkFileInput() {
  const i = document.createElement('input'); i.type = 'file';
  i.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
  return i;
}

function timestampFilename(name) {
  const base = String(name || 'file').replace(/[^\w.\-]+/g, '_');
  const ts = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  return ts + '-' + base;
}

function imageTile(src, index, prefix) {
  const replace = prefix === 'pgallery' ? 'pgalleryreplace' : 'dgalleryreplace';
  const del = prefix === 'pgallery' ? 'pgallerydel' : 'dgallerydel';
  return `
    <div class="image-slot">
      <img src="${src}" alt="preview">
      <div class="image-actions">
        <button type="button" class="btn btn-link" data-imgaction="${replace}:${index}" data-dimgaction="${replace}:${index}">Replace</button>
        <button type="button" class="btn btn-link btn-danger" data-imgaction="${del}:${index}" data-dimgaction="${del}:${index}">Delete</button>
      </div>
    </div>
  `;
}

function humanizeStock(s) {
  return {
    in_stock: 'In Stock',
    out_of_stock: 'Out of Stock',
    made_to_order: 'Made to Order',
    available_on_request: 'Available on Request'
  }[s] || s;
}
function stockBadge(s) {
  const map = {
    in_stock:  ['In Stock', 'pill-active'],
    out_of_stock: ['Out of Stock', 'pill-inactive'],
    made_to_order: ['Made to Order', 'pill-featured'],
    available_on_request: ['On Request', 'pill-muted']
  };
  const [label, cls] = map[s] || [humanizeStock(s), 'pill-muted'];
  return `<span class="pill ${cls}">${label}</span>`;
}
function statusBadge(s) {
  const m = {
    new:        ['New', 'pill-featured'],
    contacted:  ['Contacted', 'pill-active'],
    completed:  ['Completed', 'pill-muted'],
    cancelled:  ['Cancelled', 'pill-inactive']
  };
  const [l, c] = m[s] || [s || '—', 'pill-muted'];
  return `<span class="pill ${c}">${l}</span>`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function renderPagination(host, page, pages, onPage) {
  if (!host) return;
  host.hidden = pages <= 1;
  host.innerHTML = '';
  const mk = (label, target, disabled, active) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'page-btn' + (active ? ' is-active' : '');
    b.textContent = label;
    if (disabled) b.disabled = true;
    b.addEventListener('click', () => onPage(target));
    return b;
  };
  host.appendChild(mk('← Prev', Math.max(1, page-1), page <= 1));
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i++) host.appendChild(mk(String(i), i, false, i === page));
  host.appendChild(mk('Next →', Math.min(pages, page+1), page >= pages));
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

/* Expose for admin.html to start the app */
if (typeof window !== 'undefined') {
  window.PPMC_ADMIN_BOOT = () => bootApp();
}
