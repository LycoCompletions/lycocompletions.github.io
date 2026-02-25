import {
  show, hide, escapeHtml, formatBytes, isExcel, normalizeKey, toCumulative,
  normalizeToISODateOnly, parseISODateUTC, fmtYMDUTC, startOfISOWeekYMD, endOfMonthYMD,
  parseExcelToRows, looksLikePrimary, looksLikeSystems, missingRequiredHeaders, missingSystemsHeaders, buildMergedRows,
  createFilters, createDashboard, createFilesUI
} from './modules/index.js';

import { createSystemsMatrix } from './modules/systems/index.js';

window.addEventListener('load', async () => {
  // ===== DOM REFS =====
  const layoutPreview = document.getElementById('layout-preview');
  const layoutDash = document.getElementById('layout-dash');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const statusBox = document.getElementById('parse-status');

  const filtersPanel = document.getElementById('filters-panel');
  const filtersContainer = document.getElementById('filters-container');
  const toggleFiltersBtn = document.getElementById('toggle-filters');
  const clearAllBtn = document.getElementById('clear-all');
  const btnExport = document.getElementById('btn-export-pdf');

  const tableWrap = document.getElementById('table-wrap');
  const tableHead = document.getElementById('table-head');
  const tableBody = document.getElementById('table-body');
  const resultsBar = document.getElementById('results-bar');
  const rowsCount = document.getElementById('rows-count');
  const filteredCount = document.getElementById('filtered-count');

  // View toggle
  const viewToggle = document.getElementById('view-toggle');
  const activePill = document.getElementById('view-active-pill');
  const btnPreview = document.getElementById('btn-preview');
  const btnDashboard = document.getElementById('btn-dashboard');

  // Chart title
  const titleActual = document.getElementById('chart-actual-title');

  // Grain toggle
  const aggToggle = document.getElementById('agg-toggle');
  const aggActivePill = document.getElementById('agg-active-pill');
  const btnAggDaily = document.getElementById('btn-agg-daily');
  const btnAggWeekly = document.getElementById('btn-agg-weekly');
  const btnAggMonthly = document.getElementById('btn-agg-monthly');
  const btnAggYearly = document.getElementById('btn-agg-yearly');

  // ===== App state =====

  const state = {
    primaryFile: null,
    systemsFile: null,
    primaryRows: [],
    systemsRows: [],
  };

  // Dataset view
  let allRows = [];
  let currentFilteredRows = [];

  // Standardized fields for table/filters
  const FIELDS = [
    'Status', 'RespID', 'CertID', 'EventDescription', 'TagNo', 'System',
    'SubSystem', 'Cert Disc', 'Area', 'System Description'
  ];

  // ===== Status UI helper =====
  function setStatus(msg, tone = 'info') {
    const toneCls = tone === 'error' ? 'text-red-700 bg-red-50 border-red-200'
      : tone === 'success' ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-slate-700 bg-slate-50 border-slate-200';
    statusBox.className = 'mt-6 rounded-md border p-4 text-sm ' + toneCls;
    statusBox.textContent = msg;
    show(statusBox);
  }

  // ===== Chart.js DataLabels loader (global) =====
  const DATALABELS_URL = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2';
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  try {
    if (window.Chart && !window.ChartDataLabels) await loadScript(DATALABELS_URL);
    if (window.Chart && window.ChartDataLabels) Chart.register(window.ChartDataLabels);
  } catch (e) {
    console.warn('chartjs-plugin-datalabels failed to load:', e);
  }

  // ===== Controllers =====

  // Systems matrix
  const systemsMatrix = createSystemsMatrix({
    table: document.getElementById('systems-matrix-table')
  });

  // Dashboard (view + agg + chart/matrix orchestration)
  const dashboard = createDashboard({
    // Layout
    layoutPreview, layoutDash, filtersPanel,
    // View toggle
    viewToggle, activePill, btnPreview, btnDashboard,
    // Chart title
    titleActual,
    // Grain toggle
    aggToggle, aggActivePill, btnAggDaily, btnAggWeekly, btnAggMonthly, btnAggYearly,
    // External controllers
    systemsMatrix
  });

  dashboard.setDashboardButtonEnabled(false);
  dashboard.setAggLevelsEnabled(false);

  // Filters controller (uses dashboard to force view & resize)
  const filtersController = createFilters({
    FIELDS,
    filtersPanel,
    filtersContainer,
    toggleFiltersBtn,
    btnExport,
    clearAllBtn,
    layoutDash,
    ensureDashboardView: () => dashboard.setView('dashboard', currentFilteredRows ?? []),
    onFiltered: (filteredRows) => {
      updateResults(filteredRows); // keeps table + results bar in sync
    },
    onLayoutChange: () => {
      dashboard.resizeAllCharts();
    }
  });

  // Files UI controller
  const filesUI = createFilesUI({
    dropzone,
    fileInput,
    fileList,
    getExistingCount: () => (state.primaryFile ? 1 : 0) + (state.systemsFile ? 1 : 0),
    onFiles: (incomingFiles) => handleIncomingFiles(incomingFiles),
    onRemove: (role) => removeFileByRole(role),
    setStatus
  });

  dashboard.ensureWireEvents(() => currentFilteredRows);
  filesUI.ensureWireEvents();

  // ===== Results (preview) & dashboard =====
  function updateResults(rows) {
    currentFilteredRows = rows;
    rowsCount.textContent = allRows.length;
    filteredCount.textContent = rows.length;
    const showCols = FIELDS;
    tableHead.innerHTML = showCols.map(col => `<th class="px-3 py-2 text-left text-xs font-semibold text-slate-600">${col}</th>`).join('');
    const maxRows = 200;
    tableBody.innerHTML = rows.slice(0, maxRows).map(r => `
      <tr class="hover:bg-slate-50">
        ${showCols.map(c => `<td class="whitespace-nowrap px-3 py-2 text-xs text-slate-800">${escapeHtml(r[c] ?? '')}</td>`).join('')}
      </tr>
    `).join('');
    show(tableWrap);
    show(resultsBar);

    // Delegate full dashboard rendering to the controller
    dashboard.render(rows);
  }

  // Helper to build the items list for filesUI
  function getFileItems() {
    const items = [];
    if (state.primaryFile) items.push({ role: 'primary', file: state.primaryFile, label: 'Data file' });
    if (state.systemsFile) items.push({ role: 'systems', file: state.systemsFile, label: 'Systems list' });
    return items;
  }

  // ===== Remove file (and rebuild or reset) =====
  function removeFileByRole(role, { silent = false } = {}) {
    if (role === 'primary') { state.primaryFile = null; state.primaryRows = []; }
    if (role === 'systems') { state.systemsFile = null; state.systemsRows = []; }

    const hasPrimary = !!state.primaryFile && (state.primaryRows?.length > 0);
    const hasSystems = !!state.systemsFile && (state.systemsRows?.length > 0);

    if (!hasPrimary || !hasSystems) {
      // Full reset
      allRows = [];
      currentFilteredRows = [];
      tableHead.innerHTML = '';
      tableBody.innerHTML = '';
      rowsCount.textContent = '0';
      filteredCount.textContent = '0';
      hide(tableWrap);
      hide(resultsBar);

      dashboard.setDashboardButtonEnabled(false);
      dashboard.setView('preview', []);
      filesUI.render(getFileItems());
      filtersController.updateData([]);      // disable filters
      dashboard.setAggLevelsEnabled(false);
      systemsMatrix.update([]);

      if (!silent) setStatus('Both files are required. Please attach a data file and a systems list.', 'error');
      return;
    }

    // Both still present -> rebuild and render
    allRows = buildMergedRows(state.primaryRows, state.systemsRows);
    filtersController.updateData(allRows);
    dashboard.setDashboardButtonEnabled(true);
    dashboard.setView('dashboard', currentFilteredRows ?? []);
    filesUI.render(getFileItems());
  }

  // ===== Parse logic (two files) =====
  async function handleIncomingFiles(files) {
    try {
      setStatus('Parsing ...');
      const parsedBatch = [];
      for (const f of files) {
        const rows = await parseExcelToRows(f);
        parsedBatch.push({ file: f, rows });
      }

      // Determine roles with validation
      for (const { file, rows } of parsedBatch) {
        const isSystems = looksLikeSystems(rows);
        const isPrimary = looksLikePrimary(rows);

        if (isSystems) {
          const missing = missingSystemsHeaders(rows);
          if (missing.length) {
            setStatus(`Systems File: Missing Columns: ${missing.join(', ')}`, 'error');
            return;
          }
          state.systemsFile = file; state.systemsRows = rows;
          continue;
        }

        if (isPrimary) {
          const missing = missingRequiredHeaders(rows, [
            'Status','RespID','CertID','EventDescription','TagNo',
            'System','SubSystem','Cert Disc','Area','Actual (UTC +8)'
          ]);
          if (missing.length) {
            setStatus(`Checklists File: Missing Columns: ${missing.join(', ')}`, 'error');
            return;
          }
          state.primaryFile = file; state.primaryRows = rows;
          continue;
        }

        // Fallback: try both roles explicitly
        const missingPrimary = missingRequiredHeaders(rows, [
          'Status','RespID','CertID','EventDescription','TagNo',
          'System','SubSystem','Cert Disc','Area','Actual (UTC +8)'
        ]);
        const missingSystems = missingSystemsHeaders(rows);

        if (missingSystems.length === 0) {
          state.systemsFile = file; state.systemsRows = rows;
        } else if (missingPrimary.length === 0) {
          state.primaryFile = file; state.primaryRows = rows;
        } else {
          const toShow = (missingPrimary.length && missingSystems.length)
            ? (missingPrimary.length <= missingSystems.length ? missingPrimary : missingSystems)
            : (missingPrimary.length ? missingPrimary : missingSystems);
          setStatus(`Missing columns: ${toShow.join(', ')}`, 'error');
          return;
        }
      }

      // Require both files
      const hasPrimary = !!state.primaryFile && (state.primaryRows?.length > 0);
      const hasSystems = !!state.systemsFile && (state.systemsRows?.length > 0);

      if (!hasPrimary || !hasSystems) {
        allRows = [];
        currentFilteredRows = [];
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        rowsCount.textContent = '0';
        filteredCount.textContent = '0';
        hide(tableWrap);
        hide(resultsBar);

        dashboard.setDashboardButtonEnabled(false);
        dashboard.setView('preview', []);
        filesUI.render(getFileItems());
        filtersController.updateData([]);    // disable filters
        dashboard.setAggLevelsEnabled(false);
        systemsMatrix.update([]);

        const missing = [
          !hasPrimary ? 'data file (with required columns)' : null,
          !hasSystems ? 'systems list (System + Description)' : null
        ].filter(Boolean).join(' and ');
        setStatus(`Both files are required. Missing: ${missing}.`, 'error');
        return;
      }

      // Enrich and render
      allRows = buildMergedRows(state.primaryRows, state.systemsRows);
      if (allRows.length === 0) {
        setStatus('No data rows found after enrichment.', 'error');
        return;
      }

      filtersController.updateData(allRows);

      const parts = [];
      if (state.primaryFile) parts.push(`data: "${state.primaryFile.name}"`);
      if (state.systemsFile) parts.push(`systems: "${state.systemsFile.name}"`);
      setStatus(`Parsed ${parts.join(' + ')} • ${allRows.length} row(s) after enrichment.`, 'success');

      dashboard.setDashboardButtonEnabled(true);
      dashboard.setView('dashboard', currentFilteredRows ?? []);
      filesUI.render(getFileItems());
      dashboard.setAggLevelsEnabled(true);
    } catch (err) {
      console.error(err);
      setStatus(err?.message || 'Failed to parse the Excel file(s). Please check the format and try again.', 'error');
    }
  }

  //HTML2Canvas

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
      backgroundColor, // white background for transparency-safe result
      useCORS,
      allowTaint: false,
      logging: false,  // set to true for troubleshooting
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


  // Slight pause to let charts finish any animations
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Export PNG

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    try {
      dashboard.ensureDashboardView(() => currentFilteredRows);
      await wait(300);

      const el = document.getElementById('view-dashboard');
      
      html2canvas(el, {
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        scale: Math.min(window.devicePixelRatio || 1, 2)
      });

      const dataUrl = await withExportStyles(el, () =>
        captureElementToDataUrl(el, {
          scale: Math.min(window.devicePixelRatio || 1, 2),
          backgroundColor: null,
          useCORS: true
        })
      );

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadDataUrl(dataUrl, `dashboard-${stamp}.png`);
    } catch (e) {
      console.error(e);
      setStatus(e?.message || 'Failed to export dashboard PNG.', 'error');
    }
  });



});