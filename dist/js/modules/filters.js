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
  let accordionsWired = false;

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

    const key = typeof cssSafe === 'function' ? cssSafe(field) : field;
    const groupId = `fg-${key}`;

    const block = document.createElement('section');
    block.setAttribute('data-filter-group', '');
    block.className = 'border shadow-sm rounded-lg m-2 p-2 bg-slate-50';

    block.innerHTML = `
      <button
        type="button"
        class="w-full flex items-center justify-between py-2 text-left"
        data-accordion-toggle
        aria-expanded="true"
        aria-controls="${groupId}"
      >
        <span class="text-sm font-medium">${escapeHtml(field)}</span>
        <svg class="chevron h-4 w-4 transform transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clip-rule="evenodd"/>
        </svg>
      </button>

      <div id="${groupId}" data-accordion-body class="p-2 bg-slate-100 rounded-lg border">
        <div class="mb-2">
          <input
            type="text"
            placeholder="Search ${escapeHtml(field)}"
            class="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-100 focus-visible:ring-offset-2"
            data-role="filter-search"
            data-field="${escapeHtml(field)}"
          />
        </div>

        <ul class="max-h-48 overflow-auto pr-1 space-y-1" data-field="${key}">
          ${values.map(v => `
            <li>
              <label class="inline-flex items-center gap-2 text-xs text-slate-800">
                <input
                  type="checkbox"
                  data-role="opt"
                  data-field="${escapeHtml(field)}"
                  value="${escapeHtml(v ?? '')}"
                  class="rounded border-slate-300 accent-cobalt-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-100 focus-visible:ring-offset-2"
                />
                <span>${escapeHtml(v ?? '') || ''}</span>
              </label>
            </li>
          `).join('')}
        </ul>
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

    wireAccordions();
  }

  function wireAccordions() {
  if (accordionsWired || !filtersContainer) return;
  accordionsWired = true;

  // Click to toggle (event delegation on the container)
  filtersContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accordion-toggle]');
    if (!btn || !filtersContainer.contains(btn)) return;

    // Resolve controlled body
    const id = btn.getAttribute('aria-controls');
    const body = id
      ? document.getElementById(id)
      : (btn.nextElementSibling && btn.nextElementSibling.matches?.('[data-accordion-body]') ? btn.nextElementSibling : null);

    if (!body) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;

    // Rotate chevron
    const chev = btn.querySelector('[data-chevron], .chevron');
    if (chev) chev.classList.toggle('rotate-180', !expanded);
  });

  // Keyboard: Space/Enter toggle focusable headers
  filtersContainer.addEventListener('keydown', (e) => {
    const btn = e.target.closest('[data-accordion-toggle]');
    if (!btn) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btn.click();
    }
  });
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
    else mq.addEventListener(onChange);
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