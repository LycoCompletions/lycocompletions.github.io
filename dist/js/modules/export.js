// Public factory so main.js can inject what this module needs from app state.
export function createExporter({
  // deps (all optional but recommended)
  ensureDashboardView,                // () => void   (ensures dashboard view using current rows)
  getTargetEl = () => document.getElementById('view-dashboard'),
  buildExportFileName,                // ({ base, ext }) => string
  setStatus = () => {},               // (msg, tone) => void
  dropdownEl = document.getElementById('exportDropdown'),
} = {}) {

  // ---- Utilities moved from main.js (unchanged) ----
  function downloadDataUrl(dataUrl, filename = 'dashboard.png') {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Capture a DOM element to canvas → dataURL using html2canvas
  async function captureElementToDataUrl(el, {
    scale = Math.min(window.devicePixelRatio || 1, 2), // cap scale to keep file size reasonable
    backgroundColor = null,
    useCORS = true
  } = {}) {
    if (!el) throw new Error('Element to capture was not found');

    // Ensure element is scrolled into view (html2canvas reads layout)
    el.scrollIntoView({ block: 'nearest' });

    const canvas = await html2canvas(el, {
      scale,
      backgroundColor,       // white background for transparency-safe result (null to keep transparency)
      useCORS,
      allowTaint: false,
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight
    });

    return canvas.toDataURL('image/png', 1.0);
  }

  async function withExportStyles(targetEl, fn) {
    document.documentElement.classList.add('export-capture');
    try { return await fn(); }
    finally { document.documentElement.classList.remove('export-capture'); }
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ===== Common capture (returns the PNG data URL without downloading) =====
  async function captureDashboardPngDataUrl() {
    ensureDashboardView?.();         // e.g., dashboard.ensureDashboardView(() => currentFilteredRows)
    await wait(300);

    const el = getTargetEl();
    if (!el) throw new Error('#view-dashboard not found');

    const scale = Math.min(window.devicePixelRatio || 1, 2);

    const dataUrl = await withExportStyles(el, () =>
      captureElementToDataUrl(el, {
        scale,
        backgroundColor: null, // keep transparency
        useCORS: true
      })
    );

    return dataUrl; // 'data:image/png;base64,...'
  }

  // ===== Download as PNG =====
  async function exportDashboardPNG() {
    try {
      const dataUrl = await captureDashboardPngDataUrl();
      const filename = buildExportFileName
        ? buildExportFileName({ base: 'dashboard', ext: 'png' })
        : 'dashboard.png';
      downloadDataUrl(dataUrl, filename);
    } catch (e) {
      console.error(e);
      setStatus(e?.message || 'Failed to export dashboard PNG.', 'error');
    }
  }

  // ===== Download as PDF (embeds the PNG into a single-page PDF) =====
  async function exportDashboardPDF() {
    try {
      const dataUrl = await captureDashboardPngDataUrl();

      // Load image to get natural dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;

      // Choose orientation to better fit the image
      const orientation = imgW >= imgH ? 'landscape' : 'portrait';

      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('jsPDF is not loaded');

      const pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: 'a4'
      });

      // Margins (points) and page content rect
      const MARGIN = 10;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentW = pageW - MARGIN * 2;
      const contentH = pageH - MARGIN * 2;

      // Scale to fit while preserving aspect ratio
      const scale = Math.min(contentW / imgW, contentH / imgH);
      const renderW = imgW * scale;
      const renderH = imgH * scale;

      const x = (pageW - renderW) / 2;
      const y = (pageH - renderH) / 2;

      // Optional: paint a white background (useful if your PNG has transparency)
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, 'F');

      pdf.addImage(img, 'PNG', x, y, renderW, renderH);

      const filename = buildExportFileName
        ? buildExportFileName({ base: 'dashboard', ext: 'pdf' })
        : 'dashboard.pdf';
      pdf.save(filename);
    } catch (e) {
      console.error(e);
      setStatus(e?.message || 'Failed to export dashboard PDF.', 'error');
    }
  }

  // ===== One function to route based on format (optional) =====
  async function exportDashboard(format) {
    if (format === 'png') return exportDashboardPNG();
    if (format === 'pdf') return exportDashboardPDF();
    throw new Error(`Unknown export format: ${format}`);
  }

  // Wire dropdown if provided
  if (dropdownEl) {
    dropdownEl.addEventListener('export-select', async (e) => {
      const format = e.detail?.format; // 'png' | 'pdf'
      await exportDashboard(format);
    });
  }

  // Expose API (handy for unit tests or other triggers)
  return {
    downloadDataUrl,
    captureElementToDataUrl,
    withExportStyles,
    wait,
    captureDashboardPngDataUrl,
    exportDashboardPNG,
    exportDashboardPDF,
    exportDashboard,
  };
}