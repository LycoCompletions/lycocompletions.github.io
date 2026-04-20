import { TYPE_VALUES } from './config.js';

const AppState = {
  files: [] // { id, name, size, typeExt, sheetCount, totalRows, sheets, type: ''|'systems'|'checklists'|'punch' }
};

export const State = {
  get() { return AppState.files; },
  add(file) { AppState.files.push(file); },
  remove(id) {
    const i = AppState.files.findIndex(f => f.id === id);
    if (i !== -1) AppState.files.splice(i, 1);
  },
  usedTypes() {
    const set = new Set();
    for (const f of AppState.files) {
      if (f.type && TYPE_VALUES.includes(f.type)) set.add(f.type);
    }
    return set;
  }
};