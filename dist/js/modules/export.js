// /js/modules/export.js

import {
  downloadOfflineInteractiveHtml
} from './exporthtml.js';

export function initExport({
  buttonEl,
  formatEl,
  targetEl,
  filenameBase = 'Dashboard'
} = {}) {
  if (!buttonEl) return;

  buttonEl.addEventListener('click', async () => {
    const format =
      (formatEl?.value || 'pdf').toLowerCase();

    const base =
      typeof filenameBase === 'function'
        ? filenameBase()
        : filenameBase;

    const safeBase = sanitizeFileBase(
      base || 'Dashboard'
    );

    const date = new Date();

    const yyyy =
      date.getFullYear();

    const mm = String(
      date.getMonth() + 1
    ).padStart(2, '0');

    const dd = String(
      date.getDate()
    ).padStart(2, '0');

    const filename =
      `${safeBase}_${yyyy}-${mm}-${dd}.${format}`;

    try {
      buttonEl.disabled = true;

      buttonEl.classList.add(
        'opacity-50',
        'cursor-not-allowed'
      );

      await exportDashboard({
        targetEl,
        format,
        filename,
        jobName: safeBase
      });
    } catch (error) {
      console.error(error);

      alert(
        'Export failed. Check the console for details.'
      );
    } finally {
      buttonEl.disabled = false;

      buttonEl.classList.remove(
        'opacity-50',
        'cursor-not-allowed'
      );
    }
  });
}

// Keep filenames compatible with common operating systems.
function sanitizeFileBase(name) {
  return String(name)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
}

export async function exportDashboard({
  targetEl,
  format = 'pdf',
  filename = 'Dashboard.pdf',
  jobName = 'Dashboard'
} = {}) {
  /*
   * Interactive HTML now means the standalone offline report.
   *
   * This branch runs before html2canvas because the HTML report
   * does not need a screenshot canvas.
   */
  if (format === 'html') {
    await downloadOfflineInteractiveHtml({
      filename,
      jobName
    });

    return;
  }

  if (!targetEl) {
    throw new Error(
      'exportDashboard: targetEl is missing.'
    );
  }

  const html2canvas =
    window.html2canvas;

  if (typeof html2canvas !== 'function') {
    throw new Error(
      'html2canvas is not loaded. Ensure the CDN script is before the module scripts.'
    );
  }

  const rect =
    targetEl.getBoundingClientRect();

  const extra = 8;

  const renderCssHeight =
    Math.ceil(rect.height + extra);

  let breakpointsCssPx = [];

  const canvas = await html2canvas(
    targetEl,
    {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      width: Math.ceil(
        rect.width + extra
      ),
      height: renderCssHeight,
      windowWidth: Math.ceil(
        document.documentElement.clientWidth
      ),
      windowHeight: Math.ceil(
        window.innerHeight
      ),

      onclone: doc => {
        const root =
          doc.getElementById(
            'export-root'
          );

        if (!root) return;

        root.style.background =
          '#ffffff';

        root.style.paddingRight =
          '8px';

        root.style.paddingBottom =
          '8px';

        root.style.overflow =
          'visible';

        /*
         * Remove Tailwind shadows from the image-based
         * PDF and PNG exports.
         */
        const style =
          doc.createElement('style');

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

        /*
         * PDF page breakpoints are based on the bottom
         * edge of each dashboard card.
         */
        const rootRect =
          root.getBoundingClientRect();

        const cards =
          root.querySelectorAll(
            '.rounded-2xl'
          );

        breakpointsCssPx =
          Array.from(cards)
            .map(element =>
              Math.round(
                element
                  .getBoundingClientRect()
                  .bottom -
                rootRect.top
              )
            )
            .filter(position =>
              position > 0
            )
            .sort(
              (a, b) => a - b
            );
      }
    }
  );

  if (format === 'png') {
    await downloadPng(
      canvas,
      filename
    );

    return;
  }

  await downloadPdf(
    canvas,
    filename,
    {
      breakpointsCssPx,
      renderCssHeight
    }
  );
}

