import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://lhjpepzrxclgtklazzpo.supabase.co';
export const SUPABASE_ANON_KEY =
  'sb_publishable_O4O_M_K3OhrQCXtAWBklEg_IeF1dO6h';
export const STORAGE_BASE = SUPABASE_URL + '/storage/v1/object/public/';
export const WHATSAPP_NUMBER = '919008765431';
export const BUSINESS_EMAIL = 'padmapriyamultichoice@gmail.com';
export const BUSINESS_NAME = 'PadmaPriya Multi Choice';
export const BUSINESS_NAME_SHORT = 'PPMC';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp'
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function formatCurrency(n, fallback = 'On Request') {
  if (n === null || n === undefined || n === '') return fallback;
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  try {
    return '₹' + num.toLocaleString('en-IN');
  } catch (_) {
    return '₹' + String(n);
  }
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
export { slugify };

export function validateImageFile(file) {
  if (!file) return { ok: false, reason: 'No file selected.' };
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const extOk = ALLOWED_IMAGE_EXT.some((e) => name.endsWith('.' + e));
  const mimeOk = ALLOWED_IMAGE_MIME.includes(mime);
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      reason: 'Unsupported file type. Please upload JPG, JPEG, PNG or WEBP.'
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason:
        'File is too large. Maximum size is ' +
        (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0) +
        ' MB.'
    };
  }
  return { ok: true };
}

export function resolvePublicUrl(storageBucket, objectPath) {
  if (!storageBucket || !objectPath) return '';
  if (/^https?:\/\//i.test(objectPath)) return objectPath;
  const bucket = String(storageBucket).trim();
  const path = String(objectPath).trim().replace(/^\/+/, '');
  if (!path) return '';
  try {
    const r = supabase.storage.from(bucket).getPublicUrl(path);
    if (r && r.data && r.data.publicUrl) return r.data.publicUrl;
  } catch (_) {
    /* fall through */
  }
  return (
    STORAGE_BASE +
    bucket +
    '/' +
    path
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/')
  );
}

// For site_images rows where the stored path is `site_images/foo` or just `foo`
export function resolveImageUrlFromRow(row, fallback) {
  if (!row) return fallback || '';
  const direct = (
    row.image_url ||
    row.image ||
    row.photo ||
    row.photo_url ||
    row.main_image ||
    ''
  )
    .toString()
    .trim();
  if (/^https?:\/\//i.test(direct)) return direct || fallback || '';
  if (direct && direct.indexOf('/') !== -1) {
    const parts = direct.replace(/^\/+/, '').split('/');
    const bucket = parts.shift();
    const path = parts.join('/');
    if (path) return resolvePublicUrl(bucket, path) || fallback || '';
  }
  if (direct) {
    return (
      resolvePublicUrl(
        row.bucket_name || row.bucket || 'site_images',
        direct
      ) || fallback || ''
    );
  }
  const storagePath = row.storage_path || row.image_path || row.object_path;
  if (storagePath) {
    const p = String(storagePath).trim().replace(/^\/+/, '').split('/');
    if (p.length >= 2) {
      return resolvePublicUrl(p.shift(), p.join('/')) || fallback || '';
    }
    return resolvePublicUrl('site_images', storagePath) || fallback || '';
  }
  return fallback || '';
}

/* ============ Toast system ============ */
let _toastHost = null;
function getToastHost() {
  if (typeof document === 'undefined') return null;
  if (_toastHost && document.body.contains(_toastHost)) return _toastHost;
  _toastHost = document.createElement('div');
  _toastHost.setAttribute('data-toast-host', '');
  _toastHost.style.cssText = [
    'position:fixed; top:20px; right:20px; z-index:99999;',
    'display:flex; flex-direction:column; gap:10px; max-width:380px; width:calc(100% - 40px);',
    'pointer-events:none;',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", Arial, sans-serif;'
  ].join('');
  document.body.appendChild(_toastHost);
  return _toastHost;
}

export function showToast(message, variant) {
  const host = getToastHost();
  if (!host) return;
  const kind = variant || 'info';
  const el = document.createElement('div');
  const colorMap = {
    success: { border: '#2D7A47', bg: '#EAF6EE', fg: '#1C4A2B' },
    error: { border: '#A5432B', bg: '#FBEAE4', fg: '#5E2312' },
    warning: { border: '#B58A4A', bg: '#FBF1DA', fg: '#604519' },
    info: { border: '#3C6CA8', bg: '#E8EFF9', fg: '#203F6B' }
  };
  const c = colorMap[kind] || colorMap.info;
  el.style.cssText = [
    'pointer-events:auto;',
    'padding:12px 14px; border-left:3px solid ' + c.border + ';',
    'background:' + c.bg + '; color:' + c.fg + ';',
    'border-radius:3px; font-size:13.5px; line-height:1.5;',
    'box-shadow:0 10px 22px -18px rgba(0,0,0,0.45);',
    'opacity:0; transform:translateY(-4px); transition:all .22s ease;',
    'word-break:break-word;'
  ].join('');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
  const ms = kind === 'error' ? 6200 : 3600;
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  }, ms);
}

/* ============ Confirmation dialog ============ */
export function confirmDialog(message, title) {
  if (typeof window === 'undefined') return Promise.resolve(true);
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed; inset:0; z-index:20000;',
      'background:rgba(20,14,8,0.55); backdrop-filter:blur(3px);',
      'display:flex; align-items:center; justify-content:center; padding:20px;',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;'
    ].join('');
    const box = document.createElement('div');
    box.style.cssText = [
      'background:#FFFDF9; border:1px solid #E2D3B2; border-radius:3px;',
      'max-width:440px; width:100%; padding:26px 24px 22px;'
    ].join('');
    const h = document.createElement('div');
    h.style.cssText =
      'font-family: "Cormorant Garamond", serif; font-size:24px; color:#2A2019; margin-bottom:10px;';
    h.textContent = title || 'Confirm';
    const p = document.createElement('div');
    p.style.cssText =
      'font-size:14px; color:#5C4C3E; line-height:1.6; margin-bottom:22px;';
    p.textContent = message || 'Are you sure?';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:10px; justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline';
    cancel.textContent = 'Cancel';
    cancel.style.cssText = [
      'padding:11px 20px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase;',
      'background:transparent; color:#2A2019; border:1px solid #2A2019; border-radius:3px;',
      'font-weight:600; cursor:pointer;',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;'
    ].join('');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = 'Confirm';
    ok.style.cssText = [
      'padding:11px 20px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase;',
      'background:#2A2019; color:#FAF6EE; border:1px solid #2A2019; border-radius:3px;',
      'font-weight:600; cursor:pointer;',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;'
    ].join('');
    actions.appendChild(cancel);
    actions.appendChild(ok);
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = (v) => {
      try {
        document.body.removeChild(overlay);
      } catch (_) {}
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    setTimeout(() => ok.focus(), 30);
  });
}

export function buildWhatsAppProductLink(productName) {
  const message = 'Hi, I am interested in ' + String(productName || '').trim() + '.';
  return (
    'https://wa.me/' +
    WHATSAPP_NUMBER +
    '?text=' +
    encodeURIComponent(message)
  );
}
