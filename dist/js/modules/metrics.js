// /modules/metrics.js

import { State } from './state.js';
import { filterChecklistsRows } from './filters.js';

import {
  detectChecklistDateContext,
  getActualTimestamp,
  weekEndUtc
} from './checklistdates.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Recompute the KPI cards at the top of the dashboard.
 * Uses the same filtered checklist dataset as the charts and tables.
 * Checklist dates use the UTC offset detected from the source headers.
 */
export function recomputeChecklistSummary(now = new Date()) {
  // Load validated files.
  const files = State.get();

  const checklistFile = files.find(
    file =>
      file.type === 'checklists' &&
      file.validation?.ok
  );

  const contractorsFile = files.find(
    file =>
      file.type === 'contractors' &&
      file.validation?.ok
  );

  const checklistSheet =
    checklistFile?.sheets?.[0];

  const contractorsRows =
    contractorsFile?.sheets?.[0]?.data ?? [];

  let rows =
    checklistSheet?.data ?? [];

  // Apply the current checklist filters.
  rows = filterChecklistsRows(
    rows,
    contractorsRows
  );

  // Exclude Not Applicable items.
  rows = rows.filter(
    row => !isNotApplicable(row.status)
  );

  // If there is no checklist sheet yet, reset the KPI cards.
  if (!checklistSheet) {
    resetChecklistMetrics();
    return;
  }

  // Detect the Actual column and its offset.
  const dateContext =
    detectChecklistDateContext(checklistSheet);

  if (
    !dateContext.actualColumn ||
    !Number.isFinite(dateContext.actualOffsetMinutes)
  ) {
    console.warn(
      'Unable to detect the checklist Actual column or UTC offset for KPI metrics.',
      dateContext
    );

    resetChecklistMetrics();
    return;
  }

  const offsetMinutes =
    dateContext.actualOffsetMinutes;

  // Convert valid completion dates into UTC timestamps.
  const completedMs = [];

  for (const row of rows) {
    const actualMs = getActualTimestamp(
      row,
      dateContext
    );

    if (Number.isFinite(actualMs)) {
      completedMs.push(actualMs);
    }
  }

  // Overall aggregates.
  const totalScope = rows.length;
  const totalCompleted = completedMs.length;

  const outstanding = Math.max(
    0,
    totalScope - totalCompleted
  );

  const completionPct = totalScope
    ? (totalCompleted / totalScope) * 100
    : 0;

  // Current reporting week ends Saturday at 23:59:59.999
  // in the UTC offset detected from the checklist file.
  const endThisUTC = weekEndUtc(
    now.getTime(),
    offsetMinutes
  );

  if (!Number.isFinite(endThisUTC)) {
    console.warn(
      'Unable to calculate the checklist reporting week.',
      dateContext
    );

    resetChecklistMetrics();
    return;
  }

  // Current week begins Sunday at 00:00:00.000.
  const startThisUTC =
    endThisUTC - MS_PER_WEEK + 1;

  // Previous reporting week.
  const startPrevUTC =
    startThisUTC - MS_PER_WEEK;

  const endPrevUTC =
    endThisUTC - MS_PER_WEEK;

  const completedThisWeek = completedMs.filter(
    timestamp =>
      timestamp >= startThisUTC &&
      timestamp <= endThisUTC
  ).length;

  const completedLastWeek = completedMs.filter(
    timestamp =>
      timestamp >= startPrevUTC &&
      timestamp <= endPrevUTC
  ).length;

  const deltaVsLast =
    completedThisWeek - completedLastWeek;

  // Cumulative completed count at the end of last week.
  const totalCompletedLastWeek = completedMs.filter(
    timestamp => timestamp <= endPrevUTC
  ).length;

  const deltaTotalVsLast =
    totalCompleted - totalCompletedLastWeek;

  // Push KPI values to the DOM.
  setMetricText(
    'totalScope.value',
    fmtInt(totalScope)
  );

  setMetricText(
    'completeVsLast.value',
    fmtInt(completedThisWeek)
  );

  setMetricText(
    'completeVsLast.sub',
    `Last week: ${fmtInt(completedLastWeek)} (${signed(deltaVsLast)})`,
    { unhide: true }
  );

  setMetricText(
    'outstandingVsLast.value',
    fmtInt(outstanding)
  );

  setMetricText(
    'completionPct.value',
    `${completionPct.toFixed(1)}%`
  );

  setMetricText(
    'completedOverall.value',
    fmtInt(totalCompleted)
  );

  setMetricText(
    'completedOverall.sub',
    `Last week: ${fmtInt(totalCompletedLastWeek)} (${signed(deltaTotalVsLast)})`,
    { unhide: true }
  );
}

/**
 * Reset KPI cards when there is no usable checklist dataset.
 */
function resetChecklistMetrics() {
  setMetricText(
    'totalScope.value',
    '0'
  );

  setMetricText(
    'completeVsLast.value',
    '0'
  );

  setMetricText(
    'completeVsLast.sub',
    'Last week: 0 (0)',
    { unhide: true }
  );

  setMetricText(
    'outstandingVsLast.value',
    '0'
  );

  setMetricText(
    'completionPct.value',
    '0.0%'
  );

  setMetricText(
    'completedOverall.value',
    '0'
  );

  setMetricText(
    'completedOverall.sub',
    'Last week: 0 (0)',
    { unhide: true }
  );
}

/* ----------------------- DOM helpers ----------------------- */

function setMetricText(
  key,
  value,
  { unhide = false } = {}
) {
  const element = document.querySelector(
    `[data-metric="${cssEscape(key)}"]`
  );

  if (!element) return;

  element.textContent = String(value);

  if (unhide) {
    element.classList.remove('hidden');
  }
}

function cssEscape(value) {
  try {
    return CSS && CSS.escape
      ? CSS.escape(value)
      : String(value).replace(/"/g, '\\"');
  } catch {
    return String(value);
  }
}

/* ----------------------- shared helpers -------------------- */

function isNotApplicable(value) {
  if (value == null) return false;

  const normalized = String(value)
    .trim()
    .toLowerCase();

  return (
    normalized === 'not applicable' ||
    normalized === 'n/a' ||
    normalized === 'na'
  );
}

function fmtInt(value) {
  return Number.isFinite(value)
    ? value.toLocaleString()
    : '0';
}

function signed(value) {
  const sign = value > 0
    ? '+'
    : '';

  return `${sign}${fmtInt(value)}`;
}