
import { isExcel, escapeHtml, formatBytes } from './utils.js';

export function createFilesUI({
  dropzone,
  fileInput,
  fileList,
  // callbacks
  getExistingCount,    // () => number
  onFiles,             // (File[]) => void
  onRemove,            // (role: 'primary'|'systems') => void
  setStatus            // (msg, tone) => void
}) {
  function render(items) {
    fileList.innerHTML = '';
    if (!items || items.length === 0) {
      fileList.classList.add('hidden');
      return;
    }

    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between rounded-md border border-slate-200 bg-white p-3';

      const left = document.createElement('div');
      left.className = 'flex min-w-0 items-center gap-3';
      left.innerHTML = `
        <svg class="h-6 w-6 text-emerald-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19 7v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h5l6 4Z"/>
        </svg>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate-900">${escapeHtml(it.file.name)}</p>
          <p class="text-xs text-slate-500">${formatBytes(it.file.size)} • ${escapeHtml(it.label)}</p>
        </div>
      `;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'inline-flex items-center rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500';
      removeBtn.innerHTML = `
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Z" clip-rule="evenodd" />
        </svg>
        <span class="sr-only">Remove file</span>
      `;
      removeBtn.addEventListener('click', () => onRemove?.(it.role));

      li.appendChild(left);
      li.appendChild(removeBtn);
      fileList.appendChild(li);
    }

    fileList.classList.remove('hidden');
  }

  function wireDropzone() {
    ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('border-lime-100', 'bg-lime-10');
    }));
    ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('border-lime-100', 'bg-lime-10');
    }));

    dropzone.addEventListener('drop', (e) => {
      const incoming = Array.from(e.dataTransfer?.files ?? []).filter(isExcel);
      if (!incoming.length) return;
      const existingCount = Number(getExistingCount?.() ?? 0);
      if (existingCount + incoming.length > 2) {
        setStatus?.('Max 2 Excel files total. Drop your data file and a systems list.', 'error');
        return;
      }
      onFiles?.(incoming);
    });

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
  }

  function wireFileInput() {
    fileInput.addEventListener('change', (e) => {
      const selected = Array.from(e.target.files ?? []).filter(isExcel);
      if (!selected.length) return;
      const existingCount = Number(getExistingCount?.() ?? 0);
      if (existingCount + selected.length > 2) {
        setStatus?.('Max 2 Excel files total. Select your data file and a systems list.', 'error');
        fileInput.value = '';
        return;
      }
      onFiles?.(selected);
      fileInput.value = '';
    });
  }

  function ensureWireEvents() {
    wireDropzone();
    wireFileInput();
  }

  return {
    render,          // render([{role, file, label}, ...])
    ensureWireEvents // attach dropzone + input listeners
  };
}
