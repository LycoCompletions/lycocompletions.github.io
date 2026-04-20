// /modules/charts.js
import { State } from './state.js';
import { filterChecklistsRows, filterPunchRows } from './filters.js';

/* ============================================================
 * Centralized palette (single source of truth for colors)
 * ============================================================ */
const PALETTE = {
  lineGreen: {
    border: '#72bf44',
    fill: 'rgba(114,191,68,0.15)' // subtle translucent area fill
  },
  // Keeping existing categorical colors inline for clarity; promote here later if needed:
  status: {
    completed: { bg: 'rgba(34, 197, 94, 0.18)', border: '#22c55e' }, // emerald
    outstanding: { bg: 'rgba(239, 68, 68, 0.18)', border: '#ef4444' }, // rose
    toBeSigned: { bg: 'rgba(14, 165, 233, 0.18)', border: '#0ea5e9' }, // sky
    started: { bg: 'rgba(245, 158, 11, 0.18)', border: '#f59e0b' }  // amber
  },
  punchStatus: {
    Outstanding: { bg: 'rgba(239, 68, 68, 0.18)', border: '#ef4444' }, // rose
    Verified: { bg: 'rgba(14, 165, 233, 0.18)', border: '#0ea5e9' }, // sky
    Cleared: { bg: 'rgba(34, 197, 94, 0.18)', border: '#22c55e' }  // emerald
  },
  bars: {
    completeBg: 'rgba(34, 197, 94, 0.18)',
    completeEdge: '#22c55e',
    incompleteBg: 'rgba(100, 116, 139, 0.18)',
    incompleteEdge: '#64748b'
  },
  grid: 'rgba(15, 23, 42, 0.06)'
};

/* ============================================================
 * Public API (chart instances)
 * ============================================================ */
let actualCountChart = null;
let actualCumChart = null;
let currentAgg = 'week'; // 'day' | 'week' | 'month'

let statusChart = null;
let disciplineChart = null;
let respIdChart = null;
let phaseCompletionChart = null;
let punchCategoryChart = null;
let punchCumulativeChart = null;
let createdCompletedWeeklyChart = null;

// charts.js (top-level)
if (typeof Chart !== 'undefined' && typeof Chart.register === 'function' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

/* ============================================================
 * Initializers
 * ============================================================ */
export function initActualCharts({ countEl, cumulativeEl, defaultAgg = 'week' } = {}) {

  currentAgg = defaultAgg;

  const displayEveryFewPoints = (ctx) => {
    const n = ctx.chart?.data?.labels?.length ?? 0;
    if (!n) return false;
    const step = Math.max(1, Math.round(n / 8)); // ~8 labels across
    return (ctx.dataIndex % step === 0) || (ctx.dataIndex === n - 1);
  };

  // Shared style
  const labelStyle = {
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    borderRadius: 6,
    padding: { top: 3, right: 6, bottom: 3, left: 6 },
    anchor: 'end',
    align: 'top',
    offset: 6,
    clamp: true,
    clip: false,
    display: displayEveryFewPoints
  };

  // Count labels: show integer value
  const countLineDataLabels = {
    ...labelStyle,
    formatter: (value) => {
      const y =
        (typeof value === 'number') ? value :
          (value && typeof value === 'object' && typeof value.y === 'number') ? value.y :
            NaN;

      return Number.isFinite(y) ? fmtInt(y) : '';
    }
  };

  // Cumulative labels: show percent
  const cumulativeLineDataLabels = {
    ...labelStyle,
    formatter: (value, ctx) => {
      const y =
        (typeof value === 'number') ? value :
          (value && typeof value === 'object' && typeof value.y === 'number') ? value.y :
            NaN;

      if (!Number.isFinite(y)) return '';

      // AUTO: if your cumulative data is 0..1, convert to 0..100
      // otherwise assume it's already 0..100
      const ds = ctx?.dataset?.data ?? [];
      const lastRaw = ds.length ? ds[ds.length - 1] : null;
      const last =
        (typeof lastRaw === 'number') ? lastRaw :
          (lastRaw && typeof lastRaw === 'object' && typeof lastRaw.y === 'number') ? lastRaw.y :
            NaN;

      const looksLikeFraction = Number.isFinite(last) && last <= 1.5;
      const pct = looksLikeFraction ? (y * 100) : y;

      return `${pct.toFixed(1)}%`;
    }
  };

  actualCountChart = new Chart(countEl, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: makeLineOptions({ datalabels: countLineDataLabels })
  });

  actualCumChart = new Chart(cumulativeEl, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: makeLineOptions({ datalabels: cumulativeLineDataLabels })
  });

  recomputeActualCharts();
}

export function initStatusChart({ el }) {


  const statusDoughnutDataLabels = {
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    borderRadius: 6,
    padding: { top: 3, right: 6, bottom: 3, left: 6 },

    anchor: 'center',
    align: 'center',
    offset: 0,
    clamp: true,
    clip: false,

    display: (ctx) => {
      const data = ctx.dataset.data || [];
      const raw = data[ctx.dataIndex];
      const val = Number(raw) || 0;
      if (val <= 0) return false;

      const total = data.reduce((a, b) => a + (Number(b) || 0), 0);
      if (!total) return false;

      const pct = (val / total) * 100;
      return pct >= 3; // <-- tweak threshold (e.g. 2, 3, 5)
    },


    formatter: (value, ctx) => {
      const val = Number(value) || 0;
      const data = ctx.dataset.data || [];
      const total = data.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
      const pct = (val / total) * 100;

      // hide tiny slices
      if (pct < 3) return '';

      return `${pct.toFixed(1)}%`;
    }
  };

  statusChart = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Outstanding', 'To Be Signed', 'Started'],
      datasets: [
        {
          label: 'Status',
          data: [0, 0, 0, 0],
          backgroundColor: [
            PALETTE.status.completed.bg,
            PALETTE.status.outstanding.bg,
            PALETTE.status.toBeSigned.bg,
            PALETTE.status.started.bg
          ],
          borderColor: [
            PALETTE.status.completed.border,
            PALETTE.status.outstanding.border,
            PALETTE.status.toBeSigned.border,
            PALETTE.status.started.border
          ],
          borderWidth: 1.5,
          hoverOffset: 6
        }
      ]
    },
    options: makeDoughnutOptions({ datalabels: statusDoughnutDataLabels })
  });

  recomputeStatusChart();
}

export function initDisciplineChart({ el }) {

  disciplineChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: [], // filled on compute
      datasets: [
        {
          label: 'Complete',
          data: [],
          backgroundColor: PALETTE.bars.completeBg,
          borderColor: PALETTE.bars.completeEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 32,
          stack: 's'
        },
        {
          label: 'Incomplete',
          data: [],
          backgroundColor: PALETTE.bars.incompleteBg,
          borderColor: PALETTE.bars.incompleteEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 32,
          stack: 's'
        }
      ]
    },
    options: makeStackedBarOptions()
  });

  recomputeDisciplineChart();
}

