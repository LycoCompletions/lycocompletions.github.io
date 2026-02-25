import { 
    show,
    hide,
    cssSafe,
    escapeHtml
} from './utils.js';


export function createFilters({
  FIELDS,
  filtersPanel,
  filtersContainer,
  toggleFiltersBtn,
  btnExport,
  clearAllBtn,
  layoutDash,
  onFiltered,            // (filteredRows) => void
  ensureDashboardView,   // () => void  (called when user toggles filters panel)
  onLayoutChange         // () => void  (resize charts after layout change)
}) {
  // Internal state
  let allRows = [];
  let facets = {};
  let activeFilters = {};
  let isOpen = false;

  // ===== Build facets from data =====
  function buildFacets(rows) {
    facets = {};
    FIELDS.forEach(f => (facets[f] = new Set()));
    rows.forEach(r => FIELDS.forEach(f => facets[f].add(r[f] ?? '')));
  }

  // ===== Apply filters and notify host =====
  function applyFilters() {
    let filtered = allRows;
    FIELDS.forEach(f => {
      const sel = activeFilters[f];
      if (sel && sel.size > 0) filtered = filtered.filter(r => sel.has(r[f] ?? ''));
    });
    if (typeof onFiltered === 'function') onFiltered(filtered);
  }

  // ===== Render filters panel UI =====
  function renderFilters() {
    filtersContainer.innerHTML = '';

    FIELDS.forEach(field => {
      const values = Array.from(facets[field] ?? [])
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

      const block = document.createElement('div');
      block.innerHTML = `
        <div class="rounded-md border">
          <button type="button" class="flex w-full items-center justify-between bg-slate-50 px-3 py-2">
            <span class="text-sm font-medium text-slate-800">${field}</span>
            <svg class="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"/></svg>
          </button>
          <div class="p-3 space-y-2">
            <div class="relative">
              <input type="search" placeholder="Filter ${field} ..." class="w-full rounded-md border border-slate-300 py-1.5 pl-2 pr-8 text-xs focus:border-brand-600 focus:ring-2 focus:ring-brand-600" data-role="filter-search" data-field="${field}">
              <svg class="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path d="M8.5 3a5.5 5.5 0 1 0 3.476 9.75l3.137 3.137a.75.75 0 1 0 1.06-1.06l-3.137-3.137A5.5 5.5 0 0 0 8.5 3Z"/></svg>
            </div>
            <div class="max-h-56 overflow-auto pr-1">
              <ul class="space-y-1" data-role="options" data-field="${field}">
                ${values
                  .map(v => `
                  <li class="flex items-center gap-2">
                    <input id="${field}-${cssSafe(v)}" type="checkbox" class="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600" data-role="opt" data-field="${field}" value="${escapeHtml(v)}" ${activeFilters[field]?.has(v) ? 'checked' : ''}>
                    <label for="${field}-${cssSafe(v)}" class="flex-1 cursor-pointer truncate text-xs text-slate-700" title="${escapeHtml(v)}">${v || '<empty>'}</label>
                  </li>
                `)
                  .join('')}
              </ul>
            </div>
          </div>
        </div>
      `;
      filtersContainer.appendChild(block);
    });

    // Search within a facet
    filtersContainer.querySelectorAll('[data-role="filter-search"]').forEach(inp => {
      inp.addEventListener('input', e => {
        const field = e.target.dataset.field;
        const q = e.target.value.toLowerCase();
        const ul = filtersContainer.querySelector(`ul[data-field="${CSS?.escape ? CSS.escape(field) : field}"]`);
        if (!ul) return;
        ul.querySelectorAll('li').forEach(li => {
          const label = li.querySelector('label').textContent.toLowerCase();
          li.style.display = label.includes(q) ? '' : 'none';
        });
      });
    });

    // Checkbox change -> update activeFilters -> apply
    filtersContainer.querySelectorAll('input[data-role="opt"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const field = cb.dataset.field;
        const val = cb.value;
        if (!activeFilters[field]) activeFilters[field] = new Set();
        cb.checked ? activeFilters[field].add(val) : activeFilters[field].delete(val);
        applyFilters();
      });
    });

    // Clear all
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        activeFilters = {};
        filtersContainer.querySelectorAll('input[data-role="opt"]').forEach(cb => (cb.checked = false));
        applyFilters();
      };
    }
  }

  // ===== Open/close behavior and responsive defaults =====
  const mq = window.matchMedia('(max-width: 1023px)');

  function applyOpenState() {
    if (!filtersPanel || !layoutDash || !toggleFiltersBtn) return;
    if (isOpen) {
      filtersPanel.style.display = '';
      layoutDash.classList.add('lg:grid-cols-[18rem_1fr]');
      layoutDash.classList.remove('lg:grid-cols-1');
      toggleFiltersBtn.setAttribute('aria-pressed', 'true');
      toggleFiltersBtn.title = 'Hide filters';
    } else {
      filtersPanel.style.display = 'none';
      layoutDash.classList.remove('lg:grid-cols-[18rem_1fr]');
      layoutDash.classList.add('lg:grid-cols-1');
      toggleFiltersBtn.setAttribute('aria-pressed', 'false');
      toggleFiltersBtn.title = 'Show filters';
    }
    if (typeof onLayoutChange === 'function') onLayoutChange();
  }

  function setOpen(v) {
    isOpen = !!v;
    applyOpenState();
  }

  function wireToggleButton() {
    if (!toggleFiltersBtn) return;
    toggleFiltersBtn.disabled = false;
    btnExport.disabled = false;
    toggleFiltersBtn.onclick = () => {
      if (typeof ensureDashboardView === 'function') ensureDashboardView(); // keep behavior from main.js
      setOpen(!isOpen);
    };
  }

  function enableFiltersUI() {
    if (!filtersPanel) return;
    filtersPanel.setAttribute('data-visible', 'true');
    wireToggleButton();

    // Responsive default: open on desktop, closed on mobile
    setOpen(!mq.matches);
    const onChange = (e) => setOpen(!e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
  }

  // ===== Public API =====
  function updateData(rows) {
    allRows = Array.isArray(rows) ? rows : [];

    if (allRows.length === 0) {
      // Disable filters UI
      facets = {};
      activeFilters = {};
      filtersPanel?.setAttribute('data-visible', 'false');
      filtersContainer.innerHTML = '';
      if (toggleFiltersBtn) {
        toggleFiltersBtn.disabled = true;
        toggleFiltersBtn.setAttribute('aria-pressed', 'false');
      }
      setOpen(false);
      // Emit empty filtered set to host so it can reset results
      if (typeof onFiltered === 'function') onFiltered([]);
      return;
    }

    // Rebuild and render
    buildFacets(allRows);
    activeFilters = {};
    renderFilters();
    enableFiltersUI();

    // Initial apply (no filters -> passthrough)
    applyFilters();
  }

  function getActiveFilters() {
    // return a shallow copy (arrays) to avoid exposing Sets directly
    const out = {};
    for (const f of FIELDS) {
      out[f] = activeFilters[f] ? Array.from(activeFilters[f]) : [];
    }
    return out;
  }

  return {
    updateData,
    getActiveFilters,
    setOpen,
    toggleOpen: () => setOpen(!isOpen)
  };
}