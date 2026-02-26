
// /js/jobname.js
// Persist a "Job Name" field to localStorage and expose a tiny API.

const DEFAULT_STORAGE_KEY = 'completions-dashboard:jobName';

// Small debounce helper (no external deps)
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Safe storage guards
function lsGet(key, fallback = '') {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value ?? '');
  } catch {
    /* ignore */
  }
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve an input element from either:
 * - a DOM element, or
 * - a CSS selector string.
 */
function resolveInput(input) {
  if (!input) return null;
  if (typeof input === 'string') return document.querySelector(input);
  if (input instanceof HTMLElement) return input;
  return null;
}

/**
 * initJobName({ input, storageKey, onChange })
 * - input: HTMLElement or selector. If omitted, tries '#job_name' then '#first_name'.
 * - storageKey: optional localStorage key (defaults to DEFAULT_STORAGE_KEY)
 * - onChange(name): optional callback after value changes
 *
 * Returns a controller with:
 *  - get(): string
 *  - set(value: string): void
 *  - clear(): void
 *  - destroy(): void (removes event listeners)
 *  - el: HTMLInputElement | null (bound element)
 *  - key: string (storage key)
 */
export function initJobName({ input, storageKey = DEFAULT_STORAGE_KEY, onChange } = {}) {
  const el =
    resolveInput(input) ||
    document.getElementById('job_name') ||
    document.getElementById('first_name') ||
    null;

  // Lightweight controller that can operate even without a bound element.
  const ctrl = {
    el,
    key: storageKey,
    get: () => lsGet(storageKey, ''),
    set: (value) => {
      const next = String(value ?? '').trim();
      lsSet(storageKey, next);
      if (el && document.activeElement !== el) el.value = next;
      if (typeof onChange === 'function') onChange(next);
    },
    clear: () => {
      lsRemove(storageKey);
      if (el) el.value = '';
      if (typeof onChange === 'function') onChange('');
    },
    destroy: () => {
      if (el && _handlers.input) el.removeEventListener('input', _handlers.input);
      if (_handlers.storage) window.removeEventListener('storage', _handlers.storage);
    }
  };

  const _handlers = { input: null, storage: null };

  // If we have an input element, restore value and wire events
  if (el) {
    // 1) Restore on init
    el.value = ctrl.get();

    // 2) Persist on input (debounced)
    const save = debounce((val) => {
      ctrl.set(val);
    }, 150);

    _handlers.input = (e) => save(e.target.value);
    el.addEventListener('input', _handlers.input);

    // 3) Cross-tab sync: update value if changed elsewhere (unless user is typing)
    _handlers.storage = (e) => {
      if (e.key === storageKey && el !== document.activeElement) {
        el.value = e.newValue || '';
        if (typeof onChange === 'function') onChange(el.value);
      }
    };
    window.addEventListener('storage', _handlers.storage);
  }

  return ctrl;
}

/**
 * Convenience accessor if you only need the current job name.
 */
export function getJobName(storageKey = DEFAULT_STORAGE_KEY) {
  return lsGet(storageKey, '');
}

/**
 * Builds a filename incorporating the job name:
 *   "jobName-base-YYYY-MM-DDThh-mm-ss.ext"
 * If job name is empty, returns "base-…"
 */
export function buildExportFileName({
  base = 'dashboard',
  ext = 'png',
  storageKey = DEFAULT_STORAGE_KEY,
} = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const job = getJobName(storageKey);
  const cleaned = job ? `${job.replace(/[\\\\/:*?"<>|]/g, '-')}-` : '';
  return `${cleaned}${base}-${stamp}.${ext}`;
}
