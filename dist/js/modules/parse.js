import { 
    normalizeKey,
    normVal
} from './utils.js';

// Standardized field keys used elsewhere (kept in main.js)
// Here we only define header normalization for parsing.
export const headerMap = new Map([
  ['status', 'Status'],
  ['resp id', 'RespID'], ['respid', 'RespID'],
  ['cert id', 'CertID'], ['certid', 'CertID'],
  ['event description', 'EventDescription'], ['eventdescription', 'EventDescription'],
  ['tag no', 'TagNo'], ['tagno', 'TagNo'],
  ['system', 'System'],
  ['subsystem', 'SubSystem'], ['sub system', 'SubSystem'],
  ['cert disc', 'Cert Disc'], ['certdisc', 'Cert Disc'],
  ['area', 'Area'],
  ['actual (utc +8)', 'Actual (UTC +8)']
]);

// Collect union of headers present across first N rows (tolerates sparsity)
export function collectSeenHeaders(rows, sampleSize = 50) {
  const seen = new Set();
  if (!Array.isArray(rows) || rows.length === 0) return seen;
  const N = Math.min(rows.length, sampleSize);
  for (let i = 0; i < N; i++) {
    Object.keys(rows[i]).forEach(k => seen.add(k));
  }
  return seen;
}

// Which REQUIRED columns are missing?
export function missingRequiredHeaders(rows, required) {
  const seen = collectSeenHeaders(rows);
  return required.filter(r => !seen.has(r));
}

// Systems-specific: accept Description OR System Description
export function missingSystemsHeaders(rows) {
  const seen = collectSeenHeaders(rows);
  const hasSystem = seen.has('System');
  const hasDescEither = seen.has('Description') || seen.has('System Description');
  const missing = [];
  if (!hasSystem) missing.push('System');
  if (!hasDescEither) missing.push('Description/System Description'); // single requirement wording
  return missing;
}

// Parsing: read first sheet and normalize headers via headerMap
export async function parseExcelToRows(file) {
  if (!window.XLSX || !XLSX.read) {
    throw new Error('The Excel parser did not load. Please refresh and try again.');
  }
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

  const rows = raw.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const mapped = headerMap.get(normalizeKey(k));
      if (mapped) out[mapped] = normVal(v);
      if (!mapped) out[String(k)] = normVal(v); // keep extras untouched
    }
    return out;
  });
  return rows;
}

// Role heuristics
export function looksLikePrimary(rows) {
  if (!rows?.length) return false;
  const flags = ['Status', 'RespID', 'CertID', 'TagNo', 'Actual (UTC +8)'];
  return rows.some(r => flags.some(f => r[f] && String(r[f]).trim() !== ''));
}

export function looksLikeSystems(rows) {
  if (!rows?.length) return false;
  const hasSys = rows.some(r => r['System'] && String(r['System']).trim() !== '');
  const hasDesc = rows.some(r => Object.prototype.hasOwnProperty.call(r, 'Description'));
  return hasSys && hasDesc && !looksLikePrimary(rows);
}

// Build an index of System → Description from systemsRows
export function indexSystemDescriptions(systemsRows) {
  const idx = new Map();
  for (const r of systemsRows ?? []) {
    const sys = String(r['System'] ?? '').trim();
    if (!sys) continue;
    const desc = String(r['Description'] ?? r['System Description'] ?? '').trim();
    if (!idx.has(sys)) idx.set(sys, desc);
  }
  return idx;
}

// Enrich primary rows (LEFT JOIN on "System") with "System Description"
export function buildMergedRows(primaryRows, systemsRows) {
  const sysIdx = indexSystemDescriptions(systemsRows);
  const merged = [];
  for (const r of primaryRows ?? []) {
    const sys = String(r['System'] ?? '').trim();
    const desc = sys ? (sysIdx.get(sys) ?? '') : '';
    merged.push({ ...r, 'System Description': desc });
  }
  return merged;
}