export function initRespIdChart({ el }) {

  respIdChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: [], // filled in recompute
      datasets: [
        {
          label: 'Complete',
          data: [],
          backgroundColor: PALETTE.bars.completeBg,
          borderColor: PALETTE.bars.completeEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 28,
          stack: 's'
        },
        {
          label: 'Incomplete',
          data: [],
          backgroundColor: PALETTE.bars.incompleteBg,
          borderColor: PALETTE.bars.incompleteEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 28,
          stack: 's'
        }
      ]
    },
    options: makeStackedHorizontalOptions()
  });

  recomputeRespIdChart();
}

export function initPhaseCompletionChart({ el }) {

  phaseCompletionChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: [], // Event Description values
      datasets: [
        {
          label: 'Complete',
          data: [],
          backgroundColor: PALETTE.bars.completeBg,
          borderColor: PALETTE.bars.completeEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          stack: 'pct',
          maxBarThickness: 28
        },
        {
          label: 'Incomplete',
          data: [],
          backgroundColor: PALETTE.bars.incompleteBg,
          borderColor: PALETTE.bars.incompleteEdge,
          borderWidth: 1.5,
          borderRadius: 4,
          stack: 'pct',
          maxBarThickness: 28
        }
      ]
    },
    options: makeStackedHorizontalPercentOptions()
  });

  recomputePhaseCompletionChart();
}

export function initPunchCategoryChart({ el }) {

  punchCategoryChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: [],   // categories
      datasets: []  // filled at recompute time
    },
    options: makeStackedVerticalOptions()
  });

  recomputePunchCategoryChart();
}

// Punch items cumulative verified line
export function initPunchCumulativeChart({ el } = {}) {

  const displayEveryFewPoints = (ctx) => {
    const n = ctx.chart?.data?.labels?.length ?? 0;
    if (!n) return false;
    const step = Math.max(1, Math.round(n / 8)); // ~8 labels across
    return (ctx.dataIndex % step === 0) || (ctx.dataIndex === n - 1);
  };

    // Shared style
  const labelStyle = {
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    borderRadius: 6,
    padding: { top: 3, right: 6, bottom: 3, left: 6 },
    anchor: 'end',
    align: 'top',
    offset: 6,
    clamp: true,
    clip: false,
    display: displayEveryFewPoints
  };

  const punchCumCountLabels = {
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    borderRadius: 6,
    padding: { top: 3, right: 6, bottom: 3, left: 6 },
    anchor: 'end',
    align: 'top',
    offset: 6,
    clamp: true,
    clip: false,

    display: (ctx) => {
      const n = ctx.chart?.data?.labels?.length ?? 0;
      if (!n) return false;
      const step = Math.max(1, Math.round(n / 8));
      return (ctx.dataIndex % step === 0) || (ctx.dataIndex === n - 1);
    },

    formatter: (value) => {
      const y =
        (typeof value === 'number') ? value :
        (value && typeof value === 'object' && typeof value.y === 'number') ? value.y :
        NaN;

      return Number.isFinite(y) ? fmtInt(y) : '';
    }
  };

  punchCumulativeChart = new Chart(el, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: makeLineOptions({ datalabels: punchCumCountLabels})
  });

  recomputePunchCumulativeChart(new Date(), currentAgg);
}

export function initCreatedCompletedWeeklyChart({ el }) {


  const opts = makeStackedVerticalOptions();

  // Disable global datalabels plugin for this chart only
  opts.plugins = opts.plugins || {};
  opts.plugins.datalabels = false;
  

  createdCompletedWeeklyChart = new Chart(el, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: opts
  });

  recomputeCreatedCompletedWeeklyChart();
}

/* ============================================================
 * Controls & Recomputes
 * ============================================================ */
export function setActualChartsAggregation(bucket /* 'day' | 'week' | 'month' */) {
  if (!bucket || bucket === currentAgg) return;
  currentAgg = bucket;
  recomputeActualCharts();
  recomputePunchCumulativeChart(new Date(), currentAgg);
}

