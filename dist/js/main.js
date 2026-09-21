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
} from './modules/systems.js';

import {
  recomputeChecklistSummary
} from './modules/metrics.js';

import {
  rebuildContractorJoin
} from './modules/relations.js';

import {
  initFiltersUI,
  buildAndRenderFilters
} from './modules/filters.js';

import {
  initExport
} from './modules/export.js';

/* -----------------------------------------------------------
   Report mode
----------------------------------------------------------- */

const IS_REPORT_MODE =
  document.documentElement.dataset.reportMode === 'true';

/* -----------------------------------------------------------
   General utilities
----------------------------------------------------------- */

function showReportLoadingState() {
  if (!IS_REPORT_MODE) return;

  const loading =
    document.createElement('div');

  loading.id = 'report-loading';

  loading.className =
    'fixed inset-0 z-[100] flex items-center justify-center bg-slate-50';

  loading.innerHTML = `
    <div class="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm">
      <div class="text-sm font-semibold text-slate-800">
        Loading interactive report…
      </div>

      <div class="mt-1 text-xs text-slate-500">
        Preparing embedded report data
      </div>
    </div>
  `;

  document.body.appendChild(loading);
}

function hideReportLoadingState() {
  document
    .getElementById('report-loading')
    ?.remove();
}

function decodeReportData(value) {
  if (Array.isArray(value)) {
    return value.map(decodeReportData);
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    if (
      value.__reportType ===
      'SpreadsheetDate'
    ) {
      return new Date(
        value.year,
        value.month - 1,
        value.day,
        value.hour,
        value.minute,
        value.second,
        value.millisecond
      );
    }

    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          decodeReportData(item)
        ]
      )
    );
  }

  return value;
}

function debounce(fn, wait = 150) {
  let timer = null;

  return (...args) => {
    clearTimeout(timer);

    timer = setTimeout(
      () => fn.apply(null, args),
      wait
    );
  };
}

/* -----------------------------------------------------------
   Recompute dashboard
----------------------------------------------------------- */

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
  recomputeCreatedCompletedWeeklyChart();

  evaluateFiltersReadiness();
  evaluateExportReadiness();

  // Keep the ContractorID and RespID join index current.
  rebuildContractorJoin();
}

/* -----------------------------------------------------------
   Readiness gates
----------------------------------------------------------- */

const REQUIRED_TYPES = [
  'checklists',
  'systems',
  'punch',
  'contractors'
];

function evaluateFiltersReadiness() {
  if (!els.openFiltersBtn) return;

  /*
   * A standalone interactive report already contains all of
   * its validated source data, so Filters are always enabled.
   */
  if (IS_REPORT_MODE) {
    els.openFiltersBtn.disabled = false;

    els.openFiltersBtn.setAttribute(
      'aria-disabled',
      'false'
    );

    els.openFiltersBtn.classList.remove(
      'opacity-50',
      'cursor-not-allowed',
      'pointer-events-none'
    );

    els.openFiltersBtn.title = '';

    return;
  }

  const files = State.get();

  const anyFiles =
    files.length > 0;

  const allAssigned =
    files.every(file =>
      typeof file.type === 'string' &&
      file.type.trim() !== ''
    );

  const hasEachRequired =
    REQUIRED_TYPES.every(type =>
      files.some(file =>
        file.type === type &&
        file.validation?.ok
      )
    );

  const ready =
    anyFiles &&
    allAssigned &&
    hasEachRequired;

  els.openFiltersBtn.disabled =
    !ready;

  els.openFiltersBtn.setAttribute(
    'aria-disabled',
    String(!ready)
  );

  els.openFiltersBtn.classList.toggle(
    'opacity-50',
    !ready
  );

  els.openFiltersBtn.classList.toggle(
    'cursor-not-allowed',
    !ready
  );

  els.openFiltersBtn.classList.toggle(
    'pointer-events-none',
    !ready
  );

  els.openFiltersBtn.title = ready
    ? ''
    : 'Upload and assign all required files to enable filters.';
}

