// /modules/persist.js
// Minimal IndexedDB wrapper for persisting parsed file payloads (systems + contractors)

const DB_NAME = 'cg_dashboard_db';
const STORE   = 'files';
const KEYS    = {
  systems:     'systems_v1',
  contractors: 'contractors_v1',
  checklists:  'checklists_v1',
  punch:       'punch_v1'
};

// ---- idb helpers ----
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbGet(key) {
  return openDB().then(db =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const rq = st.get(key);
      rq.onsuccess = () => resolve(rq.result ?? null);
      rq.onerror   = () => reject(rq.error);
    }).finally(() => db.close())
  );
}

function idbSet(key, value) {
  return openDB().then(db =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const rq = st.put(value, key);
      rq.onsuccess = () => resolve(true);
      rq.onerror   = () => reject(rq.error);
    }).finally(() => db.close())
  );
}

function idbDel(key) {
  return openDB().then(db =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const rq = st.delete(key);
      rq.onsuccess = () => resolve(true);
      rq.onerror   = () => reject(rq.error);
    }).finally(() => db.close())
  );
}

// ---- generic payload builder ----

function payloadFor(type, fileLike) {
  const fallbackName =
    type === 'systems'     ? 'Systems.xlsx' :
    type === 'contractors' ? 'Contractors.xlsx' :
    type === 'checklists'  ? 'Checklists.xlsx' :
    type === 'punch'       ? 'Punch Items.xlsx' :
    'File.xlsx';

  return {
    name: fileLike?.name ?? fallbackName,
    savedAt: Date.now(),
    type,
    sheets: fileLike?.sheets ?? [],
    validation: fileLike?.validation ?? null
  };
}


// ---- systems API ----
export async function saveSystemsParsed(fileLike) {
  await idbSet(KEYS.systems, payloadFor('systems', fileLike));
}
export async function loadSystemsParsed() {
  return await idbGet(KEYS.systems);
}
export async function clearSystemsParsed() {
  await idbDel(KEYS.systems);
}

// ---- contractors API ----
export async function saveContractorsParsed(fileLike) {
  await idbSet(KEYS.contractors, payloadFor('contractors', fileLike));
}
export async function loadContractorsParsed() {
  return await idbGet(KEYS.contractors);
}
export async function clearContractorsParsed() {
  await idbDel(KEYS.contractors);
}


// Checklists API
export async function saveChecklistsParsed(fileLike) {
  await idbSet(KEYS.checklists, payloadFor('checklists', fileLike));
}
export async function loadChecklistsParsed() {
  return await idbGet(KEYS.checklists);
}
export async function clearChecklistsParsed() {
  await idbDel(KEYS.checklists);
}

// Punch API
export async function savePunchParsed(fileLike) {
  await idbSet(KEYS.punch, payloadFor('punch', fileLike));
}
export async function loadPunchParsed() {
  return await idbGet(KEYS.punch);
}
export async function clearPunchParsed() {
  await idbDel(KEYS.punch);
}
