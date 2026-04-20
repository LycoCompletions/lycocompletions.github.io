// /main.js
import { selectors } from './modules/config.js';
import { $, updateCount } from './modules/dom.js';
import { State } from './modules/state.js';
import { initItems } from './modules/items.js';
import { initUploader } from './modules/uploader.js';
import {
  initActualCharts,
  recomputeActualCharts,
  setActualChartsAggregation,
  initStatusChart,
  recomputeStatusChart,
  initDisciplineChart,
  recomputeDisciplineChart,
  initRespIdChart,
  recomputeRespIdChart,
  initPhaseCompletionChart,
  recomputePhaseCompletionChart,
  initPunchCategoryChart,
  recomputePunchCategoryChart,
  initPunchCumulativeChart,
  recomputePunchCumulativeChart,  
  initCreatedCompletedWeeklyChart,
  recomputeCreatedCompletedWeeklyChart
} from './modules/charts.js';
import {
    initSystemsProgressTable,
    recomputeSystemsProgressTable
} from './modules/systems.js'
import { recomputeChecklistSummary } from './modules/metrics.js';
import { rebuildContractorJoin } from './modules/relations.js';
import { initFiltersUI, buildAndRenderFilters, filterChecklistsRows, filterPunchRows } from './modules/filters.js';
import { initExport } from './modules/export.js';
/* -----------------------------------------------------------
   Utilities
----------------------------------------------------------- */

function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

/** Recompute KPI cards + both charts in one go */
export function recomputeAll() {
  recomputeChecklistSummary();
  recomputeActualCharts();
  recomputeStatusChart();
  recomputeDisciplineChart();
  recomputeRespIdChart();
  recomputePhaseCompletionChart();
  recomputePunchCategoryChart();
  recomputePunchCumulativeChart();
  recomputeSystemsProgressTable();
  evaluateFiltersReadiness();
  evaluateExportReadiness();
  recomputeCreatedCompletedWeeklyChart();

 rebuildContractorJoin();   // <— keeps the ContractorID ⇄ RespID index fresh

}

// --- Export readiness gate -----------------------------------
const REQUIRED_TYPES = ['checklists', 'systems', 'punch', 'contractors']; // tweak as needed

function evaluateFiltersReadiness() {
  if (!els.openFiltersBtn) return;

  const files = State.get();
  const anyFiles = files.length > 0;

  // Every uploaded file must have a type selected (no blanks).
  const allAssigned = files.every(f => typeof f.type === 'string' && f.type.trim() !== '');

  // Same required-types logic as Export readiness
  const hasEachRequired = REQUIRED_TYPES.every(t =>
    files.some(f => f.type === t && f.validation?.ok)
  );

  const ready = anyFiles && allAssigned && hasEachRequired;

  // Reflect state (match your Export UX)
  els.openFiltersBtn.disabled = !ready;
  els.openFiltersBtn.setAttribute('aria-disabled', String(!ready));
  els.openFiltersBtn.classList.toggle('opacity-50', !ready);
  els.openFiltersBtn.classList.toggle('cursor-not-allowed', !ready);

  // Optional: prevent click interactions entirely when disabled
  els.openFiltersBtn.classList.toggle('pointer-events-none', !ready);

  els.openFiltersBtn.title = ready
    ? ''
    : 'Upload/assign all required files (checklists, systems, punch, contractors) to enable filters.';
}

function evaluateExportReadiness() {
  if (!els.btnExport) return;

  const files = State.get();
  const anyFiles = files.length > 0;

  // Every uploaded file must have a type selected (no blanks).
  const allAssigned = files.every(f => typeof f.type === 'string' && f.type.trim() !== '');

  // Optional: only consider validated files as "present" for required types.
  // If you don't want to consider validation, drop "&& f.validation?.ok".
  const hasEachRequired = REQUIRED_TYPES.every(t =>
    files.some(f => f.type === t && f.validation?.ok)
  );

  const ready = anyFiles && allAssigned && hasEachRequired;

  // Reflect state
  els.btnExport.disabled = !ready;
  els.btnExport.setAttribute('aria-disabled', String(!ready));
  els.btnExport.classList.toggle('opacity-50', !ready);
  els.btnExport.classList.toggle('cursor-not-allowed', !ready);
  els.btnExport.title = ready
    ? ''
    : 'Assign a type to each file and include all required types (checklists, systems, punch).';
}