export function recomputeActualCharts(now = new Date()) {
  if (!actualCountChart || !actualCumChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterChecklistsRows(rows, contractorsRows);

  if (!rows.length) {
    setChartData(actualCountChart, [], []);
    setChartData(actualCumChart, [], []);
    return;
  }

  const series = buildActualSeries(rows, { now, bucket: currentAgg }); // { labels, buckets, cumulative }

  setChartData(
    actualCountChart,
    series.labels,
    [makeDataset('Actual Count', series.buckets, PALETTE.lineGreen.border, PALETTE.lineGreen.fill)]
  );

  // Total scope = filtered rows excluding NA
  const scope = rows.filter(r => !isNotApplicable(r.status)).length;

  // Convert cumulative count -> cumulative %
  const cumulativePct = series.cumulative.map(v => scope ? (v / scope) * 100 : 0);

  setChartData(
    actualCumChart,
    series.labels,
    [makeDataset('Cumulative % Complete', cumulativePct, PALETTE.lineGreen.border, PALETTE.lineGreen.fill)]
  );

  // Make the cumulative chart axis + tooltip percent-friendly (without affecting other charts)
  actualCumChart.options.scales.y.max = 100;
  actualCumChart.options.scales.y.ticks.callback = (v) => `${v}%`;
  actualCumChart.options.plugins.tooltip.callbacks.label = (item) =>
    `${item.dataset.label}: ${(item.parsed.y ?? 0).toFixed(1)}%`;

  actualCumChart.update('none');
}

export function recomputeStatusChart() {
  if (!statusChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterChecklistsRows(rows, contractorsRows);


  const labels = ['Completed', 'Outstanding', 'To Be Signed', 'Started'];
  const zero = [0, 0, 0, 0];

  if (!rows.length) {
    statusChart.data.labels = labels;
    statusChart.data.datasets[0].data = zero;
    statusChart.update('none');
    return;
  }

  const counts = { Completed: 0, Outstanding: 0, 'To Be Signed': 0, Started: 0 };

  for (const r of rows) {
    if (isNotApplicable(r.status)) continue;
    const norm = normalizeStatus(r.status);
    if (norm && counts[norm] != null) counts[norm] += 1;
  }

  statusChart.data.labels = labels;
  statusChart.data.datasets[0].data = labels.map(k => counts[k] ?? 0);
  statusChart.update('none');
}

export function recomputeDisciplineChart() {
  if (!disciplineChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterChecklistsRows(rows, contractorsRows);

  if (!rows.length) {
    setDisciplineChart([], [], []);
    return;
  }

  const map = new Map(); // key: discipline => { complete, incomplete }

  for (const r of rows) {
    if (isNotApplicable(r.status)) continue;

    const disc = normalizeDiscipline(r) || 'Unknown';
    const hasActual = hasActualValue(r.actual_utc8);

    if (!map.has(disc)) map.set(disc, { complete: 0, incomplete: 0 });
    const agg = map.get(disc);
    if (hasActual) agg.complete += 1; else agg.incomplete += 1;
  }

  const entries = Array.from(map.entries()).filter(([, v]) => (v.complete + v.incomplete) > 0);
  entries.sort((a, b) => (b[1].complete + b[1].incomplete) - (a[1].complete + a[1].incomplete));

  const labels = entries.map(([k]) => k);
  const complete = entries.map(([, v]) => v.complete);
  const incomplete = entries.map(([, v]) => v.incomplete);

  setDisciplineChart(labels, complete, incomplete);
}

export function recomputeRespIdChart() {
  if (!respIdChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterChecklistsRows(rows, contractorsRows);

  if (!rows.length) {
    setRespIdChart([], [], []);
    return;
  }

  const map = new Map(); // key: respid => { complete, incomplete }

  for (const r of rows) {
    if (isNotApplicable(r.status)) continue;

    const resp = normalizeRespId(r) || 'Unassigned';
    const hasActual = hasActualValue(r.actual_utc8);

    if (!map.has(resp)) map.set(resp, { complete: 0, incomplete: 0 });
    const bucket = map.get(resp);
    if (hasActual) bucket.complete += 1; else bucket.incomplete += 1;
  }

  const entries = Array.from(map.entries()).filter(([, v]) => (v.complete + v.incomplete) > 0);
  entries.sort((a, b) => (b[1].complete + b[1].incomplete) - (a[1].complete + a[1].incomplete));

  const labels = entries.map(([k]) => k);
  const complete = entries.map(([, v]) => v.complete);
  const incomplete = entries.map(([, v]) => v.incomplete);

  setRespIdChart(labels, complete, incomplete);
}

export function recomputePhaseCompletionChart() {
  if (!phaseCompletionChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterChecklistsRows(rows, contractorsRows);

  if (!rows.length) {
    setPhaseCompletionChart([], [], []);
    return;
  }

  const map = new Map(); // key: phase => { complete, incomplete }

  for (const r of rows) {
    if (isNotApplicable(r.status)) continue;

    const phase = canonicalizePhase(normalizePhase(r) || 'Unspecified');
    const isComplete = hasActualValue(r.actual_utc8);

    if (!map.has(phase)) map.set(phase, { complete: 0, incomplete: 0 });
    const agg = map.get(phase);
    if (isComplete) agg.complete += 1; else agg.incomplete += 1;
  }

  const all = Array.from(map.entries()).filter(([, v]) => (v.complete + v.incomplete) > 0);

  const ORDER = ['Construction', 'Pre Commissioning', 'Commissioning'];
  const seen = new Set();
  const orderedEntries = [];

  for (const key of ORDER) {
    const hit = all.find(([k]) => k === key);
    if (hit) { orderedEntries.push(hit); seen.add(key); }
  }

  for (const [k, v] of all
    .filter(([k]) => !seen.has(k))
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))) {
    orderedEntries.push([k, v]);
  }

  const labels = orderedEntries.map(([k]) => k);

  const completePct = [];
  const incompletePct = [];

  for (const [, v] of orderedEntries) {
    const total = v.complete + v.incomplete;
    const c = total ? (v.complete / total) * 100 : 0;
    const i = 100 - c;
    completePct.push(+c.toFixed(1));
    incompletePct.push(+i.toFixed(1));
  }

  setPhaseCompletionChart(labels, completePct, incompletePct);
}

export function recomputePunchCategoryChart() {
  if (!punchCategoryChart) return;

  // Find the validated Punch Items file
  const file = State.get().find(f => f.type === 'punch' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterPunchRows(rows);


  if (!rows.length) {
    setPunchCategoryChart([], []);
    return;
  }

  // status palette & fixed order
  const STATUS_ORDER = ['Outstanding', 'Verified', 'Cleared'];

  // Aggregate: category => { Outstanding:n, Verified:n, Cleared:n }
  const map = new Map();

  for (const r of rows) {
    const cat = normalizePunchCategory(r) || 'Uncategorized';
    const status = normalizePunchStatus(r.status);

    // Ignore "Cancelled" (do not count it at all)
    if (status === 'Cancelled' || status === '') continue;

    if (!map.has(cat)) map.set(cat, { Outstanding: 0, Verified: 0, Cleared: 0 });
    const agg = map.get(cat);
    if (agg[status] == null) agg[status] = 0;
    agg[status] += 1;
  }

  // Build entries and drop zero-total categories (if any)
  const entries = Array.from(map.entries())
    .map(([k, v]) => ({
      k,
      v,
      total: (v.Outstanding || 0) + (v.Verified || 0) + (v.Cleared || 0)
    }))
    .filter(e => e.total > 0)
    // ⬇️ Alphabetical A→Z (case-insensitive)
    .sort((a, b) => a.k.localeCompare(b.k, undefined, { sensitivity: 'base' }));

  const labels = entries.map(e => e.k);

  // Build datasets in fixed status order, aligned to the alphabetical labels
  const datasets = STATUS_ORDER.map(st => ({
    label: st,
    data: entries.map(e => e.v[st] ?? 0),
    backgroundColor: PALETTE.punchStatus[st].bg,
    borderColor: PALETTE.punchStatus[st].border,
    borderWidth: 1.5,
    borderRadius: 4,
    maxBarThickness: 32,
    stack: 's'
  }));

  setPunchCategoryChart(labels, datasets);
}

export function recomputePunchCumulativeChart(now = new Date(), bucket = currentAgg) {
  if (!punchCumulativeChart) return;

  const file = State.get().find(f => f.type === 'punch' && f.validation && f.validation.ok);
  //const rows = file?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];
  rows = filterPunchRows(rows);

  if (!rows.length) {
    setChartData(punchCumulativeChart, [], []);
    return;
  }

  const verifiedMs = [];
  for (const r of rows) {
    const status = normalizePunchStatus(r.status);
    if (status !== 'Verified') continue; // only verified
    const ms = getVerifiedDateMs(r);
    if (ms != null) verifiedMs.push(ms);
  }

  if (verifiedMs.length === 0) {
    setChartData(punchCumulativeChart, [], []);
    return;
  }

  verifiedMs.sort((a, b) => a - b);

  const series = buildSeriesFromTimestamps(verifiedMs, { now, bucket, cumulative: true });
  // { labels, counts }

  setChartData(
    punchCumulativeChart,
    series.labels,
    [
      // now matches the Actuals line coloration (green)
      makeDataset('Verified (cumulative)', series.counts, PALETTE.lineGreen.border, PALETTE.lineGreen.fill)
    ]
  );
}

export function recomputeCreatedCompletedWeeklyChart(now = new Date()) {
  if (!createdCompletedWeeklyChart) return;

  const file = State.get().find(f => f.type === 'checklists' && f.validation?.ok);
  const contractorsRows = State.get().find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  let rows = file?.sheets?.[0]?.data ?? [];

  // Apply filters (same pattern as your existing checklist charts)
  rows = filterChecklistsRows(rows, contractorsRows);

  // Exclude NA items (same pattern used elsewhere)
  rows = rows.filter(r => !isNotApplicable(r.status));

  if (!rows.length) {
    createdCompletedWeeklyChart.data.labels = [];
    createdCompletedWeeklyChart.data.datasets = [];
    createdCompletedWeeklyChart.update('none');
    return;
  }

  // Collect created and actual timestamps
  const createdMs = [];
  const actualMs = [];

  // Also precompute "created this week and still outstanding at week end"
  // We'll bucket that as weekly counts later.
  const rowPairs = []; // { cMs, aMs|null }

  for (const r of rows) {
    const cMs = toUtcMsFromUtc8(r.created_utc8 ?? getCaseInsensitive(r, 'Created (UTC +8)'));
    if (cMs == null) continue; // if not created yet, it doesn't exist in cumulative total

    const aMs = toUtcMsFromUtc8(r.actual_utc8 ?? getCaseInsensitive(r, 'Actual (UTC +8)'));
    createdMs.push(cMs);
    if (aMs != null) actualMs.push(aMs);

    rowPairs.push({ cMs, aMs: (aMs != null ? aMs : null) });
  }

  if (!createdMs.length) {
    createdCompletedWeeklyChart.data.labels = [];
    createdCompletedWeeklyChart.data.datasets = [];
    createdCompletedWeeklyChart.update('none');
    return;
  }

  // Build week-ending range using existing UTC+8 Saturday logic
  const minCreated = Math.min(...createdMs);
  const { endThisUTC } = computePeriodEndUTC(now, 'week');
  const firstEndUTC = weekEndUTC(minCreated);
  let weekEnds = enumeratePeriods(firstEndUTC, endThisUTC, 'week');
  
  const MAX_POINTS = 25;
  if (weekEnds.length > MAX_POINTS) {
    weekEnds = weekEnds.slice(-MAX_POINTS);
  }


  // Cumulative created-to-date and completed-to-date (as-of each week end)
  const createdCum = cumulativeCountsOnWeekEnds(createdMs, weekEnds);
  const completeCum = cumulativeCountsOnWeekEnds(actualMs, weekEnds);

  // Weekly "new outstanding" = created in this week AND not complete by week end
  const newOutstandingWeekly = new Array(weekEnds.length).fill(0);

  // Precompute quick mapping from weekEndUTC -> index
  const weekIndex = new Map(weekEnds.map((we, i) => [we, i]));

  for (const { cMs, aMs } of rowPairs) {
    const we = weekEndUTC(cMs);           // which week it was created in
    const i = weekIndex.get(we);
    if (i == null) continue;

    const endWe = weekEnds[i];
    const isOutstandingAtWeekEnd = (aMs == null) || (aMs > endWe);
    if (isOutstandingAtWeekEnd) newOutstandingWeekly[i] += 1;
  }

  // Outstanding total as-of week end = createdCum - completeCum
  const outstandingTotal = createdCum.map((c, i) => Math.max(0, c - (completeCum[i] ?? 0)));

  // Outstanding existing (grey) = outstandingTotal - newOutstandingWeekly (orange)
  const outstandingExisting = outstandingTotal.map((o, i) => Math.max(0, o - (newOutstandingWeekly[i] ?? 0)));

  // X labels (week ending Saturday)
  const labels = weekEnds.map(we => labelForBucket(we, 'week'));

  // Build stacked datasets (mutually exclusive stacks that sum to createdCum)
  createdCompletedWeeklyChart.data.labels = labels;
  createdCompletedWeeklyChart.data.datasets = [
    {
      label: 'Complete (cumulative)',
      data: completeCum,
      backgroundColor: 'rgba(34, 197, 94, 0.18)', // green
      borderColor: '#22c55e',
      borderWidth: 1.5,
      borderRadius: 4,
      maxBarThickness: 32,
      stack: 's'
    },
    {
      label: 'Outstanding (existing)',
      data: outstandingExisting,
      backgroundColor: 'rgba(148, 163, 184, 0.35)', // grey
      borderColor: '#94a3b8',
      borderWidth: 1.5,
      borderRadius: 4,
      maxBarThickness: 32,
      stack: 's'
    },
    {
      label: 'New checklists',
      data: newOutstandingWeekly,
      backgroundColor: 'rgba(245, 158, 11, 0.28)', // orange
      borderColor: '#f59e0b',
      borderWidth: 1.5,
      borderRadius: 4,
      maxBarThickness: 32,
      stack: 's'
    }
  ];

  // Tooltip: show Created cumulative (bar total), Outstanding total, and Completed cumulative
  createdCompletedWeeklyChart.options.plugins.tooltip.callbacks.afterBody = (items) => {
    if (!items?.length) return '';
    const idx = items[0].dataIndex;

    const createdTotal = createdCum[idx] ?? 0;
    const completed = completeCum[idx] ?? 0;
    const outstanding = outstandingTotal[idx] ?? 0;
    const newOut = newOutstandingWeekly[idx] ?? 0;

    return [
      `Total Scope: ${fmtInt(createdTotal)}`,
      `Outstanding (total): ${fmtInt(outstanding)}`,
      `New (this week): ${fmtInt(newOut)}`,
      `Completed (cumulative): ${fmtInt(completed)}`
    ].join('\n');
  };

  createdCompletedWeeklyChart.update('none');
}
/* ============================================================
 * Per-chart setters
 * ============================================================ */
function setPunchCategoryChart(labels, datasets) {
  punchCategoryChart.data.labels = labels;
  punchCategoryChart.data.datasets = datasets;
  punchCategoryChart.update('none');
}

function setPhaseCompletionChart(labels, completePct, incompletePct) {
  phaseCompletionChart.data.labels = labels;
  phaseCompletionChart.data.datasets[0].data = completePct;
  phaseCompletionChart.data.datasets[1].data = incompletePct;
  phaseCompletionChart.update('none');
}

function setRespIdChart(labels, completeArr, incompleteArr) {
  respIdChart.data.labels = labels;
  respIdChart.data.datasets[0].data = completeArr;
  respIdChart.data.datasets[1].data = incompleteArr;
  respIdChart.update('none');
}

function setDisciplineChart(labels, completeArr, incompleteArr) {
  disciplineChart.data.labels = labels;
  disciplineChart.data.datasets[0].data = completeArr;
  disciplineChart.data.datasets[1].data = incompleteArr;
  disciplineChart.update('none');
}

/* ============================================================
 * Shared options
 * ============================================================ */
const numberFmt = new Intl.NumberFormat('en-AU');

export function makeLineOptions({ datalabels = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      datalabels,
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items?.[0]?.label ?? '',
          label: (item) => `${item.dataset.label}: ${fmtInt(item.parsed.y)}`
        }
      }
    },
    elements: {
      line: { tension: 0.25, borderWidth: 2 },
      point: { radius: 2, hoverRadius: 4, hitRadius: 8, borderWidth: 0 }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, minRotation: 0, autoSkip: true }
      },
      y: {
        beginAtZero: true,
        grid: { color: PALETTE.grid },
        ticks: { callback: (v) => fmtInt(v) }
      }
    }
  };
}

