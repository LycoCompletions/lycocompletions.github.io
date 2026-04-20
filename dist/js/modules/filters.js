// /modules/filters.js
import { State } from './state.js';

/** Public filter state (read with getFilters) */
let FILTERS = {
  checklists: {
    status: [],            // ['Completed','Outstanding','To Be Signed','Started'] (canonical)
    resp_or_contract: [],  // array of string values: RespID
    cert_id: [],
    event_description: [],
    tag_no: [],
    // NOTE: we removed the "Checklists — System" UI; we keep this key for forward-compat
    system: [],
    sub_system: [],
    cert_disc: [],
    area: []
  },
  punch: {
    category: [],
    action_by: [],
    resp_id: [],
    sub_system: [],
    status: []             // ['Outstanding','Verified','Cleared']
  },
  systems: {
    system: []             // The single Systems selector lives here
  }
};

export function getFilters() {
  return JSON.parse(JSON.stringify(FILTERS));
}

/* =========================
 * Lifecycle & Panel wiring
 * ========================= */
export function initFiltersUI({ panelEl, openBtn, closeBtn, applyBtn, resetBtn }) {
  const mount = document.getElementById('filters-dynamic');

  // Open → rebuild fresh every time
  openBtn?.addEventListener('click', () => {
    buildAndRenderFilters();
    panelEl?.classList.remove('hidden');
  });

  // Close
  closeBtn?.addEventListener('click', () => panelEl?.classList.add('hidden'));

  // Apply → read checked values into FILTERS (caller triggers recomputeAll)
  applyBtn?.addEventListener('click', () => {
    FILTERS = readSelectionsFromDOM();
    panelEl?.classList.add('hidden');
  });

  // Reset → clear state and rebuild UI
  resetBtn?.addEventListener('click', () => {
    FILTERS = {
      checklists: { status: [], resp_or_contract: [], cert_id: [], event_description: [], tag_no: [], system: [], sub_system: [], cert_disc: [], area: [] },
      punch:      { category: [], action_by: [], resp_id: [], sub_system: [], status: [] },
      systems:    { system: [] }
    };
    buildAndRenderFilters();
  });

  // Accordion toggle (delegated)
  mount?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-acc-btn]');
    if (!btn) return;
    const id = btn.getAttribute('data-target');
    const panel = id ? document.getElementById(id) : null;
    if (!panel) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.classList.toggle('hidden', expanded);
    const icon = btn.querySelector('[data-acc-icon]');
    icon?.classList.toggle('rotate-180', !expanded);
  });

  // Live search per section (delegated)
  mount?.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-filter-search]');
    if (!inp) return;

    const key = inp.getAttribute('data-filter-search'); // e.g., 'cl.status'
    const section = inp.closest(`[data-filter-section="${cssEscape(key)}"]`);
    if (!section) return;

    const q = inp.value.trim().toLowerCase();
    const items = section.querySelectorAll('[data-filter-item]');
    items.forEach(el => {
      const text = el.getAttribute('data-filter-text') || '';
      const show = !q || text.includes(q);
      el.classList.toggle('hidden', !show);
    });
  });
}

