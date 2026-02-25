
import { updateCategoricalCharts, resizeCategoricalCharts, updateTimeLineChart, updateTimeCumulativeChart, resizeTimeCharts } from './charts/index.js';
import { show, hide } from './utils.js';

export function createDashboard({
  // Layout
  layoutPreview,
  layoutDash,
  filtersPanel,

  // View toggle
  viewToggle,
  activePill,
  btnPreview,
  btnDashboard,

  // Chart title
  titleActual,

  // Grain toggle
  aggToggle,
  aggActivePill,
  btnAggDaily,
  btnAggWeekly,
  btnAggMonthly,
  btnAggYearly,

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
