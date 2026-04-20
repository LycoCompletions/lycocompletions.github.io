// /modules/metrics.js
import { State } from './state.js';
import { filterChecklistsRows } from './filters.js';

/**
 * Recompute the KPI cards at the top of the dashboard.
 * Uses the SAME filtered dataset as the charts/tables (UTC+8 semantics).
 */
export function recomputeChecklistSummary(now = new Date()) {
  // 1) Load the validated files
  const files = State.get();
  const clFile = files.find(f => f.type === 'checklists' && f.validation?.ok);
  const coFile = files.find(f => f.type === 'contractors' && f.validation?.ok);

  // raw rows (first sheet) + contractors (for RespID/ContractNo filtering)
  const contractorsRows = coFile?.sheets?.[0]?.data ?? [];
  let rows = clFile?.sheets?.[0]?.data ?? [];

  // 2) Apply panel filters (same as charts/systems)
  rows = filterChecklistsRows(rows, contractorsRows);

  // 3) Exclude "Not Applicable"
  rows = rows.filter(r => !isNotApplicable(r.status));

  // 4) Convert completion dates to UTC ms (UTC+8 interpretation)
  const completedMs = [];
  for (const r of rows) {
    const ms = toUtcMsFromUtc8(
      r['actual_utc8'] ??
      r['Actual (UTC +8)'] ??
      r['Actual (UTC+8)'] ??
      r['actual date'] ??
      r['actual']
    );
    if (ms != null) completedMs.push(ms);
  }

  // 5) Aggregates
  const totalScope     = rows.length;
  const totalCompleted = completedMs.length;
  const outstanding    = Math.max(0, totalScope - totalCompleted);
  const completionPct  = totalScope ? ((totalCompleted / totalScope) * 100) : 0;

  // 6) Completed this week & last week (UTC+8 week windows)
  const { startThisUTC, endThisUTC } = computeWeekWindowsUtc8(now);
  const completedThisWeek = completedMs.filter(ms => (ms >= startThisUTC && ms <= endThisUTC)).length;

  const MILLIS_7D    = 7 * 24 * 3600 * 1000;
  const startPrevUTC = startThisUTC - MILLIS_7D;
  const endPrevUTC   = endThisUTC   - MILLIS_7D;

  const completedLastWeek = completedMs.filter(ms => (ms >= startPrevUTC && ms <= endPrevUTC)).length;
  const deltaVsLast       = completedThisWeek - completedLastWeek;

  // 7) "Total Completed" — add “Last week” subline (cumulative as of last week end)
  const totalCompletedLastWeek = completedMs.filter(ms => ms <= endPrevUTC).length;
  const deltaTotalVsLast       = totalCompleted - totalCompletedLastWeek;

  // 8) Push to DOM (data-metric keys match index.html)
  setMetricText('totalScope.value', fmtInt(totalScope));

  // Card 2: Complete this week
  setMetricText('completeVsLast.value', fmtInt(completedThisWeek));
  setMetricText(
    'completeVsLast.sub',
    `Last week: ${fmtInt(completedLastWeek)} (${signed(deltaVsLast)})`,
    { unhide: true }
  );

  // Card 3: Outstanding (no subline requested yet)
  setMetricText('outstandingVsLast.value', fmtInt(outstanding));

  // Card 4: Completion %
  setMetricText('completionPct.value', `${completionPct.toFixed(1)}%`);

  // Card 5: Total Completed + subline restored
  setMetricText('completedOverall.value', fmtInt(totalCompleted));
  setMetricText(
    'completedOverall.sub',
    `Last week: ${fmtInt(totalCompletedLastWeek)} (${signed(deltaTotalVsLast)})`,
    { unhide: true }
  );
}

/* ----------------------- DOM helpers ----------------------- */

function setMetricText(key, value, { unhide = false } = {}) {
  const el = document.querySelector(`[data-metric="${cssEscape(key)}"]`);
  if (!el) return;
  el.textContent = String(value);
  if (unhide) el.classList.remove('hidden');
}

function cssEscape(s) {
  try { return CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }
  catch { return String(s); }
}

/* ----------------------- shared helpers -------------------- */

function isNotApplicable(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'not applicable' || s === 'n/a' || s === 'na';
}

function fmtInt(n) {
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

function signed(n) {
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtInt(n)}`;
}

/**
 * Convert "Actual (UTC +8)"-style values to UTC epoch ms.
 * Accepts Date or string; strings without TZ are interpreted as UTC+8 wall time.
 */
function toUtcMsFromUtc8(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value)) return value.getTime();

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    // Already has TZ info (Z or +hh:mm)
    if (/Z|[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d) ? null : d.getTime();
    }

    // YYYY-MM-DD HH:mm[:ss] or YYYY/MM/DD HH:mm[:ss]
    let m = s.match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Y, Mo, Da, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }

    // MM/DD/YYYY HH:mm[:ss]
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Mo, Da, Y, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }

    // Last resort
    const d = new Date(s);
    return isNaN(d) ? null : d.getTime();
  }

  return null;
}

/* -------------- Week windows (UTC+8-aligned) --------------- */
/**
 * Returns start/end of the *current* week window in UTC (interpreting wall-time as UTC+8).
 * Matches the week logic used by the charts (Saturday end).
 */
function computeWeekWindowsUtc8(now = new Date()) {
  const now8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const day = now8.getUTCDay(); // 0=Sun..6=Sat
  const daysToSat = (6 - day + 7) % 7;

  // End of this week in UTC+8 wall time
  const end8 = new Date(Date.UTC(
    now8.getUTCFullYear(),
    now8.getUTCMonth(),
    now8.getUTCDate(),
    23, 59, 59, 999
  ));
  end8.setUTCDate(end8.getUTCDate() + daysToSat);

  // Start is 6 days prior (inclusive)
  const start8 = new Date(Date.UTC(
    end8.getUTCFullYear(),
    end8.getUTCMonth(),
    end8.getUTCDate() - 6,
    0, 0, 0, 0
  ));

  const toUtc = (d) => d.getTime() - 8 * 3600 * 1000;
  return {
    startThisUTC: toUtc(start8),
    endThisUTC:   toUtc(end8)
  };
}