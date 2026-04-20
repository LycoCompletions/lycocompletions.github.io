// /modules/items.js
import { State } from './state.js';
import { TYPE_VALUES } from './config.js';
import { escapeHtml, updateCount } from './dom.js';
import { cryptoRandomId } from './uid.js';
import { validateFileAgainstType } from './validate.js';

import {
  saveSystemsParsed,     loadSystemsParsed,     clearSystemsParsed,
  saveContractorsParsed, loadContractorsParsed, clearContractorsParsed,
  saveChecklistsParsed, loadChecklistsParsed, clearChecklistsParsed,
  savePunchParsed, loadPunchParsed, clearPunchParsed
} from './persist.js';

let fileListEl, fileCountEl, fileLimitEl;

/**
 * Boot the items list (dropzone/result list)
 */
export function initItems({ listEl, countEl, limitEl }) {
  fileListEl  = listEl;
  fileCountEl = countEl;
  fileLimitEl = limitEl;

/* ---------------- Remove (event delegation) --------------- */
fileListEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remove"]');
  if (!btn || !fileListEl.contains(btn)) return;

  const row = btn.closest('li');
  if (!row) return;

  const rowId = row.dataset.rowId;
  const fileBeforeRemove = State.get().find(f => f.id === rowId);

  if (rowId) State.remove(rowId);
  row.remove();

  updateCount(fileCountEl, State.get().length);
  refreshTypeOptions();
  toggleLimit(false);

  // Clear persisted payloads for special types + hide Saved badge
  if (fileBeforeRemove?.type === 'systems') {
    clearSystemsParsed().catch(() => {});
    setSavedBadge(row, false);
  }
  if (fileBeforeRemove?.type === 'contractors') {
    clearContractorsParsed().catch(() => {});
    setSavedBadge(row, false);
  }

  if (fileBeforeRemove?.type === 'checklists') {
    clearChecklistsParsed().catch(() => {});
    setSavedBadge(row, false);
  }

  if (fileBeforeRemove?.type === 'punch') {
    clearPunchParsed().catch(() => {});
    setSavedBadge(row, false);
  }
});

  /* ---------------- Type change (validate + uniqueness) --------------- */
  fileListEl?.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-role="file-type"]');
    if (!sel) return;

    const row = sel.closest('li[data-row-id]');
    if (!row) return;

    const rowId = row.dataset.rowId;
    const file  = State.get().find(f => f.id === rowId);
    if (!file) return;

    const prevType = file.type || '';
    const value    = sel.value; // '' | 'systems' | 'checklists' | 'punch' | 'contractors'

    if (value !== '' && !TYPE_VALUES.includes(value)) {
      sel.value = file.type || '';
      return;
    }

    // Update type in state
    file.type = value;

    // Validate when a concrete type is selected (skip if "Choose …")
    if (file.type) {
      file.validation = validateFileAgainstType(file, file.type);
      applyValidationToRow(row, file.validation);
    } else {
      file.validation = undefined;
      applyValidationToRow(row, null);
    }

    // Disable used types elsewhere (uniqueness)
    refreshTypeOptions();

    const PERSIST_TYPES = new Set(['systems', 'contractors', 'checklists', 'punch']);

    // 1) Clear previous persisted type if user changed away from it
    if (prevType && PERSIST_TYPES.has(prevType) && file.type !== prevType) {
      const clearMap = {
        systems: clearSystemsParsed,
        contractors: clearContractorsParsed,
        checklists: clearChecklistsParsed,
        punch: clearPunchParsed
      };
      clearMap[prevType]?.().then(() => setSavedBadge(row, false)).catch(() => {});
    }

    // 2) Save new persisted type if valid
    if (file.type && PERSIST_TYPES.has(file.type) && file.validation?.ok) {
      const saveMap = {
        systems: saveSystemsParsed,
        contractors: saveContractorsParsed,
        checklists: saveChecklistsParsed,
        punch: savePunchParsed
      };
      saveMap[file.type]?.(file).then(() => setSavedBadge(row, true)).catch(() => {});
    }

    // 3) If user selected a persisted type but it is NOT valid, ensure badge is off
    if (file.type && PERSIST_TYPES.has(file.type) && !file.validation?.ok) {
      setSavedBadge(row, false);
    }

    // Export readiness is handled centrally in main.js via recomputeAll()
  });

  // Try to restore persisted Systems/Contractors if not already present
  tryRestorePersistedSystems();
  tryRestorePersistedContractors();
  tryRestorePersistedChecklists();
  tryRestorePersistedPunch();
}