function evaluateExportReadiness() {
  if (IS_REPORT_MODE) return;
  if (!els.btnExport) return;

  const files = State.get();

  const anyFiles =
    files.length > 0;

  const allAssigned =
    files.every(file =>
      typeof file.type === 'string' &&
      file.type.trim() !== ''
    );

  const hasEachRequired =
    REQUIRED_TYPES.every(type =>
      files.some(file =>
        file.type === type &&
        file.validation?.ok
      )
    );

  const ready =
    anyFiles &&
    allAssigned &&
    hasEachRequired;

  els.btnExport.disabled =
    !ready;

  els.btnExport.setAttribute(
    'aria-disabled',
    String(!ready)
  );

  els.btnExport.classList.toggle(
    'opacity-50',
    !ready
  );

  els.btnExport.classList.toggle(
    'cursor-not-allowed',
    !ready
  );

  els.btnExport.title = ready
    ? ''
    : 'Assign a type to each file and include validated Checklists, Systems, Punch and Contractors files.';
}

/* -----------------------------------------------------------
   Grab DOM elements
----------------------------------------------------------- */

const els = {
  // Uploader and file list
  dropzone:
    $(selectors.dropzone),

  fileInput:
    $(selectors.fileInput),

  browse:
    $(selectors.browse),

  fileList:
    $(selectors.fileList),

  fileCount:
    $(selectors.fileCount),

  fileLimit:
    $(selectors.fileLimit),

  // Job name
  jobNameInput:
    document.getElementById('jobName'),

  // Charts
  chartCountCanvas:
    document.getElementById(
      'chart-actual-count'
    ),

  chartCumulativeCanvas:
    document.getElementById(
      'chart-actual-cumulative'
    ),

  chartStatusCanvas:
    document.getElementById(
      'chart-status'
    ),

  chartDisciplineCanvas:
    document.getElementById(
      'chart-discipline'
    ),

  chartRespIdCanvas:
    document.getElementById(
      'chart-respid'
    ),

  chartPhaseCompletionCanvas:
    document.getElementById(
      'chart-phase-completion'
    ),

  chartPunchCategoryCanvas:
    document.getElementById(
      'chart-punch-category'
    ),

  chartPunchCumulativeCanvas:
    document.getElementById(
      'chart-punch-cumulative'
    ),

  chartCreatedCompletedWeek:
    document.getElementById(
      'chart-created-completed-week'
    ),

  // Systems Progress table
  systemsTable:
    document.getElementById(
      'tbl-systems-progress'
    ),

  // Aggregation controls
  aggPillGroups:
    document.querySelectorAll(
      '[data-role="agg-pills"]'
    ),

  // Export controls
  btnExport:
    document.getElementById(
      'btn-export'
    ),

  exportRoot:
    document.getElementById(
      'export-root'
    ),

  exportFormat:
    document.getElementById(
      'export-format'
    ),

  // Filters
  openFiltersBtn:
    document.getElementById(
      'btn-open-filters'
    ),

  filterPanel:
    document.getElementById(
      'filter-panel'
    ),

  filterApply:
    document.getElementById(
      'flt-apply'
    ),

  filterReset:
    document.getElementById(
      'flt-reset'
    ),

  filterClose:
    document.getElementById(
      'flt-close'
    )
};

/* -----------------------------------------------------------
   Embedded standalone-report data
----------------------------------------------------------- */

function loadEmbeddedReport(encodedReport) {
  const report =
    decodeReportData(encodedReport);

  const files =
    Array.isArray(report?.files)
      ? report.files
      : [];

  if (!files.length) {
    console.error(
      'Interactive report contains no embedded files.'
    );

    hideReportLoadingState();

    return;
  }

  const stateFiles =
    State.get();

  stateFiles.splice(
    0,
    stateFiles.length,
    ...files
  );

  if (els.jobNameInput) {
    els.jobNameInput.value =
      String(
        report?.jobName ||
        'Interactive Report'
      );

    els.jobNameInput.readOnly = true;
  }

  /*
   * Contractor relationships must exist before filters and
   * report calculations are built.
   */
  rebuildContractorJoin();
  buildAndRenderFilters();

  /*
  * Allow the standalone report layout and chart canvases to
  * finish calculating their dimensions before the first redraw.
  *
  * This prevents doughnut and pie charts from initially rendering
  * labels and legends without their arc graphics.
  */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      recomputeAll();
      hideReportLoadingState();
    });
  });
}

