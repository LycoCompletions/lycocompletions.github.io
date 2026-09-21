// /modules/systems.js
import { State } from './state.js';
import { filterChecklistsRows } from './filters.js';
import { detectChecklistDateContext, getActualTimestamp } from './checklistdates.js';

/** Public API */
let systemsTableEl = null;

export function initSystemsProgressTable({ el }) {
  systemsTableEl = el;
  recomputeSystemsProgressTable();
}

export function recomputeSystemsProgressTable() {
  if (!systemsTableEl) return;

  // Load validated files from State.
  const files = State.get();

  const systemsFile = files.find(
    file =>
      file.type === 'systems' &&
      file.validation?.ok
  );

  const checklistsFile = files.find(
    file =>
      file.type === 'checklists' &&
      file.validation?.ok
  );

  const contractorsFile = files.find(
    file =>
      file.type === 'contractors' &&
      file.validation?.ok
  );

  const systemsRows =
    systemsFile?.sheets?.[0]?.data ?? [];

  const checklistSheet =
    checklistsFile?.sheets?.[0];

  const contractorsRows =
    contractorsFile?.sheets?.[0]?.data ?? [];

  let checklistRows =
    checklistSheet?.data ?? [];

  checklistRows = filterChecklistsRows(
    checklistRows,
    contractorsRows
  );

  // Detect the dynamic Actual column and its UTC offset.
  const dateContext = checklistSheet
    ? detectChecklistDateContext(checklistSheet)
    : null;

  const hasValidActualContext =
    dateContext?.actualColumn &&
    Number.isFinite(dateContext.actualOffsetMinutes);

  if (
    checklistSheet &&
    checklistRows.length &&
    !hasValidActualContext
  ) {
    console.warn(
      'Unable to detect the checklist Actual column or UTC offset for the Systems Progress table.',
      dateContext
    );
  }

  // Build the Systems master index.
  const sysIndex = new Map();

  for (const row of systemsRows) {
    const systemId = normStr(
      getByKeyLike(row, SYS_KEYS)
    );

    if (!systemId) continue;

    const description = normStr(
      getByKeyLike(row, DESC_KEYS)
    );

    sysIndex.set(systemId, {
      System: systemId,
      Description: description
    });
  }

  // Aggregate checklist progress by System.
  //
  // Completion is determined by whether the dynamically detected
  // Actual field contains a valid timestamp.
  const agg = new Map();

  for (const row of checklistRows) {
    if (isNotApplicable(row.status)) continue;

    const systemId = normStr(
      getByKeyLike(row, SYS_KEYS)
    );

    if (!systemId) continue;

    const actualMs = hasValidActualContext
      ? getActualTimestamp(row, dateContext)
      : null;

    const isComplete =
      Number.isFinite(actualMs);

    const phaseRaw =
      normalizePhase(row);

    const phase =
      canonicalizePhase(phaseRaw);

    if (!agg.has(systemId)) {
      agg.set(systemId, {
        total: 0,
        complete: 0,
        lastActualMs: null,
        byPhase: {
          Construction: {
            total: 0,
            complete: 0
          },
          'Pre Commissioning': {
            total: 0,
            complete: 0
          },
          Commissioning: {
            total: 0,
            complete: 0
          }
        }
      });
    }

    const node = agg.get(systemId);

    // Overall scope.
    node.total += 1;

    if (isComplete) {
      node.complete += 1;

      if (
        node.lastActualMs == null ||
        actualMs > node.lastActualMs
      ) {
        node.lastActualMs = actualMs;
      }
    }

    // Phase scope.
    if (phase && node.byPhase[phase]) {
      node.byPhase[phase].total += 1;

      if (isComplete) {
        node.byPhase[phase].complete += 1;
      }
    }
  }

  // Build output rows.
  const rowsOut = [];

  // Include all Systems master records, even where there is
  // currently no checklist scope.
  for (const [systemId, metadata] of sysIndex.entries()) {
    const node = agg.get(systemId) ?? {
      total: 0,
      complete: 0,
      lastActualMs: null,
      byPhase: {
        Construction: {
          total: 0,
          complete: 0
        },
        'Pre Commissioning': {
          total: 0,
          complete: 0
        },
        Commissioning: {
          total: 0,
          complete: 0
        }
      }
    };

    rowsOut.push(
      makeRow(
        systemId,
        metadata.Description,
        node
      )
    );
  }

  // Include systems that exist in Checklists but not in the
  // Systems master file.
  for (const [systemId, node] of agg.entries()) {
    if (sysIndex.has(systemId)) continue;

    rowsOut.push(
      makeRow(systemId, '', node)
    );
  }

  // Sort Systems ascending.
  rowsOut.sort((a, b) =>
    a.System.localeCompare(
      b.System,
      undefined,
      { sensitivity: 'base' }
    )
  );

  // Hide rows with no supported phase data.
  const rowsFiltered = rowsOut.filter(row =>
    (row.ConTotal ?? 0) > 0 ||
    (row.PreComTotal ?? 0) > 0 ||
    (row.ComTotal ?? 0) > 0
  );

  // Show a phase column when at least one checklist exists
  // for that phase, including phases with zero completion.
  const show = {
    Con: rowsFiltered.some(
      row => (row.ConTotal ?? 0) > 0
    ),
    PreCom: rowsFiltered.some(
      row => (row.PreComTotal ?? 0) > 0
    ),
    Com: rowsFiltered.some(
      row => (row.ComTotal ?? 0) > 0
    )
  };

  systemsTableEl.innerHTML =
    renderTable(rowsFiltered, show);
}