/* -----------------------------------------------------------
   Grab DOM elements
----------------------------------------------------------- */

const els = {
  // uploader / list
  dropzone:  $(selectors.dropzone),
  fileInput: $(selectors.fileInput),
  browse:    $(selectors.browse),

  fileList:  $(selectors.fileList),
  fileCount: $(selectors.fileCount),
  fileLimit: $(selectors.fileLimit),
  // Inputs
  jobNameInput: document.getElementById('jobName'),

  // charts
  chartCountCanvas:           document.getElementById('chart-actual-count'),
  chartCumulativeCanvas:      document.getElementById('chart-actual-cumulative'),
  chartStatusCanvas:          document.getElementById('chart-status'),
  chartDisciplineCanvas:      document.getElementById('chart-discipline'),
  chartRespIdCanvas:          document.getElementById('chart-respid'),
  chartPhaseCompletionCanvas: document.getElementById('chart-phase-completion'),
  chartPunchCategoryCanvas:   document.getElementById('chart-punch-category'),
  chartPunchCumulativeCanvas: document.getElementById('chart-punch-cumulative'),
  chartCreatedCompletedWeek: document.getElementById('chart-created-completed-week'),

  // progression table
  systemsTable:               document.getElementById('tbl-systems-progress'),

  // all aggregation pills (both cards)
  aggPillGroups: document.querySelectorAll('[data-role="agg-pills"]'),

  // Export button
  btnExport:                  document.getElementById('btn-export'),
  exportRoot: document.getElementById('export-root'),
  exportFormat: document.getElementById('export-format'),


  // Filters  
  openFiltersBtn: document.getElementById('btn-open-filters'),
  filterPanel:    document.getElementById('filter-panel'),
  filterApply:    document.getElementById('flt-apply'),
  filterReset:    document.getElementById('flt-reset'),
  filterClose:    document.getElementById('flt-close')
  

};

const JOBNAME_KEY = 'cg.jobName.v1';

function loadJobName() {
  try {
    return localStorage.getItem(JOBNAME_KEY) || '';
  } catch {
    return '';
  }
}

function saveJobName(value) {
  try {
    localStorage.setItem(JOBNAME_KEY, value);
  } catch {
    console.warn('saveJobName failed:', e?.name, e?.message, e);
  }
}


/* -----------------------------------------------------------
   Boot the app
----------------------------------------------------------- */

// Restore job name on load
if (els.jobNameInput) {
  els.jobNameInput.value = loadJobName();

  // Persist on change (input event feels best UX)
  els.jobNameInput.addEventListener('input', (e) => {
    saveJobName(e.target.value.trim());
  });
}

// 1) Initialize list + uploader
initItems({ listEl: els.fileList, countEl: els.fileCount, limitEl: els.fileLimit });
initUploader({ dropzone: els.dropzone, fileInput: els.fileInput, browse: els.browse });

// Initial counter
updateCount(els.fileCount, State.get().length);
evaluateExportReadiness();

// 2) Initialize charts (safe even if there's no data yet)
if (els.chartCountCanvas && els.chartCumulativeCanvas) {
  // Detect initial aggregation from any pill group (default 'week' if none)
  const initialAgg = (() => {
    for (const grp of els.aggPillGroups) {
      const activeBtn = grp.querySelector('button.bg-slate-900, button.text-white');
      if (activeBtn?.dataset?.agg) return activeBtn.dataset.agg;
    }
    return 'week';
  })();

  initActualCharts({
    countEl: els.chartCountCanvas,
    cumulativeEl: els.chartCumulativeCanvas,
    defaultAgg: initialAgg
  });

  // Make sure all pill groups visually match the initial aggregation
  setActiveAggregationOnAllPills(initialAgg);
}

initFiltersUI({
  panelEl: els.filterPanel,
  openBtn: els.openFiltersBtn,
  closeBtn: els.filterClose,
  applyBtn: els.filterApply,
  resetBtn: els.filterReset
});