function downloadPng(
  canvas,
  filename
) {
  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          throw new Error(
            'Unable to create the PNG export.'
          );
        }

        const url =
          URL.createObjectURL(blob);

        const anchor =
          document.createElement('a');

        anchor.href = url;
        anchor.download = filename;

        document.body.appendChild(
          anchor
        );

        anchor.click();
        anchor.remove();

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);

        resolve();
      },
      'image/png'
    );
  });
}

function downloadPdf(
  canvas,
  filename,
  {
    breakpointsCssPx = [],
    renderCssHeight
  } = {}
) {
  const jspdf =
    window.jspdf;

  if (!jspdf?.jsPDF) {
    throw new Error(
      'jsPDF is not loaded.'
    );
  }

  const { jsPDF } = jspdf;

  const landscape =
    canvas.width > canvas.height;

  const pdf = new jsPDF(
    landscape ? 'l' : 'p',
    'mm',
    'a4'
  );

  const pageWidth =
    pdf.internal.pageSize.getWidth();

  const pageHeight =
    pdf.internal.pageSize.getHeight();

  const margin = 10;

  const usableWidth =
    pageWidth - margin * 2;

  const usableHeight =
    pageHeight - margin * 2;

  /*
   * Convert CSS breakpoint positions into canvas pixels.
   */
  const scaleY =
    canvas.height /
    (
      renderCssHeight ||
      canvas.height
    );

  const breakpointsPx =
    (breakpointsCssPx || [])
      .map(position =>
        Math.floor(
          position * scaleY
        )
      )
      .filter(position =>
        position > 0 &&
        position < canvas.height
      )
      .sort(
        (a, b) => a - b
      );

  /*
   * Stop at the final content card so trailing whitespace
   * does not create a blank PDF page.
   */
  const maxCanvasHeight =
    breakpointsPx.length
      ? Math.min(
          canvas.height,
          breakpointsPx[
            breakpointsPx.length - 1
          ] +
          Math.floor(8 * scaleY)
        )
      : canvas.height;

  /*
   * Fit the canvas width into the usable PDF width.
   */
  const pxPerMm =
    canvas.width / usableWidth;

  const pageSliceHeightPx =
    Math.floor(
      usableHeight * pxPerMm
    );

  const sliceCanvas =
    document.createElement(
      'canvas'
    );

  const sliceContext =
    sliceCanvas.getContext('2d');

  if (!sliceContext) {
    throw new Error(
      'Unable to create the PDF slice canvas.'
    );
  }

  sliceCanvas.width =
    canvas.width;

  let yPx = 0;
  let pageIndex = 0;

  while (yPx < maxCanvasHeight) {
    const remaining =
      maxCanvasHeight - yPx;

    /*
     * Avoid creating a nearly empty final page.
     */
    if (remaining < 20) {
      break;
    }

    const targetCut =
      yPx + pageSliceHeightPx;

    const minSlice =
      Math.floor(
        pageSliceHeightPx * 0.4
      );

    let cutPx =
      Math.min(
        targetCut,
        maxCanvasHeight
      );

    /*
     * Prefer to cut at the bottom edge of a dashboard card
     * instead of splitting a card between pages.
     */
    for (
      let index =
        breakpointsPx.length - 1;
      index >= 0;
      index--
    ) {
      const breakpoint =
        breakpointsPx[index];

      if (
        breakpoint <= cutPx &&
        breakpoint > yPx + minSlice
      ) {
        cutPx = breakpoint;
        break;
      }
    }

    /*
     * Guard against an invalid or extremely thin slice.
     */
    if (cutPx <= yPx + 5) {
      break;
    }

    const sliceHeight =
      cutPx - yPx;

    sliceCanvas.height =
      sliceHeight;

    sliceContext.fillStyle =
      '#ffffff';

    sliceContext.fillRect(
      0,
      0,
      sliceCanvas.width,
      sliceCanvas.height
    );

    sliceContext.drawImage(
      canvas,
      0,
      yPx,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imageData =
      sliceCanvas.toDataURL(
        'image/png'
      );

    if (pageIndex > 0) {
      pdf.addPage();
    }

    const sliceHeightMm =
      sliceHeight / pxPerMm;

    pdf.addImage(
      imageData,
      'PNG',
      margin,
      margin,
      usableWidth,
      sliceHeightMm
    );

    yPx += sliceHeight;
    pageIndex++;
  }

  pdf.save(filename);
}