/** Build distinct sets and render accordion with checkbox options */
export function buildAndRenderFilters() {
  const mount = document.getElementById('filters-dynamic');
  if (!mount) return;

  // Pull raw rows (first sheet) for each file type (if present)
  const files = State.get();
  const clRows = files.find(f => f.type === 'checklists' && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  const puRows = files.find(f => f.type === 'punch'       && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  const syRows = files.find(f => f.type === 'systems'     && f.validation?.ok)?.sheets?.[0]?.data ?? [];
  const coRows = files.find(f => f.type === 'contractors' && f.validation?.ok)?.sheets?.[0]?.data ?? [];

  // Build distinct value sets (canonicalise statuses)
  const CL = {
    status:            distinct(clRows, 'status', normalizeChecklistStatus),
    resp_id:           distinct(clRows, 'resp_id'),
    cert_id:           distinct(clRows, 'cert_id'),
    event_description: distinct(clRows, 'event_description'),
    tag_no:            distinct(clRows, 'tag_no'),
    // NOTE: we still build, but we won't render the "Checklists — System" section
    system:            distinct(clRows, 'system'),
    sub_system:        distinct(clRows, 'sub_system'),
    cert_disc:         distinct(clRows, 'cert_disc'),
    area:              distinct(clRows, 'area')
  };

  const PU = {
    category:   distinct(puRows, 'category'),
    action_by:  distinct(puRows, 'action_by'),
    resp_id:    distinct(puRows, 'resp_id'),
    sub_system: distinct(puRows, 'sub_system'),
    status:     distinct(puRows, 'status', normalizePunchStatus)
  };

  const SY = {
    system: distinct(syRows, 'system')
  };

  // Contractors → maps for label enrichment (RespID/Contract No combined list)
  const CONTRACTORS = {
    contract_nos: new Map(), // contract_no -> contractor_id (normalized)
    id_to_no:     new Map()  // contractor_id (normalized) -> contract_no
  };
  for (const r of coRows) {
    const no = getCI(r, 'contract_no');
    const id = getCI(r, 'contractor_id');
    if (!no || !id) continue;
    const keyNo = String(no).trim();
    const keyId = normId(id);
    if (!CONTRACTORS.contract_nos.has(keyNo)) CONTRACTORS.contract_nos.set(keyNo, keyId);
    if (!CONTRACTORS.id_to_no.has(keyId))     CONTRACTORS.id_to_no.set(keyId, keyNo);
  }

  /* --------------- Render accordion (all default-open) --------------- */
  const html = [
    // === Checklists
    accordionSection(
      'acc-cl-status',
      'Checklists — Status',
      checkboxList('cl.status', sortByOrder(asList(CL.status), STATUS_ORDER_CL), FILTERS.checklists.status),
      true
    ),
    accordionSection(
      'acc-cl-respcontract',
      'Checklists — RespID / Contract No',
      checkboxListCombined(
        'cl.resp_or_contract',
        sortAlpha(asList(CL.resp_id)), // base: RespIDs from Checklists
        CONTRACTORS,                   // enrich label with Contract No
        FILTERS.checklists.resp_or_contract
      ),
      true
    ),
    accordionSection('acc-cl-certid',    'Checklists — Cert ID',           checkboxList('cl.cert_id',           sortAlpha(asList(CL.cert_id)),           FILTERS.checklists.cert_id),           true),
    accordionSection('acc-cl-eventdesc', 'Checklists — Event Description',  checkboxList('cl.event_description', sortAlpha(asList(CL.event_description)), FILTERS.checklists.event_description), true),
    accordionSection('acc-cl-tagno',     'Checklists — Tag No',             checkboxList('cl.tag_no',            sortAlpha(asList(CL.tag_no)),            FILTERS.checklists.tag_no),           true),
    // ✂️ removed the “Checklists — System” section
    accordionSection('acc-cl-subsystem', 'Checklists — Sub System',         checkboxList('cl.sub_system',        sortAlpha(asList(CL.sub_system)),        FILTERS.checklists.sub_system),       true),
    accordionSection('acc-cl-certdisc',  'Checklists — Cert Disc',          checkboxList('cl.cert_disc',         sortAlpha(asList(CL.cert_disc)),         FILTERS.checklists.cert_disc),        true),
    accordionSection('acc-cl-area',      'Checklists — Area',               checkboxList('cl.area',              sortAlpha(asList(CL.area)),              FILTERS.checklists.area),             true),

    // === Punch
    accordionSection('acc-pu-category',  'Punch — Category',   checkboxList('pu.category',   sortAlpha(asList(PU.category)),   FILTERS.punch.category),      true),
    accordionSection('acc-pu-actionby',  'Punch — Action By',  checkboxList('pu.action_by',  sortAlpha(asList(PU.action_by)),  FILTERS.punch.action_by),     true),
    accordionSection('acc-pu-respid',    'Punch — Resp ID',    checkboxList('pu.resp_id',    sortAlpha(asList(PU.resp_id)),    FILTERS.punch.resp_id),       true),
    accordionSection('acc-pu-subsystem', 'Punch — Sub System', checkboxList('pu.sub_system', sortAlpha(asList(PU.sub_system)), FILTERS.punch.sub_system),    true),
    accordionSection('acc-pu-status',    'Punch — Status',     checkboxList('pu.status',     sortByOrder(asList(PU.status), STATUS_ORDER_PU), FILTERS.punch.status), true),

    // === Systems (single source of truth)
    // Feel free to rename title to just "System"
    accordionSection('acc-sy-system',    'Systems — System',   checkboxList('sy.system',     sortAlpha(asList(SY.system)),     FILTERS.systems.system),      true)
  ].join('');

  mount.innerHTML = html;
}

/** Read all checked inputs back into FILTERS shape */
function readSelectionsFromDOM() {
  const read = (key) => Array.from(document.querySelectorAll(`input[type="checkbox"][data-filter-key="${cssEscape(key)}"]:checked`))
                              .map(el => el.value)
                              .filter(Boolean);

  return {
    checklists: {
      status:            read('cl.status'),
      resp_or_contract:  read('cl.resp_or_contract'),
      cert_id:           read('cl.cert_id'),
      event_description: read('cl.event_description'),
      tag_no:            read('cl.tag_no'),
      // still read if present (kept for forward-compat)
      system:            read('cl.system'),
      sub_system:        read('cl.sub_system'),
      cert_disc:         read('cl.cert_disc'),
      area:              read('cl.area')
    },
    punch: {
      category:   read('pu.category'),
      action_by:  read('pu.action_by'),
      resp_id:    read('pu.resp_id'),
      sub_system: read('pu.sub_system'),
      status:     read('pu.status')
    },
    systems: {
      system: read('sy.system')
    }
  };
}

/* =========================
 * Rendering helpers
 * ========================= */

// Let content grow until a cap, then scroll inside the panel
// - small screens: up to 60vh
// - sm+ screens:   up to 20rem (~320px)
const ACC_SCROLL_CLASS = 'm-1 max-h-[60vh] sm:max-h-80 overflow-y-auto rounded-b-lg bg-slate-100 border border-slate-200 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20';

// Search input styling
const SEARCH_INPUT_CLASSES =
  'block w-full rounded-md border border-slate-300 bg-white py-1.5 px-2 text-sm ' +
  'placeholder:text-slate-400 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20';

function accordionSection(id, title, innerHtml, open = true) {
  return `
    <div class="rounded-lg border border-slate-200 bg-slate-50">
      <button type="button"
              class="w-full flex items-center justify-between px-3 py-3 text-left text-sm font-medium text-slate-700 bg-slate-50 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20"
              aria-controls="${esc(id)}"
              aria-expanded="${open ? 'true' : 'false'}"
              data-acc-btn
              data-target="${esc(id)}">
        <span>${esc(title)}</span>
        <svg data-acc-icon class="h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      <div id="${esc(id)}"
           class="${open ? '' : 'hidden'} px-3 py-2 ${ACC_SCROLL_CLASS}">
        ${innerHtml || '<p class="text-xs text-slate-400 py-2">No options</p>'}
      </div>
    </div>
  `;
}

/** Standard checkbox list + per-section search */
function checkboxList(filterKey, values, selected = [], labelMap = (v) => v) {
  const list = asList(values);
  if (!list.length) return `<p class="text-xs text-slate-400 py-2">No options</p>`;

  const items = list.map((v, idx) => {
    const id = `${filterKey}-${idx}`;
    const label = String(labelMap(v));
    const isChecked = selected?.includes?.(v);
    return `
      <label for="${esc(id)}"
             class="inline-flex items-center gap-2 text-sm text-slate-700"
             data-filter-item
             data-filter-text="${esc(label.toLowerCase())}">
        <input id="${esc(id)}"
               type="checkbox"
               value="${esc(v)}"
               data-filter-key="${esc(filterKey)}"
               class="h-4 w-4 rounded border-slate-300 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20 accent-cobalt-100"
               ${isChecked ? 'checked' : ''}/>
        <span class="truncate" title="${esc(label)}">${esc(label)}</span>
      </label>`;
  }).join('');

  return `
    <div class="py-2" data-filter-section="${esc(filterKey)}">
      <div class="mb-2 sticky top-0 z-10 bg-white">
        <input type="text"
               data-filter-search="${esc(filterKey)}"
               placeholder="Search…"
               class="${SEARCH_INPUT_CLASSES}">
      </div>
      <div class="grid grid-cols-1 gap-2">
        ${items}
      </div>
    </div>
  `;
}

/** Combined RespID / Contract No list (value stores RespID; label shows "RespID (ContractNo)") */
function checkboxListCombined(filterKey, respList, contractors, selected = []) {
  const list = asList(respList);
  if (!list.length) return `<p class="text-xs text-slate-400 py-2">No options</p>`;

  const idToNo = contractors?.id_to_no ?? new Map();

  const items = list.map((resp, idx) => {
    const idNorm = normId(resp);
    const cNo    = idToNo.get(idNorm) || '—';
    const id     = `${filterKey}-${idx}`;
    const label  = `${resp} (${cNo})`;
    const checked = selected?.includes?.(resp);
    return `
      <label for="${esc(id)}"
             class="inline-flex items-center gap-2 text-sm text-slate-700"
             data-filter-item
             data-filter-text="${esc(label.toLowerCase())}">
        <input id="${esc(id)}"
               type="checkbox"
               value="${esc(resp)}"
               data-filter-key="${esc(filterKey)}"
               class="h-4 w-4 rounded border-slate-300 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20 accent-cobalt-100"
               ${checked ? 'checked' : ''}/>
        <span class="truncate" title="${esc(label)}">${esc(label)}</span>
      </label>`;
  }).join('');

  return `
    <div class="py-2" data-filter-section="${esc(filterKey)}">
      <div class="mb-2 sticky top-0 z-10 bg-white">
        <input type="text"
               data-filter-search="${esc(filterKey)}"
               placeholder="Search RespID / Contract No…"
               class="${SEARCH_INPUT_CLASSES}">
      </div>
      <div class="grid grid-cols-1 gap-2">
        ${items}
      </div>
    </div>
  `;
}

/* =========================
 * Filter application helpers (used by charts/systems)
 * ========================= */

/** Filter Checklists rows respecting current selections (needs contractorsRows to map Contract No → ContractorID when applicable) */
export function filterChecklistsRows(rows, contractorsRows) {
  const f  = FILTERS.checklists;
  const sy = FILTERS.systems || {};
  if (!rows?.length) return rows;

  // Build ContractNo → ContractorID map (for backward-compat support if Contract No values appear)
  const no2id = new Map();
  if (Array.isArray(contractorsRows)) {
    for (const r of contractorsRows) {
      const no = getCI(r, 'contract_no');
      const id = getCI(r, 'contractor_id');
      if (!no || !id) continue;
      const keyNo = String(no).trim();
      const keyId = normId(id);
      if (!no2id.has(keyNo)) no2id.set(keyNo, keyId);
    }
  }

  // Split selections: values are RespIDs from combined UI; still guard for Contract Nos if ever present
  const sel = new Set(f.resp_or_contract.map(String));
  const selContractNos = [...sel].filter(v => no2id.has(v));
  const selRespIds     = [...sel].filter(v => !no2id.has(v)).map(normId);
  const selContractorIdsFromNos = new Set(selContractNos.map(no => no2id.get(no)));

  // Combine “System” selections from both sections (union)
  const combinedSystems = Array.from(new Set([...(f.system || []), ...((sy.system || []))]));

  return rows.filter((r) => {
    // Status (canonical)
    if (f.status.length) {
      const s = normalizeChecklistStatus(getCI(r, 'status'));
      if (!f.status.includes(s)) return false;
    }

    // RespID / (optional Contract No) combined
    if (f.resp_or_contract.length) {
      const rid = normId(getCI(r, 'resp_id'));
      const match = selRespIds.includes(rid) || selContractorIdsFromNos.has(rid);
      if (!match) return false;
    }

    // Systems (union from both sections)
    if (combinedSystems.length && !includesAny(getCI(r, 'system'), combinedSystems)) {
      return false;
    }

    // Exact multi selects (any-of)
    if (f.cert_id.length           && !includesAny(getCI(r, 'cert_id'),           f.cert_id)) return false;
    if (f.event_description.length && !includesAny(getCI(r, 'event_description'), f.event_description)) return false;
    if (f.tag_no.length            && !includesAny(getCI(r, 'tag_no'),            f.tag_no)) return false;
    if (f.sub_system.length        && !includesAny(getCI(r, 'sub_system'),        f.sub_system)) return false;
    if (f.cert_disc.length         && !includesAny(getCI(r, 'cert_disc'),         f.cert_disc)) return false;
    if (f.area.length              && !includesAny(getCI(r, 'area'),              f.area)) return false;

    return true;
  });
}

/** Filter Punch rows respecting current selections */
export function filterPunchRows(rows) {
  const f = FILTERS.punch;
  if (!rows?.length) return rows;

  return rows.filter((r) => {
    // Status (canonical)
    if (f.status.length) {
      const s = normalizePunchStatus(getCI(r, 'status'));
      if (!f.status.includes(s)) return false;
    }
    if (f.category.length   && !includesAny(getCI(r, 'category'),   f.category))   return false;
    if (f.action_by.length  && !includesAny(getCI(r, 'action_by'),  f.action_by))  return false;
    if (f.resp_id.length    && !includesAny(getCI(r, 'resp_id'),    f.resp_id))    return false;
    if (f.sub_system.length && !includesAny(getCI(r, 'sub_system'), f.sub_system)) return false;

    return true;
  });
}

/* =========================
 * Utility helpers
 * ========================= */

const STATUS_ORDER_CL = ['Completed','Outstanding','To Be Signed','Started'];
const STATUS_ORDER_PU = ['Outstanding','Verified','Cleared'];

function distinct(rows, key, transform = null) {
  const set = new Set();
  for (const r of rows) {
    const v = getCI(r, key);
    if (v == null || String(v).trim() === '') continue;
    const out = transform ? transform(v) : String(v).trim();
    if (out) set.add(out);
  }
  return set;
}

function includesAny(value, selected) {
  if (!selected?.length) return true;
  if (value == null) return false;
  const norm = (s) => String(s).replace(/\u00A0/g, ' ').trim().toLowerCase();
  const v = norm(value);
  return selected.some(s => v === norm(s));
}

function getCI(obj, key) {
  if (!obj) return undefined;
  const want = String(key).toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === want) return obj[k];
  return undefined;
}

function normId(v) {
  if (v == null) return '';
  return String(v).replace(/\u00A0/g,' ').trim().replace(/\s+/g,' ').toUpperCase();
}

function esc(s='') {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function asList(values) {
  if (values == null) return [];
  if (Array.isArray(values)) return values.slice();
  try { return [...values]; } catch { return []; }
}

function sortAlpha(arr) {
  return arr.slice().sort((a,b)=>String(a).localeCompare(String(b), undefined, {sensitivity:'base'}));
}
function sortByOrder(arr, order) {
  const set = new Set(order);
  const inOrder  = arr.filter(v => set.has(v)).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const notIn    = arr.filter(v => !set.has(v)).sort((a,b)=>String(a).localeCompare(String(b), undefined, {sensitivity:'base'}));
  return [...inOrder, ...notIn];
}

function cssEscape(s) {
  // minimal CSS.escape fallback
  try { return CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g,'\\"'); } catch { return String(s); }
}

/* =========================
 * Canonical status mappers
 * ========================= */

function normalizeChecklistStatus(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.includes('to be signed') || s.includes('to-be-signed')) return 'To Be Signed';
  if (s.includes('complete')) return 'Completed';
  if (s.includes('progress') || s === 'started') return 'Started';
  if (s.includes('open') || s.includes('outstand')) return 'Outstanding';
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