/* ------------------------- row builder ------------------------- */

function makeRow(systemId, description, node) {
  const total    = node.total || 0;
  const complete = node.complete || 0;

  const conT  = node.byPhase?.Construction?.total ?? 0;
  const conC  = node.byPhase?.Construction?.complete ?? 0;

  const preT  = node.byPhase?.['Pre Commissioning']?.total ?? 0;
  const preC  = node.byPhase?.['Pre Commissioning']?.complete ?? 0;

  const comT  = node.byPhase?.Commissioning?.total ?? 0;
  const comC  = node.byPhase?.Commissioning?.complete ?? 0;

  return {
    System: systemId,
    Description: description || '',

    // Phase cells as progress bars (blank when count==0 or phaseTotal==0)
    ConHTML:    phaseBar(conC, conT),
    PreComHTML: phaseBar(preC, preT),
    ComHTML:    phaseBar(comC, comT),

    //Total to decide if has data
    ConTotal: conT,
    PreComTotal: preT,
    ComTotal: comT,


    // numeric values for column-visibility and row-filter
    ConComplete:    conC,
    PreComComplete: preC,
    ComComplete:    comC,

    // overall completion (stacked)
    Percent:      pctNum(complete, total),
    OverallLabel: formatOverallCell(complete, total) // "completed / total (XY%)"
  };
}

/* --------------------------- render ---------------------------- */

function renderTable(rows, show = { Con: true, PreCom: true, Com: true }) {
  const thead = `
    <thead class="bg-slate-50 sticky top-0 z-10 text-xs text-slate-600">
      <tr>
        <th class="px-3 py-2 text-left font-medium whitespace-nowrap">System</th>
        <th class="px-3 py-2 text-left font-medium whitespace-normal">Description</th>
        ${show.Con    ? '<th class="px-3 py-2 text-center font-medium">Con</th>'      : ''}
        ${show.PreCom ? '<th class="px-3 py-2 text-center font-medium">Pre-Com</th>'  : ''}
        ${show.Com    ? '<th class="px-3 py-2 text-center font-medium">Com</th>'      : ''}
        <th class="px-3 py-2 text-left font-medium">% Complete</th>
      </tr>
    </thead>`;

  const tbody = rows.map(r => `
    <tr class="border-t border-slate-100 text-sm text-slate-800">
      <td class="px-3 py-2 border-b border-e border-t border-slate-200 whitespace-nowrap">${esc(r.System)}</td>
      <td class="px-3 py-2 border border-slate-200 whitespace-normal">${esc(r.Description)}</td>
      ${show.Con    ? `<td class="px-3 py-2 text-center align-middle border border-slate-200">${r.ConHTML}</td>`       : ''}
      ${show.PreCom ? `<td class="px-3 py-2 text-center align-middle border border-slate-200">${r.PreComHTML}</td>`    : ''}
      ${show.Com    ? `<td class="px-3 py-2 text-center align-middle border border-slate-200">${r.ComHTML}</td>`       : ''}
      <td class="px-3 py-2 border-s border-b border-t Once border-slate-200">
        ${progressBar(r.Percent, r.OverallLabel)}
      </td>
    </tr>
  `).join('');

  return `
    <table class="min-w-full whitespace-nowrap align-middle">
      ${thead}
      <tbody>${tbody || noRows()}</tbody>
    </table>
  `;
}

