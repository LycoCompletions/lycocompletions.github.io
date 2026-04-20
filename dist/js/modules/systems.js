// /modules/systems.js
import { State } from './state.js';
import { filterChecklistsRows } from './filters.js';

/** Public API */
let systemsTableEl = null;

export function initSystemsProgressTable({ el }) {
  systemsTableEl = el;
  recomputeSystemsProgressTable();
}

export function recomputeSystemsProgressTable() {
  if (!systemsTableEl) return;

  // --- 1) Load files from State
  const files = State.get();
  const systemsFile    = files.find(f => f.type === 'systems'    && f.validation && f.validation.ok);
  const checklistsFile = files.find(f => f.type === 'checklists' && f.validation && f.validation.ok);

  const systemsRows    = systemsFile?.sheets?.[0]?.data ?? [];
  //const checklistRows  = checklistsFile?.sheets?.[0]?.data ?? [];

  

    const contractorsRows = State.get().find(f => f.type==='contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
    let checklistRows = checklistsFile?.sheets?.[0]?.data ?? [];
    checklistRows = filterChecklistsRows(checklistRows, contractorsRows);



  // --- 2) Systems master index (key: System)
  const sysIndex = new Map(); // systemId -> { System, Description }
  for (const r of systemsRows) {
    const systemId = normStr(getByKeyLike(r, SYS_KEYS));
    if (!systemId) continue;
    const desc = normStr(getByKeyLike(r, DESC_KEYS));
    sysIndex.set(systemId, { System: systemId, Description: desc });
  }

  // --- 3) Aggregate checklist progress per System
  // Complete = has Actual (UTC +8). Exclude "Not Applicable".
  // PHASE SPLIT: track totals & completes per phase, plus overall.
  const agg = new Map(); // systemId -> { total, complete, lastActualMs, byPhase: { Construction:{total,complete}, 'Pre Commissioning':{..}, Commissioning:{..} } }

  for (const r of checklistRows) {
    if (isNotApplicable(r.status)) continue;

    const systemId = normStr(getByKeyLike(r, SYS_KEYS));
    if (!systemId) continue;

    const actualMs   = toUtcMsFromUtc8(r['actual_utc8'] ?? getByKeyLike(r, ACTUAL_KEYS));
    const isComplete = actualMs != null;

    const phaseRaw = normalizePhase(r);
    const phase    = canonicalizePhase(phaseRaw); // '', 'Construction', 'Pre Commissioning', 'Commissioning'

    if (!agg.has(systemId)) {
      agg.set(systemId, {
        total: 0,
        complete: 0,
        lastActualMs: null,
        byPhase: {
          Construction:        { total: 0, complete: 0 },
          'Pre Commissioning': { total: 0, complete: 0 },
          Commissioning:       { total: 0, complete: 0 }
        }
      });
    }
    const node = agg.get(systemId);

    // Overall scope
    node.total += 1;
    if (isComplete) {
      node.complete += 1;
      if (!node.lastActualMs || actualMs > node.lastActualMs) node.lastActualMs = actualMs;
    }

    // Phase scope (only if we can map it to one of the three)
    if (phase) {
      node.byPhase[phase].total += 1;
      if (isComplete) node.byPhase[phase].complete += 1;
    }
  }

  // --- 4) Build rows (join Systems master with agg; include checklist-only systems as well)
  const rowsOut = [];

  // A) All systems from master (even if no checklist rows yet)
  for (const [systemId, meta] of sysIndex.entries()) {
    const node = agg.get(systemId) ?? {
      total: 0, complete: 0, lastActualMs: null,
      byPhase: {
        Construction: { total: 0, complete: 0 },
        'Pre Commissioning': { total: 0, complete: 0 },
        Commissioning: { total: 0, complete: 0 }
      }
    };
    rowsOut.push(makeRow(systemId, meta.Description, node));
  }

  // B) Systems present only in checklists (not in master)
  for (const [systemId, node] of agg.entries()) {
    if (sysIndex.has(systemId)) continue;
    rowsOut.push(makeRow(systemId, '', node));
  }

  // --- 5) Sort by System A→Z
  rowsOut.sort((a, b) => a.System.localeCompare(b.System, undefined, { sensitivity: 'base' }));

  // 5.1) Filter out rows with no phase completions at all (Con/Pre-Com/Com all 0)

  const rowsFiltered = rowsOut.filter(r =>
    (r.ConTotal ?? 0) > 0 ||
    (r.PreComTotal ?? 0) > 0 ||
    (r.ComTotal ?? 0) > 0
  );

  const show = {
    Con: rowsFiltered.some(r => (r.ConTotal ?? 0) > 0),
    PreCom: rowsFiltered.some(r => (r.PreComTotal ?? 0) > 0),
    Com: rowsFiltered.some(r => (r.ComTotal ?? 0) > 0),
  };


  // --- 6) Render (use filtered rows)
  systemsTableEl.innerHTML = renderTable(rowsFiltered, show);
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
        <th class="px-3 py-2 text-left font-medium">System</th>
        <th class="px-3 py-2 text-left font-medium">Description</th>
        ${show.Con    ? '<th class="px-3 py-2 text-center font-medium">Con</th>'      : ''}
        ${show.PreCom ? '<th class="px-3 py-2 text-center font-medium">Pre-Com</th>'  : ''}
        ${show.Com    ? '<th class="px-3 py-2 text-center font-medium">Com</th>'      : ''}
        <th class="px-3 py-2 text-left font-medium">% Complete</th>
      </tr>
    </thead>`;

  const tbody = rows.map(r => `
    <tr class="border-t border-slate-100 text-sm text-slate-800">
      <td class="px-3 py-2 border-b border-e border-t border-slate-200">${esc(r.System)}</td>
      <td class="px-3 py-2 border border-slate-200">${esc(r.Description)}</td>
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
const ACTUAL_KEYS = ['actual (utc +8)', 'actual (utc+8)', 'actual_utc8', 'actual date', 'actual'];
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

/** Parse “Actual (UTC +8)” like charts */
function toUtcMsFromUtc8(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value)) return value.getTime();

  if (typeof value === 'string') {
    const s = value.trim();

    // Already TZ-marked (Z or +08:00 etc.)
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

    const d = new Date(s);
    return isNaN(d) ? null : d.getTime();
  }

  return null;
}

// Kept for potential future use (e.g., a tooltip on the overall progress bar)
function fmtDate(msUTC) {
  const d = new Date(msUTC + 8 * 3600 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${yyyy} ${hh}:${mm}`;
}