function loadEmbeddedReportFromDocument() {
  const dataElement =
    document.getElementById(
      'embedded-report-data'
    );

  if (!dataElement) {
    console.error(
      'Interactive report data element was not found.'
    );

    hideReportLoadingState();

    return false;
  }

  try {
    const encodedReport =
      JSON.parse(
        dataElement.textContent
      );

    loadEmbeddedReport(
      encodedReport
    );

    return true;
  } catch (error) {
    console.error(
      'Unable to read embedded report data:',
      error
    );

    hideReportLoadingState();

    return false;
  }
}

/*
 * The standalone report displays an overlay while its embedded
 * files are decoded and the charts are initialised.
 */
showReportLoadingState();

/* -----------------------------------------------------------
   Job name persistence
----------------------------------------------------------- */

const JOBNAME_KEY =
  'cg.jobName.v1';

function loadJobName() {
  try {
    return (
      localStorage.getItem(
        JOBNAME_KEY
      ) || ''
    );
  } catch {
    return '';
  }
}

function saveJobName(value) {
  try {
    localStorage.setItem(
      JOBNAME_KEY,
      value
    );
  } catch (error) {
    console.warn(
      'saveJobName failed:',
      error?.name,
      error?.message,
      error
    );
  }
}

/* -----------------------------------------------------------
   Boot the application
----------------------------------------------------------- */

/*
 * The normal dashboard retains job-name persistence.
 * The standalone report receives a read-only embedded job name.
 */
if (
  !IS_REPORT_MODE &&
  els.jobNameInput
) {
  els.jobNameInput.value =
    loadJobName();

  els.jobNameInput.addEventListener(
    'input',
    event => {
      saveJobName(
        event.target.value.trim()
      );
    }
  );
}

/*
 * The uploader, queue and IndexedDB restoration are not used
 * by the standalone interactive report.
 */
if (!IS_REPORT_MODE) {
  initItems({
    listEl: els.fileList,
    countEl: els.fileCount,
    limitEl: els.fileLimit
  });

  initUploader({
    dropzone: els.dropzone,
    fileInput: els.fileInput,
    browse: els.browse
  });

  updateCount(
    els.fileCount,
    State.get().length
  );

  evaluateExportReadiness();
}

/* -----------------------------------------------------------
   Initialise Actual charts
----------------------------------------------------------- */

if (
  els.chartCountCanvas &&
  els.chartCumulativeCanvas
) {
  const initialAggregation = (() => {
    for (
      const group of
      els.aggPillGroups
    ) {
      const activeButton =
        group.querySelector(
          'button.bg-slate-900, button.text-white'
        );

      if (
        activeButton?.dataset?.agg
      ) {
        return activeButton.dataset.agg;
      }
    }

    return 'week';
  })();

  initActualCharts({
    countEl:
      els.chartCountCanvas,

    cumulativeEl:
      els.chartCumulativeCanvas,

    defaultAgg:
      initialAggregation
  });

  setActiveAggregationOnAllPills(
    initialAggregation
  );
}

/* -----------------------------------------------------------
   Initialise Filters
----------------------------------------------------------- */

initFiltersUI({
  panelEl:
    els.filterPanel,

  openBtn:
    els.openFiltersBtn,

  closeBtn:
    els.filterClose,

  applyBtn:
    els.filterApply,

  resetBtn:
    els.filterReset
});

/* -----------------------------------------------------------
   Initialise Export in the normal application only
----------------------------------------------------------- */

if (!IS_REPORT_MODE) {
  initExport({
    buttonEl:
      els.btnExport,

    formatEl:
      els.exportFormat,

    targetEl:
      els.exportRoot,

    filenameBase: () =>
      els.jobNameInput
        ?.value
        ?.trim() ||
      loadJobName() ||
      'Dashboard'
  });
}