function makeDoughnutOptions({ datalabels = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '40%',
    plugins: {
      datalabels,
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' }
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed;
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
            const pct = ((val / total) * 100).toFixed(1);
            return `${ctx.label}: ${val.toLocaleString()} (${pct}%)`;
          }
        }
      }
    }
  };
}

function makeStackedBarOptions() {
  // ---- helpers in closure (no `this`) ----
  const isSingleSegmentAtIndex = (chart, dataIndex) => {
    const datasets = chart.data?.datasets || [];
    const values = datasets.map(ds => Number(ds.data?.[dataIndex] ?? 0) || 0);
    return values.filter(v => v > 0).length === 1;
  };

  const isThisTheOnlyNonZeroSegment = (ctx) => {
    const idx = ctx.dataIndex;
    const v = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (v <= 0) return false;

    const datasets = ctx.chart.data?.datasets || [];
    const othersSum = datasets.reduce((sum, ds, di) => {
      if (di === ctx.datasetIndex) return sum;
      return sum + (Number(ds.data?.[idx] ?? 0) || 0);
    }, 0);

    return othersSum <= 0;
  };

  const getBarElement = (ctx) => {
    const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
    return meta?.data?.[ctx.dataIndex];
  };

  const segmentFitsLabel = (ctx, text, fontSize = 11, padX = 12, padY = 6) => {
    const el = getBarElement(ctx);
    if (!el) return false;

    const chart = ctx.chart;
    const c = chart.ctx;

    // Determine segment geometry
    const isHorizontal = !!el.horizontal;
    const segLen = isHorizontal ? Math.abs(el.x - el.base) : Math.abs(el.base - el.y);
    const crossLen = isHorizontal ? (el.height ?? 0) : (el.width ?? 0);

    // Measure text width
    c.save();
    const family = (Chart?.defaults?.font?.family) || 'sans-serif';
    c.font = `600 ${fontSize}px ${family}`;
    const textWidth = c.measureText(text).width;
    c.restore();

    const neededW = textWidth + padX;
    const neededH = fontSize + padY;

    // For vertical bars: segLen is height, crossLen is width
    if (isHorizontal) return segLen >= neededW && crossLen >= neededH;
    return segLen >= neededH && crossLen >= neededW;
  };

  // Decide placement per segment: 'inside' | 'above' | 'none'
  const placementFor = (ctx) => {
    const idx = ctx.dataIndex;
    const val = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (val <= 0) return 'none';

    const text = fmtInt(val);

    // 1) Prefer inside if it fits
    if (segmentFitsLabel(ctx, text, 11, 12, 6)) return 'inside';

    // 2) If it doesn't fit, allow "above" ONLY when the entire bar is a single segment
    const single = isSingleSegmentAtIndex(ctx.chart, idx) && isThisTheOnlyNonZeroSegment(ctx);
    if (single) return 'above';

    // 3) Otherwise hide
    return 'none';
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      datalabels: {
        // styling
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.60)',
        borderRadius: 6,
        padding: { top: 3, right: 6, bottom: 3, left: 6 },
        font: { size: 11, weight: '600' },

        clamp: true,
        clip: false,

        // visibility (do NOT rely on formatter returning '')
        display: (ctx) => placementFor(ctx) !== 'none', // scriptable display is supported 

        // position: inside vs above
        anchor: (ctx) => (placementFor(ctx) === 'above' ? 'end' : 'center'),
        align: (ctx) => (placementFor(ctx) === 'above' ? 'top' : 'center'),
        offset: (ctx) => (placementFor(ctx) === 'above' ? 6 : 0),

        // text output only
        formatter: (value) => {
          const v = Number(value ?? 0) || 0;
          return v > 0 ? fmtInt(v) : '';
        } // formatter is for data->text transformation 
      },

      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' }
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            if (!items?.length) return '';
            const chart = items[0].chart;
            const idx = items[0].dataIndex;
            const total = (chart.data.datasets || []).reduce((sum, ds) => {
              const v = Number(ds.data?.[idx] ?? 0);
              return sum + (Number.isFinite(v) ? v : 0);
            }, 0);
            return `Total: ${fmtInt(total)}`;
          },
          label: (ctx) => `${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, stacked: true, ticks: { font:{size: 10}, autoSkip: false, maxRotation: 60, minRotation: 0 } },
      y: { beginAtZero: true, stacked: true, grid: { color: PALETTE.grid }, ticks: { callback: (v) => fmtInt(v) } }
    }
  };
}

function makeStackedHorizontalOptions() {
  // --- helpers in closure (no `this`) ---

  const isSingleSegmentAtIndex = (chart, dataIndex) => {
    const datasets = chart.data?.datasets || [];
    const values = datasets.map(ds => Number(ds.data?.[dataIndex] ?? 0) || 0);
    return values.filter(v => v > 0).length === 1;
  };

  const isThisTheOnlyNonZeroSegment = (ctx) => {
    const idx = ctx.dataIndex;
    const v = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (v <= 0) return false;

    const datasets = ctx.chart.data?.datasets || [];
    const othersSum = datasets.reduce((sum, ds, di) => {
      if (di === ctx.datasetIndex) return sum;
      return sum + (Number(ds.data?.[idx] ?? 0) || 0);
    }, 0);

    return othersSum <= 0;
  };

  const getBarElement = (ctx) => {
    const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
    return meta?.data?.[ctx.dataIndex];
  };

  const segmentFitsLabel = (ctx, text, fontSize = 11, padX = 12, padY = 6) => {
    const el = getBarElement(ctx);
    if (!el) return false;

    const chart = ctx.chart;
    const c = chart.ctx;

    // For horizontal bars, BarElement.horizontal is true in Chart.js v3/v4
    const isHorizontal = !!el.horizontal;

    // Segment length along value axis
    const segLen = isHorizontal ? Math.abs(el.x - el.base) : Math.abs(el.base - el.y);

    // Bar thickness across value axis
    const crossLen = isHorizontal ? (el.height ?? 0) : (el.width ?? 0);

    // Measure text width with a consistent font
    c.save();
    const family = (Chart?.defaults?.font?.family) || 'sans-serif';
    c.font = `600 ${fontSize}px ${family}`;
    const textWidth = c.measureText(text).width;
    c.restore();

    const neededW = textWidth + padX;
    const neededH = fontSize + padY;

    // For horizontal bars:
    // segLen is width, crossLen is height
    if (isHorizontal) return segLen >= neededW && crossLen >= neededH;

    // For vertical bars (not expected here, but safe)
    return segLen >= neededH && crossLen >= neededW;
  };

  // Decide placement per segment: 'inside' | 'outsideEnd' | 'none'
  const placementFor = (ctx) => {
    const idx = ctx.dataIndex;
    const val = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (val <= 0) return 'none';

    const text = fmtInt(val);

    // 1) Prefer inside if it fits
    if (segmentFitsLabel(ctx, text, 11, 12, 6)) return 'inside';

    // 2) If it doesn't fit, allow outside-end ONLY when the entire bar is a single segment
    const single = isSingleSegmentAtIndex(ctx.chart, idx) && isThisTheOnlyNonZeroSegment(ctx);
    if (single) return 'outsideEnd';

    // 3) Otherwise hide
    return 'none';
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',

    plugins: {
      // Plugin options belong under options.plugins.{pluginId} in Chart.js 
      datalabels: {
        // --- pill styling ---
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.60)',
        borderRadius: 6,
        padding: { top: 3, right: 6, bottom: 3, left: 6 },
        font: { size: 11, weight: '600' },

        clamp: true,
        clip: false,

        // display is scriptable, so we can show/hide per segment 
        display: (ctx) => placementFor(ctx) !== 'none',

        // Position rules:
        // - inside: centered
        // - outsideEnd: just to the right of the bar end
        // anchor/align/offset are also described in datalabels positioning 
        anchor: (ctx) => (placementFor(ctx) === 'outsideEnd' ? 'end' : 'center'),
        align: (ctx) => (placementFor(ctx) === 'outsideEnd' ? 'right' : 'center'),
        offset: (ctx) => (placementFor(ctx) === 'outsideEnd' ? 6 : 0),

        formatter: (value) => {
          const v = Number(value ?? 0) || 0;
          return v > 0 ? fmtInt(v) : '';
        }
      },

      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' }
      },

      title: { display: false },

      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmtInt(ctx.parsed.x)}`,
          afterBody: (items) => {
            if (!items?.length) return '';
            const chart = items[0].chart;
            const idx = items[0].dataIndex;

            // Total across ALL stacked datasets (safer than assuming exactly 2)
            const total = (chart.data.datasets || []).reduce((sum, ds) => {
              const v = Number(ds.data?.[idx] ?? 0);
              return sum + (Number.isFinite(v) ? v : 0);
            }, 0);

            return `Total: ${fmtInt(total)}`;
          }
        }
      }
    },

    scales: {
      x: {
        beginAtZero: true,
        stacked: true,
        grid: { color: PALETTE.grid },
        ticks: { callback: (v) => fmtInt(v) }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { autoSkip: false, maxRotation: 0, minRotation: 0 }
      }
    }
  };
}

