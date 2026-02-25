import { normalizeKey, escapeHtml, hide, show } from '../utils.js';
import { normalizeToISODateOnly } from '../date.js';
import { resizeCategoricalCharts, updateCategoricalCharts } from '../charts/categorical.js';
import { updateTimeLineChart, resizeTimeCharts, updateTimeCumulativeChart } from '../charts/time.js';

/**
 * Returns a stable, custom-ordered list of unique EventDescription values.
 * Default order: CC -> MC (Pre) -> MC (Comm), then alphabetical fallbacks.
 */
function uniqueEventDescriptions(rows) {
  const set = new Set();
  for (const r of rows ?? []) {
    const ev = (r?.['EventDescription'] ?? '').trim();
    if (ev) set.add(ev);
  }
  const customOrder = [
    'CONSTRUCTION (CC)',
    'PRE-COMMISSIONING (MC)',
    'COMMISSIONING (MC)'
  ];
  return Array.from(set).sort((a, b) => {
    const ai = customOrder.indexOf(a);
    const bi = customOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * Try to infer a numeric “Total Sheets” for a given System.
 * Looks for common column names; if absent, falls back to number of rows in the group.
 */
function inferTotalSheetsForSystem(groupRows) {
  let best = null;
  const candidates = new Set([
    'total sheets', 'totalsheets', 'total_sheets', 'sheets total', 'sheets'
  ]);
  for (const r of groupRows) {
    for (const [k, v] of Object.entries(r)) {
      const kn = normalizeKey(k);
      if (!candidates.has(kn)) continue;
      const num = Number(String(v).replace(/[, ]/g, ''));
      if (Number.isFinite(num) && num > 0) {
        best = Math.max(best ?? 0, num);
      }
    }
  }
  return best ?? groupRows.length;
}

/**
 * Build matrix data per System with counts per EventDescription and completion stats.
 */
function buildSystemsMatrixData(rows) {
  const events = uniqueEventDescriptions(rows);

  // Group rows by System
  const bySystem = new Map();
  for (const r of rows ?? []) {
    const sys = String(r?.['System'] ?? '').trim();
    if (!sys) continue;
    if (!bySystem.has(sys)) bySystem.set(sys, []);
    bySystem.get(sys).push(r);
  }

  const records = [];
  for (const [sys, group] of bySystem.entries()) {
    // Description from enrichment
    const desc = (group.find(g => (g['System Description'] ?? '').trim() !== '')?.['System Description'] ?? '').trim();

    // Per-event counts
    const counts = {};
    for (const ev of events) counts[ev] = 0;
    for (const r of group) {
      const ev = (r?.['EventDescription'] ?? '').trim();
      if (ev && Object.prototype.hasOwnProperty.call(counts, ev)) counts[ev] += 1;
    }

    // Actual count = rows with a valid date in 'Actual (UTC +8)'
    let actualCount = 0;
    for (const r of group) {
      const iso = normalizeToISODateOnly(r?.['Actual (UTC +8)']);
      if (iso) actualCount += 1;
    }

    const totalSheets = inferTotalSheetsForSystem(group);
    const pct = totalSheets > 0 ? (actualCount / totalSheets) * 100 : 0;

    records.push({
      System: sys,
      Description: desc,
      counts,
      ActualCount: actualCount,
      TotalSheets: totalSheets,
      PercentComplete: pct
    });
  }

  records.sort((a, b) => a.System.localeCompare(b.System, undefined, { numeric: true }));

  // Headers: System, Description, per-event columns, Actual Count, Total Sheets, % Complete
  const headers = ['System', 'Description', ...events, 'Actual Count', 'Total Sheets', '% Complete'];
  return { headers, events, records };
}

/**
 * Render the matrix into the given table element.
 */
function renderSystemsMatrix(table, rows) {
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const { headers, events, records } = buildSystemsMatrixData(rows);

  thead.innerHTML = `
    <tr class="[&>*:nth-child(n+3)]:text-center">
      ${headers.map(h => `<th class="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">${escapeHtml(h)}</th>`).join('')}
    </tr>
  `;

  if (!records.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-3 text-slate-500 text-xs" colspan="${headers.length}">No data to display.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(rec => {
    const evCells = events.map(ev => `<td class="px-3 py-1.5 text-slate-800 text-xs">${rec.counts[ev] ?? 0}</td>`).join('');
    const pctText = Number.isFinite(rec.PercentComplete) ? `${Math.round(rec.PercentComplete)}%` : '0%';
    return `
      <tr class="hover:bg-slate-50 [&>*:nth-child(n+3)]:text-center">
        <td class="px-3 py-1.5 text-slate-800 text-xs align-middle">${escapeHtml(rec.System)}</td>
        <td class="px-3 py-1.5 text-slate-800 text-xs align-middle">${escapeHtml(rec.Description)}</td>
        ${evCells}
        <td class="px-3 py-1.5 text-slate-800 text-xs align-middle">${rec.ActualCount}</td>
        <td class="px-3 py-1.5 text-slate-800 text-xs align-middle">${rec.TotalSheets}</td>
        <td class="px-3 py-1.5 text-slate-800 text-xs font-semibold align-middle">${pctText}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Factory: create a systems matrix controller bound to a table element.
 * If no table provided, it will look for #systems-matrix-table.
 */
export function createSystemsMatrix({ table } = {}) {
  const tableEl = table ?? document.getElementById('systems-matrix-table');

  return {
    /**
     * Update the matrix with the current filtered rows.
     * Pass [] to clear / show “No data”.
     */
    update(rows) {
      if (!tableEl) return; // silently no-op if table missing
      renderSystemsMatrix(tableEl, rows ?? []);
    }
  };
}export function createDashboard({
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
}) {
    const AGG_OPTIONS = ['daily', 'weekly', 'monthly', 'yearly'];
    let agg = 'daily';
    let currentView = 'preview';

    // ---- Helpers ----
    function titleFromAgg(g) {
        return ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[g] || 'Daily');
    }

    function updateActualTitle() {
        if (titleActual) titleActual.textContent = `Actual (UTC +8) — ${titleFromAgg(agg)} Count`;
    }

    function updateToggleVisuals(view) {
        const isDash = view === 'dashboard';
        if (activePill) activePill.style.transform = isDash ? 'translateX(100%)' : 'translateX(0%)';
        btnPreview?.setAttribute('aria-pressed', String(!isDash));
        btnDashboard?.setAttribute('aria-pressed', String(isDash));
        btnPreview?.classList.toggle('text-white', !isDash);
        btnPreview?.classList.toggle('text-slate-700', isDash);
        btnDashboard?.classList.toggle('text-white', isDash);
        btnDashboard?.classList.toggle('text-slate-700', !isDash);
    }

    function isAggSelectable(option) {
        if (option === 'daily') return true;
        if (option === 'weekly') return !btnAggWeekly?.disabled;
        if (option === 'monthly') return !btnAggMonthly?.disabled;
        if (option === 'yearly') return !btnAggYearly?.disabled;
        return false;
    }

    function updateAggToggleVisuals() {
        const idx = Math.max(0, AGG_OPTIONS.indexOf(agg));
        aggActivePill && (aggActivePill.style.transform = `translateX(${idx * 100}%)`);
        const mapBtn = { daily: btnAggDaily, weekly: btnAggWeekly, monthly: btnAggMonthly, yearly: btnAggYearly };
        Object.entries(mapBtn).forEach(([opt, btn]) => {
            const active = opt === agg;
            btn?.setAttribute('aria-pressed', String(active));
            btn?.classList.toggle('text-white', active && !btn.disabled);
            btn?.classList.toggle('text-slate-700', !active && !btn.disabled);
        });
    }

    // ---- Public API ----
    function setView(view, filteredRows = []) {
        currentView = view;
        if (view === 'preview') { show(layoutPreview); hide(layoutDash); }
        else {
            hide(layoutPreview); show(layoutDash);
            const open = filtersPanel && filtersPanel.style.display !== 'none';
            layoutDash?.classList.toggle('lg:grid-cols-[18rem_1fr]', open);
            layoutDash?.classList.toggle('lg:grid-cols-1', !open);
            render(filteredRows);
            resizeAllCharts();
        }
        updateToggleVisuals(view);
    }

    function getView() { return currentView; }

    function setAgg(next, filteredRows = []) {
        if (!AGG_OPTIONS.includes(next)) return;
        if (!isAggSelectable(next)) return;
        agg = next;
        updateAggToggleVisuals();
        updateActualTitle();
        // Re-render the grain-aware time line immediately
        updateTimeLineChart(filteredRows ?? [], agg);
    }

    function getAgg() { return agg; }

    function setAggLevelsEnabled(enabled) {
        [btnAggWeekly, btnAggMonthly, btnAggYearly].forEach(btn => {
            if (!btn) return;
            btn.disabled = !enabled;
            btn.setAttribute('aria-disabled', String(!enabled));
            btn.classList.toggle('opacity-50', !enabled);
            btn.classList.toggle('cursor-not-allowed', !enabled);
            btn.classList.toggle('text-slate-400', !enabled);
            if (enabled && btn.getAttribute('aria-pressed') !== 'true') {
                btn.classList.remove('text-white');
                btn.classList.add('text-slate-700');
            }
            if (!enabled) {
                btn.classList.remove('text-white', 'text-slate-700');
                btn.classList.add('text-slate-400');
            }
        });
        if (!enabled && agg !== 'daily') { agg = 'daily'; updateAggToggleVisuals(); updateActualTitle(); }
    }

    function setDashboardButtonEnabled(enabled) {
        if (!btnDashboard) return;
        btnDashboard.disabled = !enabled;
    }

    function resizeAllCharts() {
        resizeTimeCharts();
        resizeCategoricalCharts();
    }

    function render(filteredRows) {
        // 1) Time-series (grain-aware)
        updateTimeLineChart(filteredRows ?? [], agg);
        // 2) Cumulative (full-span daily)
        updateTimeCumulativeChart(filteredRows ?? []);
        // 3) Categorical charts (Status / Disc / Resp)
        updateCategoricalCharts(filteredRows ?? []);
        // 4) Systems completion matrix
        systemsMatrix?.update(filteredRows ?? []);
    }

    function ensureWireEvents(getFilteredRows) {
        // View toggle
        btnPreview?.addEventListener('click', () => setView('preview', getFilteredRows?.() ?? []));
        btnDashboard?.addEventListener('click', () => { if (!btnDashboard.disabled) setView('dashboard', getFilteredRows?.() ?? []); });
        viewToggle?.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                if (e.key === 'ArrowRight' && !btnDashboard.disabled) { btnDashboard.focus(); setView('dashboard', getFilteredRows?.() ?? []); }
                else { btnPreview.focus(); setView('preview', getFilteredRows?.() ?? []); }
            }
        });

        // Agg toggle
        btnAggDaily?.addEventListener('click', () => setAgg('daily', getFilteredRows?.() ?? []));
        btnAggWeekly?.addEventListener('click', () => setAgg('weekly', getFilteredRows?.() ?? []));
        btnAggMonthly?.addEventListener('click', () => setAgg('monthly', getFilteredRows?.() ?? []));
        btnAggYearly?.addEventListener('click', () => setAgg('yearly', getFilteredRows?.() ?? []));

        aggToggle?.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const cur = AGG_OPTIONS.indexOf(agg);
            let next = cur;
            for (let step = 0; step < AGG_OPTIONS.length; step++) {
                next = (e.key === 'ArrowRight')
                    ? (next + 1) % AGG_OPTIONS.length
                    : (next - 1 + AGG_OPTIONS.length) % AGG_OPTIONS.length;
                const candidate = AGG_OPTIONS[next];
                if (isAggSelectable(candidate)) { setAgg(candidate, getFilteredRows?.() ?? []); break; }
            }
        });

        // Initial visuals
        updateToggleVisuals(currentView);
        updateAggToggleVisuals();
        updateActualTitle();
    }

    // Convenience for other modules (e.g., filters module wanting to force dashboard view)
    function ensureDashboardView(getFilteredRows) {
        setView('dashboard', getFilteredRows?.() ?? []);
    }

    return {
        // state
        getView, getAgg,

        // actions
        setView,
        setAgg,
        setAggLevelsEnabled,
        setDashboardButtonEnabled,
        render,
        resizeAllCharts,
        ensureDashboardView,
        ensureWireEvents
    };
}