/**
 * Attempt to restore a persisted Systems file if none exists
 */
async function tryRestorePersistedSystems() {
  const alreadyHasSystems = State.get().some(f => f.type === 'systems' && f.validation?.ok);
  if (alreadyHasSystems) return;

  const data = await loadSystemsParsed().catch(() => null);
  if (!data || !Array.isArray(data.sheets)) return;

  const id   = 'sys_' + cryptoRandomId();
  const file = {
    id,
    name: data.name || 'Systems (restored)',
    type: 'systems',
    sheets: data.sheets,
    validation: data.validation ?? { ok: true },
  };

  // Push into State (live array)
  State.get().push(file);

  // Reflect into UI
  addFileRow({
    id,
    name: file.name,
    meta: new Date(data.savedAt || Date.now()).toLocaleString(),
    status: 'Restored',
    statusStyle: 'emerald',
    withTypeSelect: true,
    typeValue: 'systems'
  });

  updateCount(fileCountEl, State.get().length);
  refreshTypeOptions();

  // Show Saved badge
  const rowEl = fileListEl?.querySelector(`li[data-row-id="${id}"]`) || fileListEl?.lastElementChild;
  setSavedBadge(rowEl, true);
}

/**
 * Attempt to restore a persisted Contractors file if none exists
 */
async function tryRestorePersistedContractors() {
  const alreadyHas = State.get().some(f => f.type === 'contractors' && f.validation?.ok);
  if (alreadyHas) return;

  const data = await loadContractorsParsed().catch(() => null);
  if (!data || !Array.isArray(data.sheets)) return;

  const id   = 'con_' + cryptoRandomId();
  const file = {
    id,
    name: data.name || 'Contractors (restored)',
    type: 'contractors',
    sheets: data.sheets,
    validation: data.validation ?? { ok: true },
  };

  State.get().push(file);

  addFileRow({
    id,
    name: file.name,
    meta: new Date(data.savedAt || Date.now()).toLocaleString(),
    status: 'Restored',
    statusStyle: 'emerald',
    withTypeSelect: true,
    typeValue: 'contractors'
  });

  updateCount(fileCountEl, State.get().length);
  refreshTypeOptions();

  const rowEl = fileListEl?.querySelector(`li[data-row-id="${id}"]`) || fileListEl?.lastElementChild;
  setSavedBadge(rowEl, true);
}

async function tryRestorePersistedChecklists() {
  const alreadyHas = State.get().some(f => f.type === 'checklists' && f.validation?.ok);
  if (alreadyHas) return;

  const data = await loadChecklistsParsed().catch(() => null);
  if (!data || !Array.isArray(data.sheets)) return;

  const id = 'chk_' + cryptoRandomId();
  const file = {
    id,
    name: data.name || 'Checklists (restored)',
    type: 'checklists',
    sheets: data.sheets,
    validation: data.validation ?? null,
  };

  State.get().push(file);

  addFileRow({
    id,
    name: file.name,
    meta: new Date(data.savedAt ?? Date.now()).toLocaleString(),
    status: 'Restored',
    statusStyle: 'emerald',
    withTypeSelect: true,
    typeValue: 'checklists'
  });

  updateCount(fileCountEl, State.get().length);
  refreshTypeOptions();

  const rowEl = fileListEl?.querySelector(`li[data-row-id="${id}"]`) || fileListEl?.lastElementChild;
  setSavedBadge(rowEl, true);
}