function makeStackedHorizontalPercentOptions() {
  // ----- helpers (closure, no `this`) -----

  const isSingleSegmentAtIndex = (chart, dataIndex) => {
    const datasets = chart.data?.datasets || [];
    const values = datasets.map(ds => Number(ds.data?.[dataIndex] ?? 0) || 0);
    return values.filter(v => v > 0).length === 1;
  };

  const isThisTheOnlyNonZeroSegment = (ctx) => {
    const idx = ctx.dataIndex;
    const v = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (v <= 0) return false;

    const datasets = ctx.chart.data?.datasets || [];
    const othersSum = datasets.reduce((sum, ds, di) => {
      if (di === ctx.datasetIndex) return sum;
      return sum + (Number(ds.data?.[idx] ?? 0) || 0);
    }, 0);

    return othersSum <= 0;
  };

  const getBarElement = (ctx) => {
    const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
    return meta?.data?.[ctx.dataIndex];
  };

  const segmentFitsLabel = (ctx, text, fontSize = 11, padX = 12, padY = 6) => {
    const el = getBarElement(ctx);
    if (!el) return false;

    const chart = ctx.chart;
    const c = chart.ctx;

    // For horizontal bars:
    // segment length = width along x (value axis)
    // cross length   = bar thickness (height)
    const segLen = Math.abs(el.x - el.base);
    const crossLen = el.height ?? 0;

    // Measure text width
    c.save();
    const family = (Chart?.defaults?.font?.family) || 'sans-serif';
    c.font = `600 ${fontSize}px ${family}`;
    const textWidth = c.measureText(text).width;
    c.restore();

    const neededW = textWidth + padX;
    const neededH = fontSize + padY;

    return segLen >= neededW && crossLen >= neededH;
  };

  // Decide per segment: 'inside' | 'outsideEnd' | 'none'
  const placementFor = (ctx) => {
    const idx = ctx.dataIndex;
    const val = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (val <= 0) return 'none';

    const text = `${val.toFixed(1)}%`;

    // 1) prefer inside if it fits
    if (segmentFitsLabel(ctx, text, 11, 12, 6)) return 'inside';

    // 2) allow outside only if the whole bar is a single non-zero segment
    const single = isSingleSegmentAtIndex(ctx.chart, idx) && isThisTheOnlyNonZeroSegment(ctx);
    if (single) return 'outsideEnd';

    // 3) otherwise hide
    return 'none';
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',

    plugins: {
      // datalabels config must live under options.plugins.datalabels
      datalabels: (() => {
        const getBarElement = (ctx) => {
          const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
          return meta?.data?.[ctx.dataIndex];
        };

        const segmentFitsLabel = (ctx, text, fontSize = 11, padX = 12, padY = 6) => {
          const el = getBarElement(ctx);
          if (!el) return false;

          // Horizontal bars: width is along x, height is bar thickness
          const segLen = Math.abs(el.x - el.base);
          const crossLen = el.height ?? 0;

          const c = ctx.chart.ctx;
          c.save();
          const family = (Chart?.defaults?.font?.family) || 'sans-serif';
          c.font = `600 ${fontSize}px ${family}`;
          const textWidth = c.measureText(text).width;
          c.restore();

          const neededW = textWidth + padX;
          const neededH = fontSize + padY;

          return segLen >= neededW && crossLen >= neededH;
        };

        return {
          color: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.60)',
          borderRadius: 6,
          padding: { top: 3, right: 6, bottom: 3, left: 6 },
          font: { size: 11, weight: '600' },

          anchor: 'center',
          align: 'center',
          offset: 0,
          clamp: true,
          clip: false,

          // Show only if it fits AND value is meaningful.
          // `display` is scriptable per label. 
          display: (ctx) => {
            const v = Number(ctx.dataset.data?.[ctx.dataIndex] ?? 0) || 0;
            if (v <= 0) return false;

            // Optional: hide tiny slivers to reduce clutter (tune threshold)
            if (v < 4) return false; // 4% threshold (change/remove if you want)

            const text = `${v.toFixed(1)}%`;
            return segmentFitsLabel(ctx, text, 11, 12, 6);
          },

          // Formatter only returns text (visibility handled in display).
          formatter: (value) => {
            const v = Number(value ?? 0) || 0;
            return v > 0 ? `${v.toFixed(1)}%` : '';
          }
        };
      })(),

      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' }
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = ctx.parsed.x ?? 0;
            return `${ctx.dataset.label}: ${pct.toFixed(1)}%`;
          },
          footer: () => ''
        }
      }
    },

    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        stacked: true,
        grid: { color: PALETTE.grid },
        ticks: { callback: (v) => `${v}%` }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
      }
    }
  };
}


