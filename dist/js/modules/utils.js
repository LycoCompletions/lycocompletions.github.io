
export function show(el) { if (el) el.classList.remove('hidden'); }
export function hide(el) { if (el) el.classList.add('hidden'); }

// Text/keys normalization
export function normalizeKey(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normVal(v) {
  return (v === undefined || v === null) ? '' : String(v).trim();
}

// Basic checks / formatting
const allowedExt = ['.xlsx', '.xls'];
export function isExcel(file) {
  const n = (file?.name ?? '').toLowerCase();
  return allowedExt.some(ext => n.endsWith(ext));
}

export function cssSafe(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 100);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${(i ? val.toFixed(1) : val.toFixed(0))} ${u[i]}`;
}

// Numeric helpers
export function toCumulative(arr) {
  let sum = 0;
  return arr.map(v => (sum += v));
}