async function tryRestorePersistedPunch() {
  const alreadyHas = State.get().some(f => f.type === 'punch' && f.validation?.ok);
  if (alreadyHas) return;

  const data = await loadPunchParsed().catch(() => null);
  if (!data || !Array.isArray(data.sheets)) return;

  const id = 'pun_' + cryptoRandomId();
  const file = {
    id,
    name: data.name || 'Punch Items (restored)',
    type: 'punch',
    sheets: data.sheets,
    validation: data.validation ?? null,
  };

  State.get().push(file);

  addFileRow({
    id,
    name: file.name,
    meta: new Date(data.savedAt ?? Date.now()).toLocaleString(),
    status: 'Restored',
    statusStyle: 'emerald',
    withTypeSelect: true,
    typeValue: 'punch'
  });

  updateCount(fileCountEl, State.get().length);
  refreshTypeOptions();

  const rowEl = fileListEl?.querySelector(`li[data-row-id="${id}"]`) || fileListEl?.lastElementChild;
  setSavedBadge(rowEl, true);
}


/**
 * Add a file row to the list
 */
export function addFileRow({
  id,
  name,
  meta,
  status,
  statusStyle = 'emerald',
  withTypeSelect = true,
  typeValue = '' // default "Choose …"
}) {
  if (!fileListEl) return;

  const li = document.createElement('li');
  li.className = 'flex flex-wrap items-center gap-3 px-4 py-3';
  if (id) li.dataset.rowId = id;

  const accents = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber:   'bg-amber-50 text-amber-700 ring-amber-100',
    rose:    'bg-rose-50 text-rose-700 ring-rose-100',
    sky:     'bg-sky-50 text-sky-700 ring-sky-100'
  };
  const badge = accents[statusStyle] || accents.emerald;

  const typeSelectHtml = withTypeSelect ? `
    <label class="sr-only" for="type-${id}">Type</label>
    <select id="type-${id}" data-role="file-type"
      class="rounded-lg border border-slate-300 bg-white py-1.5 px-2 text-xs text-slate-700 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20 "
      aria-label="File type">
      <option value=""${typeValue==='' ? ' selected' : ''}>Choose …</option>
      <option value="systems"${typeValue==='systems' ? ' selected' : ''}>Systems</option>
      <option value="checklists"${typeValue==='checklists' ? ' selected' : ''}>Checklists</option>
      <option value="punch"${typeValue==='punch' ? ' selected' : ''}>Punch Items</option>
      <option value="contractors"${typeValue==='contractors' ? ' selected' : ''}>Contractors</option>
    </select>
  ` : `
    <span class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">No type</span>
  `;

  li.innerHTML = `
    <div class="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${badge}">
      <!-- doc icon -->
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
           stroke-width="1.5" stroke="currentColor" class="size-4">
        <path stroke-linecap="round" stroke-linejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
      </svg>
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-slate-900">${escapeHtml(name)}</p>
      <!-- meta + inline chips on one line -->
      <div class="min-w-0 flex items-center gap-2">
        <p class="meta-line truncate text-xs/6 text-slate-500">${escapeHtml(meta)}</p>
        <!-- missing chips container (inline) -->
        <div data-role="missing-chips-inline" class="hidden flex-none flex-wrap gap-1.5"></div>
      </div>
    </div>

    <!-- Status pill -->
    <span class="file-status inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
          title="Parsed successfully">
      ${escapeHtml(status)}
    </span>

    <!-- Saved pill (hidden until persisted) -->
    <span class="file-saved hidden inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100"
          title="Persisted in browser">
      Saved
    </span>

    ${typeSelectHtml}

    <!-- Remove button -->
    <button 
    type="button" 
    data-action="remove" 
    aria-label="Remove ${escapeHtml(name)}"
    class="inline-flex h-8 w-8 items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100 focus:border-cobalt-60 focus:outline-none focus:ring-4 focus:ring-lime-20">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
      </svg>
      <span class="sr-only">Remove</span>
    </button>
  `;

  fileListEl.appendChild(li);

  // Reflect already-used types for new row
  refreshTypeOptions();

  // If a type already set (rare), run validation immediately
  if (typeValue) {
    const file = State.get().find(f => f.id === id);
    if (file) {
      file.validation = validateFileAgainstType(file, typeValue);
      applyValidationToRow(li, file.validation);
      // export readiness handled in main.js
    }
  }
}