initExport({
  buttonEl: els.btnExport,
  formatEl: els.exportFormat,
  targetEl: els.exportRoot,
  filenameBase: () => els.jobNameInput?.value?.trim() || loadJobName() || 'Dashboard'
});


// Rebuild the dynamic options whenever files change
buildAndRenderFilters();


if (els.chartStatusCanvas) {
  initStatusChart({ el: els.chartStatusCanvas });
}

if (els.chartDisciplineCanvas) {
  initDisciplineChart({ el: els.chartDisciplineCanvas });
}

if (els.chartRespIdCanvas) {
    initRespIdChart({ el: els.chartRespIdCanvas });
}

if (els.chartPhaseCompletionCanvas) {
    initPhaseCompletionChart({el: els.chartPhaseCompletionCanvas });
}


if (els.chartPunchCategoryCanvas) {
  initPunchCategoryChart({ el: els.chartPunchCategoryCanvas });
}


if (els.chartPunchCumulativeCanvas) {
  initPunchCumulativeChart({ el: els.chartPunchCumulativeCanvas}); // defaults to weekly
}

if (els.systemsTable) {
    initSystemsProgressTable({ el: els.systemsTable});
}


if (els.chartCreatedCompletedWeek) {
  initCreatedCompletedWeeklyChart({ el: els.chartCreatedCompletedWeek });
}

els.filterApply?.addEventListener('click', () => {
  rebuildContractorJoin();   // keep the joins fresh for any Contract No → ContractorID mapping
   recomputeAll();
});
els.filterReset?.addEventListener('click', () => {
  rebuildContractorJoin();
  recomputeAll();
});

// 3) First compute (empty or preloaded state)
recomputeAll();

/* -----------------------------------------------------------
   Keep everything in sync (UI → cards & charts)
----------------------------------------------------------- */

const debouncedRecompute = debounce(recomputeAll, 150);

// A) Observe DOM changes in the file list (rows added/removed/validated)
if (els.fileList) {
  const mo = new MutationObserver(() => {
    // Any structural change under file list triggers a recompute
    debouncedRecompute();
    buildAndRenderFilters();
  });
  mo.observe(els.fileList, { childList: true, subtree: true });

  // B) Explicit hooks for common interactions

  // 1) Type changes (select[data-role="file-type"])
  els.fileList.addEventListener('change', (e) => {
    if (e.target && e.target.closest('select[data-role="file-type"]')) {
      debouncedRecompute();
      buildAndRenderFilters();
    }
  });

  // 2) Remove clicks
  els.fileList.addEventListener('click', (e) => {
    if (e.target && e.target.closest('button[data-action="remove"]')) {
      // Wait for State + DOM to settle after the row is removed
      setTimeout(debouncedRecompute, 0);
      buildAndRenderFilters();
    }
  });
}

/* -----------------------------------------------------------
   Aggregation pills (Daily / Weekly / Monthly)
   - We support multiple groups via [data-role="agg-pills"]
   - Clicking any pill updates ALL groups + both charts
----------------------------------------------------------- */

function setActiveAggregationOnAllPills(agg) {
  els.aggPillGroups.forEach((grp) => {
    grp.querySelectorAll('button[data-agg]').forEach((b) => {
      const isActive = b.dataset.agg === agg;
      b.classList.toggle('bg-slate-900', isActive);
      b.classList.toggle('text-white',   isActive);
      b.classList.toggle('text-slate-700', !isActive);
      // keep hover:bg-white class as-is
    });
  });
}

els.aggPillGroups.forEach((grp) => {
  grp.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-agg]');
    if (!btn) return;
    const agg = btn.dataset.agg; // 'day' | 'week' | 'month'

    // 1) Update active styles on ALL pill groups
    setActiveAggregationOnAllPills(agg);

    // 2) Apply to charts
    setActualChartsAggregation(agg);
  });
});

/* -----------------------------------------------------------
   Optional: if your uploader fires a completion event,
   you can also recompute here explicitly.
   (The MutationObserver + listeners above are typically sufficient.)
----------------------------------------------------------- */

// window.addEventListener('uploader:complete', debouncedRecompute);