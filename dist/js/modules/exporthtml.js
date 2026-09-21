// /modules/exporthtml.js

import { State } from './state.js';

import {
  buildOfflineReportRuntime
} from './reportbundler.js';

const REPORT_FILE_TYPES = new Set([
  'checklists',
  'systems',
  'punch',
  'contractors'
]);

export async function downloadOfflineInteractiveHtml({
  filename,
  jobName
}) {
  const files = collectReportFiles();

  const report = encodeReportData({
    version: 1,

    jobName: String(
      jobName || 'Interactive Report'
    ),

    files
  });

  /*
   * Resolve application assets from the Live Server origin.
   *
   * These files are only fetched while creating the report.
   * The resulting downloaded HTML embeds their contents and
   * does not require these URLs when opened later.
   */
  const baseUrl = new URL(
    '/',
    window.location.origin
  );

  const runtimeUrl = new URL(
    'dist/js/main.js',
    baseUrl
  );

  const wasmUrl = new URL(
    'dist/vendor/esbuild/esbuild.wasm',
    baseUrl
  );

  const chartUrl = new URL(
    'dist/vendor/chart/chart.umd.min.js',
    baseUrl
  );

  const dataLabelsUrl = new URL(
    'dist/vendor/chart/chartjs-plugin-datalabels.min.js',
    baseUrl
  );

  const [
    runtime,
    chartJs,
    dataLabelsJs
  ] = await Promise.all([
    buildOfflineReportRuntime({
      entryUrl: runtimeUrl.href,
      wasmUrl: wasmUrl.href
    }),

    fetchTextAsset(
      chartUrl.href,
      'Chart.js'
    ),

    fetchTextAsset(
      dataLabelsUrl.href,
      'ChartDataLabels'
    )
  ]);

  const reportHtml = buildOfflineHtml({
    report,
    runtime,
    chartJs,
    dataLabelsJs,
    jobName
  });

  downloadHtmlFile(
    reportHtml,
    filename
  );
}

function collectReportFiles() {
  const files = State.get()
    .filter(file =>
      REPORT_FILE_TYPES.has(file.type) &&
      file.validation?.ok
    )
    .map(file => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      typeExt: file.typeExt,
      sheetCount: file.sheetCount,
      totalRows: file.totalRows,
      sheets: file.sheets,
      validation: file.validation
    }));

  if (
    files.length !==
    REPORT_FILE_TYPES.size
  ) {
    throw new Error(
      'Interactive HTML export requires validated Checklists, Systems, Punch and Contractors files.'
    );
  }

  return files;
}