function makeStackedVerticalOptions() {
  // ---- helpers (closure; no `this`) ----

  const isSingleSegmentAtIndex = (chart, dataIndex) => {
    const datasets = chart.data?.datasets || [];
    const values = datasets.map(ds => Number(ds.data?.[dataIndex] ?? 0) || 0);
    return values.filter(v => v > 0).length === 1;
  };

  const isThisTheOnlyNonZeroSegment = (ctx) => {
    const idx = ctx.dataIndex;
    const v = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (v <= 0) return false;

    const datasets = ctx.chart.data?.datasets || [];
    const othersSum = datasets.reduce((sum, ds, di) => {
      if (di === ctx.datasetIndex) return sum;
      return sum + (Number(ds.data?.[idx] ?? 0) || 0);
    }, 0);

    return othersSum <= 0;
  };

  const getBarElement = (ctx) => {
    const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
    return meta?.data?.[ctx.dataIndex];
  };

  // For vertical bars:
  // segLen = segment height (value axis)
  // crossLen = bar width (thickness)
  const segmentFitsLabel = (ctx, text, fontSize = 11, padX = 12, padY = 6) => {
    const el = getBarElement(ctx);
    if (!el) return false;

    const segLen = Math.abs(el.base - el.y);
    const crossLen = el.width ?? 0;

    // Measure text width against canvas font
    const c = ctx.chart.ctx;
    c.save();
    const family = (Chart?.defaults?.font?.family) || 'sans-serif';
    c.font = `600 ${fontSize}px ${family}`;
    const textWidth = c.measureText(text).width;
    c.restore();

    const neededW = textWidth + padX;
    const neededH = fontSize + padY;

    return segLen >= neededH && crossLen >= neededW;
  };

  // Decide placement per segment: 'inside' | 'above' | 'none'
  const placementFor = (ctx) => {
    const idx = ctx.dataIndex;
    const val = Number(ctx.dataset.data?.[idx] ?? 0) || 0;
    if (val <= 0) return 'none';

    const text = fmtInt(val);

    // 1) Prefer inside if it fits
    if (segmentFitsLabel(ctx, text, 11, 12, 6)) return 'inside';

    // 2) If it doesn't fit, allow "above" ONLY when the whole bar is a single segment
    const single = isSingleSegmentAtIndex(ctx.chart, idx) && isThisTheOnlyNonZeroSegment(ctx);
    if (single) return 'above';

    // 3) Otherwise hide
    return 'none';
  };

  return {
    responsive: true,
    maintainAspectRatio: false,

    plugins: {
      // Plugin options must be under options.plugins.{pluginId} [1](https://stackoverflow.com/questions/71793359/cannot-find-module-chartjs-helpers-while-using-chartjs-plugins-datalabels-reac)[2](https://www.reddit.com/r/charts/comments/17knds4/chartjs_upgrading_version_and_datalabels_plugin/)
      datalabels: {
        // pill styling
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.60)',
        borderRadius: 6,
        padding: { top: 3, right: 6, bottom: 3, left: 6 },
        font: { size: 11, weight: '600' },

        clamp: true,
        clip: false,

        // show/hide per segment (scriptable display) 
        display: (ctx) => placementFor(ctx) !== 'none',

        // placement: inside vs above
        anchor: (ctx) => (placementFor(ctx) === 'above' ? 'end' : 'center'),
        align:  (ctx) => (placementFor(ctx) === 'above' ? 'top' : 'center'),
        offset: (ctx) => (placementFor(ctx) === 'above' ? 6 : 0),

        // formatter should only output text; visibility is handled by display [3](https://ia600909.us.archive.org/24/items/ccarm_002417/ccarm_002417_access.pdf)
        formatter: (value) => {
          const v = Number(value ?? 0) || 0;
          return v > 0 ? fmtInt(v) : '';
        }
      },

      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' }
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)}`
        }
      }
    },

    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
      },
      y: {
        beginAtZero: true,
        stacked: true,
        grid: { color: PALETTE.grid },
        ticks: { callback: (v) => fmtInt(v) }
      }
    }
  };
}

/* ============================================================
 * Helpers
 * ============================================================ */
function cumulativeCountsOnWeekEnds(msList, weekEnds) {
  const sorted = (msList ?? []).slice().sort((a, b) => a - b);
  const out = [];
  let idx = 0;
  let acc = 0;

  for (const we of weekEnds) {
    while (idx < sorted.length && sorted[idx] <= we) {
      acc++;
      idx++;
    }
    out.push(acc);
  }
  return out;
}

function normalizePunchCategory(row) {
  const cands = ['category', 'punch category', 'cat', 'category name', 'punch items category'];
  for (const c of cands) {
    const v = getCaseInsensitive(row, c);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function normalizePunchStatus(v) {
  if (v == null) return 'Outstanding';
  const s = String(v).trim().toLowerCase();

  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'outstanding' || s === 'open') return 'Outstanding';
  if (s === 'verified' || s === 'verification complete' || s === 'verified by qa') return 'Verified';
  if (s === 'cleared' || s === 'closed' || s === 'complete' || s === 'completed' || s === 'resolved') return 'Cleared';

  return 'Outstanding';
}

// Map raw checklist status → one of the four labels used by the Status chart
function normalizeStatus(v) {
  if (v == null) return '';
  const s = String(v).trim().toLowerCase();

  if (s === 'completed' || s === 'complete') return 'Completed';
  if (s === 'outstanding') return 'Outstanding';
  if (s === 'to be signed' || s === 'to-be-signed' || s === 'tobesigned') return 'To Be Signed';
  if (s === 'started' || s === 'in progress' || s === 'in-progress') return 'Started';

  return '';
}

function normalizePhase(row) {
  const cands = ['event description', 'event_description', 'event desc', 'activity', 'phase'];
  for (const c of cands) {
    const val = getCaseInsensitive(row, c);
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

function normalizeRespId(row) {
  const cands = ['resp id', 'respid', 'resp_id', 'responsible', 'responsible id'];
  for (const c of cands) {
    const val = getCaseInsensitive(row, c);
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

function hasActualValue(v) {
  if (v == null) return false;
  if (v instanceof Date && !isNaN(v)) return true;
  const s = String(v).trim();
  if (!s) return false;
  const ms = toUtcMsFromUtc8(s);
  return ms != null;
}

function canonicalizePhase(phaseRaw) {
  if (!phaseRaw) return '';
  const s = String(phaseRaw).trim().toLowerCase();
  const has = (frag) => s.includes(frag);

  if (has('construct')) return 'Construction';

  const squashed = s.replace(/[-\s]/g, '');
  if ((has('pre') || has('pre-')) && squashed.includes('commission')) {
    return 'Pre Commissioning';
  }

  if (s.includes('commission')) return 'Commissioning';
  return String(phaseRaw).trim();
}

function getCaseInsensitive(obj, keyLike) {
  if (!obj) return undefined;
  const lower = String(keyLike).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

function normalizeDiscipline(row) {
  const cands = ['cert_disc', 'cert disc', 'discipline', 'certification discipline', 'disc'];
  let val = '';
  for (const k of cands) {
    const hit = getCaseInsensitive(row, k);
    if (hit != null && String(hit).trim() !== '') { val = String(hit).trim(); break; }
  }
  return val;
}

function makeDataset(label, data, color, fillRGBA) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fillRGBA,
    fill: true,
    cubicInterpolationMode: 'monotone',
    pointStyle: 'circle'
  };
}

function setChartData(chart, labels, datasets) {
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update('none');
}

function fmtInt(n) {
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

function isNotApplicable(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'not applicable' || s === 'n/a' || s === 'na';
}

/* ============================================================
 * Series builder (UTC+8 buckets)
 * ============================================================ */
function buildActualSeries(rows, { now = new Date(), bucket = 'week' } = {}) {
  const actuals = rows
    .map(r => toUtcMsFromUtc8(r.actual_utc8))
    .filter(ms => ms != null)
    .sort((a, b) => a - b);

  if (actuals.length === 0) return { labels: [], buckets: [], cumulative: [] };

  const { endThisUTC } = computePeriodEndUTC(now, bucket);
  const firstEndUTC = keyForBucket(actuals[0], bucket);

  const periodEnds = enumeratePeriods(firstEndUTC, endThisUTC, bucket);

  const counts = new Map(periodEnds.map(t => [t, 0]));
  for (const ms of actuals) {
    const key = keyForBucket(ms, bucket);
    if (!counts.has(key)) counts.set(key, 0);
    counts.set(key, counts.get(key) + 1);
  }

  const labels = periodEnds.map(we => labelForBucket(we, bucket));
  const buckets = periodEnds.map(we => counts.get(we) ?? 0);

  const cumulative = [];
  let run = 0;
  for (const c of buckets) {
    run += c;
    cumulative.push(run);
  }

  return { labels, buckets, cumulative };
}

function keyForBucket(msUTC, bucket) {
  switch (bucket) {
    case 'day': return dayEndUTC(msUTC);
    case 'week': return weekEndUTC(msUTC);
    case 'month': return monthEndUTC(msUTC);
    default: return weekEndUTC(msUTC);
  }
}

function labelForBucket(endUTC, bucket) {
  const d8 = new Date(endUTC + 8 * 3600 * 1000); // UTC+8 wall time
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d8.getUTCMonth()];
  const dd = String(d8.getUTCDate()).padStart(2, '0');
  const yy = d8.getUTCFullYear();

  if (bucket === 'day') return `${dd} ${mon} ${yy}`;
  if (bucket === 'week') return `${dd} ${mon} ${yy}`;
  return `${mon} ${yy}`;
}

function enumeratePeriods(startEndUTC, endEndUTC, bucket) {
  const out = [];
  if (bucket === 'month') {
    let cursor = startEndUTC;
    while (cursor <= endEndUTC) {
      out.push(cursor);
      cursor = addMonthsEndUTC(cursor, 1);
    }
    return out;
  }

  const step = (bucket === 'day') ? 1 : 7;
  for (let t = startEndUTC; t <= endEndUTC; t += step * 86400000) out.push(t);
  return out;
}

function computePeriodEndUTC(now, bucket) {
  if (bucket === 'day') return { endThisUTC: dayEndUTC(now.getTime()) };
  if (bucket === 'week') return computeWeekWindowsUtc8(now);
  if (bucket === 'month') return { endThisUTC: monthEndUTC(now.getTime()) };
  return computeWeekWindowsUtc8(now);
}

/* ---- Bucket end helpers (UTC return, using UTC+8 wall logic) ---- */
function dayEndUTC(msUTC) {
  const d8 = new Date(msUTC + 8 * 3600 * 1000);
  const end8 = new Date(Date.UTC(d8.getUTCFullYear(), d8.getUTCMonth(), d8.getUTCDate(), 23, 59, 59, 999));
  return end8.getTime() - 8 * 3600 * 1000;
}

function weekEndUTC(msUTC) {
  const d8 = new Date(msUTC + 8 * 3600 * 1000);
  const dow = d8.getUTCDay(); // 0=Sun..6=Sat
  const daysToSat = (6 - dow + 7) % 7;
  const end8 = new Date(Date.UTC(d8.getUTCFullYear(), d8.getUTCMonth(), d8.getUTCDate(), 23, 59, 59, 999));
  end8.setUTCDate(end8.getUTCDate() + daysToSat);
  return end8.getTime() - 8 * 3600 * 1000;
}

function monthEndUTC(msUTC) {
  const d8 = new Date(msUTC + 8 * 3600 * 1000);
  const firstNext8 = new Date(Date.UTC(d8.getUTCFullYear(), d8.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  const end8 = new Date(firstNext8.getTime() - 1);
  end8.setUTCHours(23, 59, 59, 999);
  return end8.getTime() - 8 * 3600 * 1000;
}

function addMonthsEndUTC(endUTC, months) {
  const d8 = new Date(endUTC + 8 * 3600 * 1000);
  const y = d8.getUTCFullYear();
  const m = d8.getUTCMonth();

  const firstNext8 = new Date(Date.UTC(y, m + months + 1, 1, 0, 0, 0, 0));
  const end8 = new Date(firstNext8.getTime() - 1);
  end8.setUTCHours(23, 59, 59, 999);
  return end8.getTime() - 8 * 3600 * 1000;
}

/* ============================================================
 * Week windows + parser (kept in sync with /modules/metrics.js)
 * ============================================================ */
function computeWeekWindowsUtc8(now = new Date()) {
  const now8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const day = now8.getUTCDay(); // 0=Sun..6=Sat
  const daysToSat = (6 - day + 7) % 7;

  const end8 = new Date(Date.UTC(now8.getUTCFullYear(), now8.getUTCMonth(), now8.getUTCDate(), 23, 59, 59, 999));
  end8.setUTCDate(end8.getUTCDate() + daysToSat);

  const start8 = new Date(Date.UTC(end8.getUTCFullYear(), end8.getUTCMonth(), end8.getUTCDate() - 6, 0, 0, 0, 0));

  const toUtc = (d) => d.getTime() - 8 * 3600 * 1000;

  return {
    startThisUTC: toUtc(start8),
    endThisUTC: toUtc(end8)
  };
}

/* ============================================================
 * Punch helpers + date parsing
 * ============================================================ */
function getVerifiedDateMs(row) {
  const candidates = [
    'verified date', 'date verified', 'verified_on', 'verified at',
    'verified (utc +8)', 'verified (utc+8)', 'verified (utc +08)', 'verified (utc+08)', 'verified (utc+08:00)',
    'verification date', 'verification_date', 'verified datetime', 'verified_dt',
    'verifieddate', 'dateverified', 'verified'
  ];
  for (const key of candidates) {
    const val = getCaseInsensitive(row, key);
    if (val != null && String(val).trim() !== '') {
      const ms = toUtcMsFromUtc8(val);
      if (ms != null) return ms;
    }
  }

  // heuristic scan
  for (const k of Object.keys(row)) {
    const nk = String(k).toLowerCase().replace(/[\s_()+:\-]/g, '');
    if (!nk.includes('verif')) continue;
    const ms = toUtcMsFromUtc8(row[k]);
    if (ms != null) return ms;
  }

  return null;
}

/**
 * Build a time series from raw timestamps.
 *  - bucket: 'day' | 'week' | 'month'  (default 'week')
 *  - cumulative: if true, return a running sum
 */
function buildSeriesFromTimestamps(msList, { now = new Date(), bucket = 'week', cumulative = true } = {}) {
  if (!Array.isArray(msList) || msList.length === 0) return { labels: [], counts: [] };

  const { endThisUTC } = computePeriodEndUTC(now, bucket);
  const firstEndUTC = keyForBucket(msList[0], bucket);

  const periodEnds = enumeratePeriods(firstEndUTC, endThisUTC, bucket);

  const countsByEnd = new Map(periodEnds.map(t => [t, 0]));
  for (const ms of msList) {
    const key = keyForBucket(ms, bucket);
    if (!countsByEnd.has(key)) countsByEnd.set(key, 0);
    countsByEnd.set(key, countsByEnd.get(key) + 1);
  }

  const labels = periodEnds.map(pe => labelForBucket(pe, bucket));
  const rawCounts = periodEnds.map(pe => countsByEnd.get(pe) ?? 0);

  if (!cumulative) return { labels, counts: rawCounts };

  const running = [];
  let acc = 0;
  for (const c of rawCounts) { acc += c; running.push(acc); }
  return { labels, counts: running };
}

/**
 * Convert "Actual (UTC +8)" cell to UTC epoch ms.
 * Accepts Date or string; strings without TZ are interpreted as UTC+8 wall time.
 */
function toUtcMsFromUtc8(value) {
  if (value == null) return null;

  if (value instanceof Date && !isNaN(value)) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const s = value.trim();

    if (/Z|[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d) ? null : d.getTime();
    }

    let m = s.match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Y, Mo, Da, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }

    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Mo, Da, Y, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }

    const d = new Date(s);
    return isNaN(d) ? null : d.getTime();
  }

  return null;
}