/*
 * Build initial filter markup.
 *
 * In report mode this initially produces an empty structure.
 * It is rebuilt after the embedded files are loaded.
 */
buildAndRenderFilters();

/* -----------------------------------------------------------
   Initialise remaining charts and table
----------------------------------------------------------- */

if (els.chartStatusCanvas) {
  initStatusChart({
    el: els.chartStatusCanvas
  });
}

if (els.chartDisciplineCanvas) {
  initDisciplineChart({
    el: els.chartDisciplineCanvas
  });
}

if (els.chartRespIdCanvas) {
  initRespIdChart({
    el: els.chartRespIdCanvas
  });
}

if (els.chartPhaseCompletionCanvas) {
  initPhaseCompletionChart({
    el:
      els.chartPhaseCompletionCanvas
  });
}

if (els.chartPunchCategoryCanvas) {
  initPunchCategoryChart({
    el:
      els.chartPunchCategoryCanvas
  });
}

if (els.chartPunchCumulativeCanvas) {
  initPunchCumulativeChart({
    el:
      els.chartPunchCumulativeCanvas
  });
}

if (els.systemsTable) {
  initSystemsProgressTable({
    el: els.systemsTable
  });
}

if (els.chartCreatedCompletedWeek) {
  initCreatedCompletedWeeklyChart({
    el:
      els.chartCreatedCompletedWeek
  });
}

/* -----------------------------------------------------------
   Filter events
----------------------------------------------------------- */

els.filterApply?.addEventListener(
  'click',
  () => {
    rebuildContractorJoin();
    recomputeAll();
  }
);

els.filterReset?.addEventListener(
  'click',
  () => {
    rebuildContractorJoin();
    recomputeAll();
  }
);

/* -----------------------------------------------------------
   Initial calculation or embedded-report loading
----------------------------------------------------------- */

if (!IS_REPORT_MODE) {
  recomputeAll();
} else {
  loadEmbeddedReportFromDocument();
}

/* -----------------------------------------------------------
   Keep the normal application in sync with queue changes
----------------------------------------------------------- */

const debouncedRecompute =
  debounce(
    recomputeAll,
    150
  );

if (
  !IS_REPORT_MODE &&
  els.fileList
) {
  const observer =
    new MutationObserver(() => {
      debouncedRecompute();
      buildAndRenderFilters();
    });

  observer.observe(
    els.fileList,
    {
      childList: true,
      subtree: true
    }
  );

  /*
   * File-type changes.
   */
  els.fileList.addEventListener(
    'change',
    event => {
      if (
        event.target &&
        event.target.closest(
          'select[data-role="file-type"]'
        )
      ) {
        debouncedRecompute();
        buildAndRenderFilters();
      }
    }
  );

  /*
   * File removal.
   */
  els.fileList.addEventListener(
    'click',
    event => {
      if (
        event.target &&
        event.target.closest(
          'button[data-action="remove"]'
        )
      ) {
        setTimeout(
          debouncedRecompute,
          0
        );

        buildAndRenderFilters();
      }
    }
  );
}

/* -----------------------------------------------------------
   Aggregation pills
----------------------------------------------------------- */

function setActiveAggregationOnAllPills(
  aggregation
) {
  els.aggPillGroups.forEach(
    group => {
      group
        .querySelectorAll(
          'button[data-agg]'
        )
        .forEach(button => {
          const isActive =
            button.dataset.agg ===
            aggregation;

          button.classList.toggle(
            'bg-slate-900',
            isActive
          );

          button.classList.toggle(
            'text-white',
            isActive
          );

          button.classList.toggle(
            'text-slate-700',
            !isActive
          );
        });
    }
  );
}

els.aggPillGroups.forEach(
  group => {
    group.addEventListener(
      'click',
      event => {
        const button =
          event.target.closest(
            'button[data-agg]'
          );

        if (!button) return;

        const aggregation =
          button.dataset.agg;

        if (!aggregation) return;

        setActiveAggregationOnAllPills(
          aggregation
        );

        setActualChartsAggregation(
          aggregation
        );
      }
    );
  }
);