function buildOfflineHtml({
  report,
  runtime,
  chartJs,
  dataLabelsJs,
  jobName
}) {
  /*
   * Clone the complete application document.
   *
   * The clone provides the dashboard cards, chart canvases,
   * filter panel, aggregation controls and Systems table mount.
   */
  const documentClone =
    document.documentElement.cloneNode(true);

  documentClone.setAttribute(
    'data-report-mode',
    'true'
  );

  documentClone.removeAttribute(
    'data-theme'
  );

  /*
   * Remove uploader, queue and export controls.
   */
  documentClone
    .querySelectorAll('[data-app-only]')
    .forEach(element => {
      element.remove();
    });

  /*
   * Remove all existing scripts.
   *
   * The offline report receives fresh inline scripts for
   * Chart.js, ChartDataLabels and the bundled runtime.
   */
  documentClone
    .querySelectorAll('script')
    .forEach(script => {
      script.remove();
    });

  /*
   * Remove external stylesheets, icons and preloads.
   *
   * The report will contain one embedded stylesheet.
   */
  documentClone
    .querySelectorAll(
      [
        'link[rel="stylesheet"]',
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="preload"]',
        'link[rel="modulepreload"]'
      ].join(',')
    )
    .forEach(link => {
      link.remove();
    });

  /*
   * Remove base elements because they could affect relative
   * paths when the report is opened from the file system.
   */
  documentClone
    .querySelectorAll('base')
    .forEach(base => {
      base.remove();
    });

  /*
   * Remove any loading or fallback elements copied from the
   * currently running application.
   */
  documentClone
    .querySelectorAll(
      [
        '#report-loading',
        '#wrapper-loading',
        '#fallback'
      ].join(',')
    )
    .forEach(element => {
      element.remove();
    });

  /*
   * Clear dynamically generated filter options.
   *
   * The embedded runtime recreates them from the report data.
   */
  const filterMount =
    documentClone.querySelector(
      '#filters-dynamic'
    );

  if (filterMount) {
    filterMount.innerHTML = '';
  }

  /*
   * Reset chart canvases.
   *
   * Existing Chart.js dimensions and inline styles may have
   * been added by the active dashboard. The offline runtime
   * will initialise each canvas again.
   */
  documentClone
    .querySelectorAll('canvas')
    .forEach(canvas => {
      canvas.removeAttribute('width');
      canvas.removeAttribute('height');
      canvas.removeAttribute('style');
    });

  /*
   * Clear the live Systems Progress output.
   *
   * The offline runtime rebuilds the table from embedded data.
   */
  const systemsTable =
    documentClone.querySelector(
      '#tbl-systems-progress'
    );

  if (systemsTable) {
    systemsTable.innerHTML = '';
  }

  /*
   * Set the report job name in the cloned interface.
   */
  const reportName = String(
    jobName || 'Interactive Report'
  );

  const jobNameInput =
    documentClone.querySelector(
      '#jobName'
    );

  if (jobNameInput) {
    jobNameInput.setAttribute(
      'value',
      reportName
    );

    jobNameInput.setAttribute(
      'readonly',
      ''
    );
  }

  const title =
    documentClone.querySelector('title');

  if (title) {
    title.textContent = reportName;
  }

  /*
   * Capture the CSS currently active in the application.
   *
   * This includes the CSS generated by the Tailwind CDN
   * runtime and the application's own inline styles.
   */
  const embeddedCss =
    collectCurrentDocumentCss();

  /*
   * Remove style elements from the clone because the CSS is
   * being consolidated into one embedded style block.
   */
  documentClone
    .querySelectorAll('style')
    .forEach(style => {
      style.remove();
    });

  const head =
    documentClone.querySelector('head');

  const body =
    documentClone.querySelector('body');

  if (!head || !body) {
    throw new Error(
      'Unable to construct the offline report document.'
    );
  }

  /*
   * Insert the complete embedded stylesheet.
   */
  const styleElement =
    documentClone.ownerDocument.createElement(
      'style'
    );

  styleElement.setAttribute(
    'data-offline-report-styles',
    ''
  );

  styleElement.textContent = `
${embeddedCss}

/* Offline report overrides */

html[data-report-mode="true"] [data-app-only] {
  display: none !important;
}

html[data-report-mode="true"] #export-root {
  padding-top: 1.5rem;
}

html,
body {
  min-height: 100%;
  background: #f8fafc;
}

body {
  margin: 0;
}

#jobName[readonly] {
  cursor: default;
}

#report-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
}
  `.trim();

  head.appendChild(styleElement);

  /*
   * Insert the encoded report data.
   *
   * main.js reads this element directly when report mode starts.
   */
  const reportDataElement =
    documentClone.ownerDocument.createElement(
      'script'
    );

  reportDataElement.id =
    'embedded-report-data';

  reportDataElement.type =
    'application/json';

  reportDataElement.textContent =
    safeJsonForHtml(report);

  body.appendChild(reportDataElement);

  /*
   * Chart.js must be loaded before ChartDataLabels.
   */
  const chartScript =
    documentClone.ownerDocument.createElement(
      'script'
    );

  chartScript.setAttribute(
    'data-offline-library',
    'chartjs'
  );

  chartScript.textContent =
    safeInlineScript(chartJs);

  body.appendChild(chartScript);

  /*
   * ChartDataLabels depends on the Chart.js global.
   */
  const dataLabelsScript =
    documentClone.ownerDocument.createElement(
      'script'
    );

  dataLabelsScript.setAttribute(
    'data-offline-library',
    'chartjs-plugin-datalabels'
  );

  dataLabelsScript.textContent =
    safeInlineScript(dataLabelsJs);

  body.appendChild(dataLabelsScript);

  /*
   * The bundled application runtime must run last.
   *
   * At this point the document already contains:
   * - dashboard markup
   * - CSS
   * - report JSON
   * - Chart.js
   * - ChartDataLabels
   */
  const runtimeScript =
    documentClone.ownerDocument.createElement(
      'script'
    );

  runtimeScript.setAttribute(
    'data-offline-report-runtime',
    ''
  );

  runtimeScript.textContent =
    safeInlineScript(runtime);

  body.appendChild(runtimeScript);

  return (
    '<!doctype html>\n' +
    documentClone.outerHTML
  );
}

function collectCurrentDocumentCss() {
  const cssParts = [];

  /*
   * Capture inline style elements.
   *
   * The Tailwind CDN runtime generates a style element
   * containing the compiled utility classes.
   */
  document
    .querySelectorAll('style')
    .forEach(style => {
      const css =
        style.textContent;

      if (css && css.trim()) {
        cssParts.push(css);
      }
    });

  /*
   * Capture accessible stylesheet rules as a fallback.
   *
   * Cross-origin stylesheets may throw a SecurityError when
   * accessing cssRules. Those stylesheets are ignored safely.
   */
  for (
    const stylesheet of
    document.styleSheets
  ) {
    try {
      const rules =
        stylesheet.cssRules;

      if (!rules) continue;

      const css = Array.from(rules)
        .map(rule => rule.cssText)
        .join('\n');

      if (
        css.trim() &&
        !cssParts.includes(css)
      ) {
        cssParts.push(css);
      }
    } catch {
      // Ignore inaccessible cross-origin stylesheets.
    }
  }

  if (!cssParts.length) {
    throw new Error(
      'No application CSS was available for the offline report.'
    );
  }

  return cssParts.join('\n\n');
}

function encodeReportData(value) {
  /*
   * Spreadsheet Date objects represent wall-clock spreadsheet
   * values. Preserve their components so checklistdates.js and
   * punchdates.js can apply the UTC offset from the headers.
   */
  if (value instanceof Date) {
    return {
      __reportType: 'SpreadsheetDate',
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
      millisecond: value.getMilliseconds()
    };
  }

  if (Array.isArray(value)) {
    return value.map(
      encodeReportData
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          encodeReportData(item)
        ]
      )
    );
  }

  return value;
}

function safeJsonForHtml(value) {
  /*
   * Prevent embedded data from terminating its script element
   * or being interpreted as HTML.
   */
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function safeInlineScript(source) {
  /*
   * Prevent library or bundled source text from terminating
   * the containing inline script element.
   */
  return String(source ?? '')
    .replace(
      /<\/script/gi,
      '<\\/script'
    );
}

async function fetchTextAsset(
  url,
  label
) {
  const response = await fetch(
    url,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load ${label}: ${url}`
    );
  }

  return response.text();
}

function downloadHtmlFile(
  html,
  filename
) {
  const blob = new Blob(
    [html],
    {
      type: 'text/html;charset=utf-8'
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}