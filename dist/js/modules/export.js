// /js/modules/export.js

export function initExport({ buttonEl, formatEl, targetEl, filenameBase = 'Dashboard' } = {}) {
  if (!buttonEl) return;

  buttonEl.addEventListener('click', async () => {
    const format = (formatEl?.value || 'pdf').toLowerCase();

    const base =
      typeof filenameBase === 'function' ? filenameBase() : filenameBase;

    const safeBase = sanitizeFileBase(base || 'Dashboard');

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    const filename = `${safeBase}_${yyyy}-${mm}-${dd}.${format}`;

    try {
      buttonEl.disabled = true;
      buttonEl.classList.add('opacity-50', 'cursor-not-allowed');
      await exportDashboard({ targetEl, format, filename });
    } catch (err) {
      console.error(err);
      alert('Export failed — check console for details.');
    } finally {
      buttonEl.disabled = false;
      buttonEl.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });
}

// Keep filenames OS-friendly (Windows-safe)
function sanitizeFileBase(name) {
  return String(name)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')  // illegal filename chars
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
}

export async function exportDashboard({ targetEl, format = 'pdf', filename = 'Dashboard.pdf' } = {}) {
  if (!targetEl) throw new Error('exportDashboard: targetEl is missing.');

  const html2canvas = window.html2canvas;
  if (typeof html2canvas !== 'function') {
    throw new Error('html2canvas is not loaded. Ensure CDN script is before module scripts.');
  }

  const rect = targetEl.getBoundingClientRect();
  const extra = 8;
  const renderCssHeight = Math.ceil(rect.height + extra);

  let breakpointsCssPx = [];

  const canvas = await window.html2canvas(targetEl, {
    backgroundColor: '#ffffff',
    scale: 3,
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    width: Math.ceil(rect.width + extra),
    height: renderCssHeight,
    windowWidth: Math.ceil(document.documentElement.clientWidth),
    windowHeight: Math.ceil(window.innerHeight),

    onclone: (doc) => {
      const root = doc.getElementById('export-root');
      if (!root) return;

      root.style.background = '#ffffff';
      root.style.paddingRight = '8px';
      root.style.paddingBottom = '8px';
      root.style.overflow = 'visible';

      // remove Tailwind shadows only (as you already do)
      const style = doc.createElement('style');
      style.textContent = `
        #export-root .shadow,
        #export-root [class*="shadow-"] {
          --tw-shadow: 0 0 #0000 !important;
          --tw-shadow-colored: 0 0 #0000 !important;
          box-shadow:
            var(--tw-ring-offset-shadow, 0 0 #0000),
            var(--tw-ring-shadow, 0 0 #0000),
            var(--tw-shadow) !important;
        }
      `;
      doc.head.appendChild(style);

      // ✅ Breakpoints = bottom of each outer card
      const rootRect = root.getBoundingClientRect();
      const cards = root.querySelectorAll('.rounded-2xl');

      breakpointsCssPx = Array.from(cards)
        .map(el => Math.round(el.getBoundingClientRect().bottom - rootRect.top))
        .filter(y => y > 0)
        .sort((a, b) => a - b);
    }
  });

  if (format === 'png') {
    await downloadPng(canvas, filename);
    return;
  }

  await downloadPdf(canvas, filename, { breakpointsCssPx, renderCssHeight });
}


function downloadPng(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

function downloadPdf(canvas, filename, { breakpointsCssPx = [], renderCssHeight } = {}) {
  const jspdf = window.jspdf;
  if (!jspdf?.jsPDF) throw new Error('jsPDF is not loaded.');
  const { jsPDF } = jspdf;

  const landscape = canvas.width > canvas.height;
  const pdf = new jsPDF(landscape ? 'l' : 'p', 'mm', 'a4');

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 10;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  // Convert CSS breakpoints -> canvas pixels
  const scaleY = canvas.height / (renderCssHeight || canvas.height);
  const breakpointsPx = (breakpointsCssPx || [])
    .map(y => Math.floor(y * scaleY))
    .filter(y => y > 0 && y < canvas.height)
    .sort((a, b) => a - b);

  // ✅ NEW: stop at the last real content breakpoint (bottom of last .rounded-2xl)
  // This prevents trailing whitespace from becoming a blank PDF page.
  const maxCanvasHeight = breakpointsPx.length
    ? Math.min(canvas.height, breakpointsPx[breakpointsPx.length - 1] + Math.floor(8 * scaleY)) // small pad
    : canvas.height;

  // Fit canvas width into usable PDF width
  const pxPerMm = canvas.width / usableWidth;
  const pageSliceHeightPx = Math.floor(usableHeight * pxPerMm);

  const sliceCanvas = document.createElement('canvas');
  const sliceCtx = sliceCanvas.getContext('2d');
  sliceCanvas.width = canvas.width;

  let yPx = 0;
  let pageIndex = 0;

  // ✅ CHANGED: loop until maxCanvasHeight, not canvas.height
  while (yPx < maxCanvasHeight) {

    // ✅ NEW: if the remaining content is tiny, don't create a new page
    const remaining = maxCanvasHeight - yPx;
    if (remaining < 20) break;

    const targetCut = yPx + pageSliceHeightPx;

    const minSlice = Math.floor(pageSliceHeightPx * 0.4);
    let cutPx = Math.min(targetCut, maxCanvasHeight); // ✅ use maxCanvasHeight here

    for (let i = breakpointsPx.length - 1; i >= 0; i--) {
      const bp = breakpointsPx[i];
      if (bp <= cutPx && bp > yPx + minSlice) {
        cutPx = bp;
        break;
      }
    }

    // ✅ NEW: guard against creating ultra-thin slices
    if (cutPx <= yPx + 5) break;

    const sliceHeight = cutPx - yPx;
    sliceCanvas.height = sliceHeight;

    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

    sliceCtx.drawImage(
      canvas,
      0, yPx, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight
    );

    const imgData = sliceCanvas.toDataURL('image/png');

    if (pageIndex > 0) pdf.addPage();

    const sliceHeightMm = sliceHeight / pxPerMm;

    pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, sliceHeightMm); // jsPDF addImage

    yPx += sliceHeight;
    pageIndex++;
  }

  pdf.save(filename);
}
