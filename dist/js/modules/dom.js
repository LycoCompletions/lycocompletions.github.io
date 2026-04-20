export const $ = (sel) => document.querySelector(sel);

export function updateCount(el, filesLen) {
  if (el) el.textContent = `${filesLen} item${filesLen !== 1 ? 's' : ''}`;
}

export function toggleLimitNotice(el, show) {
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, (m) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])
  );
}