/**
 * Re-compute disabled options across all type selects (uniqueness rule)
 */
export function refreshTypeOptions() {
  const used    = State.usedTypes();
  const selects = fileListEl?.querySelectorAll('select[data-role="file-type"]') ?? [];
  selects.forEach((sel) => {
    const current = sel.value; // '' or selected type
    Array.from(sel.options).forEach((opt) => {
      const val = opt.value;
      if (val === '') {
        opt.disabled = false; // "Choose …" always allowed
      } else {
        opt.disabled = used.has(val) && val !== current;
      }
    });
  });
}

/**
 * Update the status badge + inline chips based on validation result
 */
function applyValidationToRow(rowOrEl, validation) {
  const row = rowOrEl?.nodeType ? rowOrEl : fileListEl?.querySelector(`li[data-row-id="${rowOrEl}"]`);
  if (!row) return;

  const badge = row.querySelector('.file-status');
  if (!badge) return;

  // Reset badge styles
  badge.className = 'file-status inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset';

  // chips (missing fields)
  const chipsEl = row.querySelector('[data-role="missing-chips-inline"]');
  if (chipsEl) {
    chipsEl.innerHTML = '';
    chipsEl.classList.add('hidden');
    chipsEl.removeAttribute('title');
  }

  if (!validation) {
    // No type chosen yet
    badge.classList.add('bg-slate-100', 'text-slate-700', 'ring-slate-200');
    badge.textContent = 'Type: Choose to validate';
    badge.title = 'Select a type to validate required columns';
    return;
  }

  if (validation.ok) {
    badge.classList.add('bg-emerald-50', 'text-emerald-700', 'ring-emerald-100');
    badge.textContent = 'Valid';
    badge.title = 'All required columns present';
  } else {
    badge.classList.add('bg-rose-50', 'text-rose-700', 'ring-rose-100');

    const missingList = [
      ...(validation.missing || []),
      ...(validation.failedGroups || []).flatMap(g => g.missingInGroup || [])
    ];
    const uniq = Array.from(new Set(missingList));

    // Badge summary + tooltip
    badge.textContent = `Missing: ${uniq.length}`;
    badge.title       = uniq.length ? `Missing columns: ${uniq.join(', ')}` : 'Missing required columns';

    // Inline chips (cap to 3 + "+N more")
    if (chipsEl) {
      const MAX_CHIPS = 3;
      const head  = uniq.slice(0, MAX_CHIPS);
      const extra = uniq.length - head.length;

      head.forEach(col => {
        const chip = document.createElement('span');
        chip.className = 'inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100';
        chip.textContent = col;
        chipsEl.appendChild(chip);
      });

      if (extra > 0) {
        const more = document.createElement('span');
        more.className = 'inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100';
        more.textContent = `+${extra} more`;
        chipsEl.appendChild(more);
        chipsEl.title = uniq.join(', ');
      }

      chipsEl.classList.remove('hidden');
    }
  }
}

/**
 * Show/hide the "Saved" (persisted) pill on a row
 */
function setSavedBadge(rowOrEl, on) {
  const row = rowOrEl?.nodeType ? rowOrEl : fileListEl?.querySelector(`li[data-row-id="${rowOrEl}"]`);
  if (!row) return;
  const saved = row.querySelector('.file-saved');
  if (!saved) return;
  saved.classList.toggle('hidden', !on);
}

/**
 * External: set count & toggle "Max files" notice
 */
export function setCount(filesLen) {
  updateCount(fileCountEl, filesLen);
}

export function toggleLimit(show) {
  if (!fileLimitEl) return;
  fileLimitEl.classList.toggle('hidden', !show);
}