/* ------------------------ bar components ----------------------- */

// Overall (stacked) progress bar — left-aligned, label inside (emerald)
// Overall (stacked) progress bar — left-aligned cell, label inside,
// same red→green hue mapping as phase bars (uniform styling)
// 0..100 clamp
function clampPct(n) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, v));
}

// Overall (% Complete) bar — left-aligned, red→green fill, label inside
function progressBar(percentNum, labelText = '') {
  const pct = clampPct(percentNum);
  const hue = Math.round(120 * (pct / 100));              // red→green
  const fill = `hsl(${hue} 85% 45%)`;
  const textClass = pct >= 45 ? 'text-white' : 'text-slate-700';

  return `
    <div class="flex items-center justify-start">
      <div
        class="relative h-5 w-28 sm:w-40 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${pct.toFixed(1)}" title="${esc(labelText)}"
      >
        <div class="absolute left-0 top-0 h-full" style="width:${pct}%; background:${fill};"></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-[10px] leading-none tabular-nums font-medium ${textClass}">
            ${esc(labelText)}
          </span>
        </div>
      </div>
    </div>
  `;
}

// Phase bar — centered in its cell, same geometry & label styling as progressBar
function phaseBar(completed, phaseTotal) {
  if (!phaseTotal || phaseTotal === 0) return '';
  const pct = clampPct(pctNum(completed, phaseTotal));
  const hue = Math.round(120 * (pct / 100));
  const fill = `hsl(${hue} 85% 45%)`;
  const textClass = pct >= 45 ? 'text-white' : 'text-slate-700';
  const label = `${fmtInt(completed)} / ${fmtInt(phaseTotal)} (${pct.toFixed(1)}%)`;

  return `
    <div class="flex items-center justify-center">
      <div
        class="relative h-5 w-28 sm:w-40 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${pct.toFixed(1)}" title="${esc(label)}"
      >
        <div class="absolute left-0 top-0 h-full" style="width:${pct}%; background:${fill};"></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-[10px] leading-none tabular-nums font-medium ${textClass}">
            ${esc(label)}
          </span>
        </div>
      </div>
    </div>
  `;
}

/* --------------------------- misc UI --------------------------- */

function noRows() {
  return `
    <tr>
      <td colspan="6" class="px-3 py-8 text-center text-slate-500 text-sm">
        No Systems/Checklists data found.
      </td>
    </tr>
  `;
}

/* ----------------------- helpers & keys ------------------------ */

const SYS_KEYS    = ['system', 'system no', 'system number', 'system code', 'system id'];
const DESC_KEYS   = ['description', 'system description', 'name', 'title'];
const PHASE_KEYS  = ['event description', 'event_description', 'event desc', 'activity', 'phase'];

// Overall cell: "completed / total (XY%)"
function formatOverallCell(completed, total) {
  return `${fmtInt(completed)} / ${fmtInt(total)} (${pctOf(completed, total)})`;
}

function getByKeyLike(obj, candidates) {
  if (!obj) return undefined;
  const lowerMap = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const k = lowerMap.get(String(c).toLowerCase());
    if (k != null) return obj[k];
  }
  return undefined;
}

function normalizePhase(row) {
  // best-effort pull of a phase-like column
  const raw = getByKeyLike(row, PHASE_KEYS);
  return raw == null ? '' : String(raw).trim();
}

// Canonicalize to the 3 buckets we show in the table
function canonicalizePhase(val) {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();

  // normalize for comparisons
  const squashed = s.replace(/[-\s]/g, '');

  // explicit tokens first (your actual data)
  if (s.includes('(cc)') || s.includes('construction')) return 'Construction';
  if (s.includes('(mc)') || squashed.includes('precommissioning')) return 'Pre Commissioning';
  if (s.includes('(com)') || (s.includes('commissioning') && !s.includes('pre-commission'))) return 'Commissioning';

  return '';
}

function normStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function fmtInt(n) {
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

function pctNum(num, den) {
  if (!den) return 0;
  const p = (num / den) * 100;
  return Number.isFinite(p) ? p : 0;
}

function pctOf(num, den) {
  const p = pctNum(num, den);
  return `${p.toFixed(1)}%`;
}

/** Same “Not Applicable” filter used elsewhere */
function isNotApplicable(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'not applicable' || s === 'n/a' || s === 'na';
}