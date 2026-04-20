import { MAX_MB, ACCEPT, MAX_FILES } from './config.js';
import { State } from './state.js';
import { ext, formatSize } from './format.js';
import { cryptoRandomId } from './uid.js';
import { parseWorkbook } from './parser.js';
import { addFileRow, setCount, refreshTypeOptions, toggleLimit } from './items.js';

let dropzoneEl, fileInputEl, browseEl;

export function initUploader({ dropzone, fileInput, browse }) {
  dropzoneEl = dropzone; fileInputEl = fileInput; browseEl = browse;

  // Browse → click input
  browseEl?.addEventListener('click', () => fileInputEl?.click());

  // Input change
  fileInputEl?.addEventListener('change', (e) => {
    if (!e.target.files?.length) return;
    handleFiles(e.target.files);
    fileInputEl.value = '';
  });

  // Drag visuals
  ['dragenter','dragover'].forEach(evt =>
    dropzoneEl?.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzoneEl.classList.add('ring-2','ring-blue-400','bg-blue-50/40');
    }, false)
  );
  ['dragleave','drop'].forEach(evt =>
    dropzoneEl?.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzoneEl.classList.remove('ring-2','ring-blue-400','bg-blue-50/40');
    }, false)
  );
  dropzoneEl?.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files?.length) return;
    handleFiles(dt.files);
  });
}

async function handleFiles(fileList) {
  const already = State.get().length;
  const slots = MAX_FILES - already;
  if (slots <= 0) { toggleLimit(true); return; }

  const files = Array.from(fileList);
  const toProcess = files.slice(0, slots);
  const ignored = files.length - toProcess.length;

  for (const file of toProcess) {
    const validation = validateFile(file);
    if (!validation.ok) {
      addFileRow({
        name: file.name,
        meta: `${file.type || 'Unknown'} • ${(file.size/1024/1024).toFixed(2)} MB`,
        status: validation.message,
        statusStyle: 'amber',
        withTypeSelect: false
      });
      continue;
    }

    try {
      const parsed = await parseWorkbook(file);
      parsed.id = cryptoRandomId();
      parsed.type = ''; // force user to choose uniquely
      State.add(parsed);

      addFileRow({
        id: parsed.id,
        name: file.name,
        meta: `${ext(file.name).toUpperCase()} • ${formatSize(file.size)} • ${parsed.sheetCount} sheet${parsed.sheetCount>1?'s':''}`,
        status: `Parsed ${parsed.totalRows} row${parsed.totalRows!==1?'s':''}`,
        statusStyle: 'emerald',
        withTypeSelect: true,
        typeValue: parsed.type
      });
    } catch (err) {
      console.error(err);
      addFileRow({
        name: file.name,
        meta: `${ext(file.name).toUpperCase()} • ${formatSize(file.size)}`,
        status: 'Parse failed',
        statusStyle: 'amber',
        withTypeSelect: false
      });
    }
  }

  setCount(State.get().length);
  toggleLimit(ignored > 0 || State.get().length >= MAX_FILES);
  refreshTypeOptions();
}

function validateFile(file) {
  const extension = ext(file.name);
  if (!ACCEPT.includes(extension)) {
    return { ok: false, message: 'Unsupported type' };
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_MB) {
    return { ok: false, message: 'Too large (>10 MB)' };
  }
  return { ok: true };
}