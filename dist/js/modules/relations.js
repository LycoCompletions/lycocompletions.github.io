// /modules/relations.js
import { State } from './state.js';

/**
 * Headless join indices between:
 *   Contractors.contractor_id  ⇄  Checklists.resp_id
 *   Contractors.contractor_id  ⇄  PunchItems.action_by   (independent)
 *   Contractors.contractor_id  ⇄  PunchItems.resp_id     (independent)
 *
 * ID normalization:
 *  - NBSP → space
 *  - trim
 *  - collapse internal whitespace
 *  - UPPERCASE
 * (Punctuation like '-' is preserved.)
 */

// ---- Internal cache (rebuilt via rebuildContractorJoin) ----
let joinCache = {
  // contractors & checklists
  byContractorId: new Map(),     // contractor -> checklist agg bucket
  checklistRows: [],             // raw checklist rows (first sheet)
  unmatchedRespIds: 0,

  // contractors & punch items (two independent maps)
  punchByActionBy: new Map(),    // contractor -> punch agg (action_by)
  punchByRespId:   new Map(),    // contractor -> punch agg (resp_id)
  punchRows: [],                 // raw punch rows (first sheet)
  unmatchedPunchActionBy: 0,
  unmatchedPunchRespId: 0,

  // raw contractors
  contractorsRows: []
};

export function rebuildContractorJoin() {
  const files = State.get();
  const contractorsFile = files.find(f => f.type === 'contractors' && f.validation?.ok);
  const checklistsFile  = files.find(f => f.type === 'checklists'  && f.validation?.ok);
  const punchFile       = files.find(f => f.type === 'punch'       && f.validation?.ok);

  const contractors = contractorsFile?.sheets?.[0]?.data ?? [];
  const checklists  = checklistsFile?.sheets?.[0]?.data ?? [];
  const punch       = punchFile?.sheets?.[0]?.data ?? [];

  // ---- 1) Base contractor index (by normalized contractor_id) ----
  const baseIndex = new Map();
  for (const r of contractors) {
    const cid  = getCI(r, 'contractor_id');
    const name = getCI(r, 'description');
    const cno  = getCI(r, 'contract_no'); // metadata only

    const key = normId(cid);
    if (!key) continue;

    if (!baseIndex.has(key)) {
      baseIndex.set(key, {
        contractor_id: safeStr(cid),
        description:   safeStr(name),
        contract_no:   safeStr(cno)
      });
    }
  }

  // ---- 2) Checklist join (RespID ⇄ ContractorID) ----
  const byContractorId = new Map(); // checklist aggregation
  let unmatchedChecklist = 0;

  for (const [key, meta] of baseIndex.entries()) {
    byContractorId.set(key, {
      ...meta,
      rows: [],
      total: 0,
      complete: 0
    });
  }

  for (let i = 0; i < checklists.length; i++) {
    const row = checklists[i];
    if (isNA(row.status)) continue;

    const resp = getCI(row, 'resp_id');
    const key = normId(resp);
    if (!key) { unmatchedChecklist++; continue; }

    const bucket = byContractorId.get(key);
    if (!bucket) { unmatchedChecklist++; continue; }

    bucket.total += 1;
    bucket.rows.push(i);

    if (hasActualValue(getCI(row, 'actual_utc8'))) bucket.complete += 1;
  }

  // ---- 3) Punch joins (two independent indices) ----
  const punchByActionBy = new Map();
  const punchByRespId   = new Map();

  // seed both with contractor meta
  for (const [key, meta] of baseIndex.entries()) {
    punchByActionBy.set(key, {
      ...meta,
      rows: [],
      total: 0,
      byStatus: { Outstanding: 0, Verified: 0, Cleared: 0 }
    });
    punchByRespId.set(key, {
      ...meta,
      rows: [],
      total: 0,
      byStatus: { Outstanding: 0, Verified: 0, Cleared: 0 }
    });
  }

  let unmatchedAction = 0;
  let unmatchedResp   = 0;

  for (let i = 0; i < punch.length; i++) {
    const row = punch[i];

    // Skip "Cancelled" per your punch charts logic
    const status = normalizePunchStatus(row.status);
    if (status === 'Cancelled' || status === '') continue;

    // ActionBy path (independent)
    const actBy = getCI(row, 'action_by');
    const keyA  = normId(actBy);
    if (keyA) {
      const b = punchByActionBy.get(keyA);
      if (b) {
        b.total += 1;
        b.rows.push(i);
        if (b.byStatus[status] == null) b.byStatus[status] = 0;
        b.byStatus[status] += 1;
      } else {
        unmatchedAction++;
      }
    } else {
      unmatchedAction++;
    }

    // RespID path (independent)
    const respId = getCI(row, 'resp_id');
    const keyR   = normId(respId);
    if (keyR) {
      const b = punchByRespId.get(keyR);
      if (b) {
        b.total += 1;
        b.rows.push(i);
        if (b.byStatus[status] == null) b.byStatus[status] = 0;
        b.byStatus[status] += 1;
      } else {
        unmatchedResp++;
      }
    } else {
      unmatchedResp++;
    }
  }

  // ---- 4) Commit cache ----
  joinCache = {
    byContractorId,
    checklistRows: checklists,
    unmatchedRespIds: unmatchedChecklist,

    punchByActionBy,
    punchByRespId,
    punchRows: punch,
    unmatchedPunchActionBy: unmatchedAction,
    unmatchedPunchRespId: unmatchedResp,

    contractorsRows: contractors
  };
}

/* ======================== Query APIs ======================== */
/* Checklist-side */

export function getContractorForRespId(respId) {
  const key = normId(respId);
  if (!key) return null;
  const hit = joinCache.byContractorId.get(key);
  if (!hit) return null;
  return {
    contractor_id: hit.contractor_id,
    description:   hit.description,
    contract_no:   hit.contract_no
  };
}

export function getChecklistRowsByContractorId(contractorId) {
  const key = normId(contractorId);
  if (!key) return [];
  const bucket = joinCache.byContractorId.get(key);
  if (!bucket) return [];
  return bucket.rows.map(i => joinCache.checklistRows[i]);
}

export function getContractorSummary() {
  const out = [];
  for (const [, v] of joinCache.byContractorId.entries()) {
    if (v.total === 0) continue;
    //const pct = pctNum(v.complete, v.total);
    out.push({
      contractor_id: v.contractor_id,
      description:   v.description,
      contract_no:   v.contract_no,
      total:         v.total,
      complete:      v.complete,
      incomplete:    Math.max(0, v.total - v.complete),
      //percent:       +pct.toFixed(1)
    });
  }
  out.sort((a, b) => a.contractor_id.localeCompare(b.contractor_id, undefined, { sensitivity: 'base' }));
  return out;
}

export function getUnmatchedRespIdCount()  { return joinCache.unmatchedRespIds  || 0; }

/* Punch-side (two independent views) */

export function getPunchRowsByContractorIdFromActionBy(contractorId) {
  const key = normId(contractorId);
  if (!key) return [];
  const bucket = joinCache.punchByActionBy.get(key);
  if (!bucket) return [];
  return bucket.rows.map(i => joinCache.punchRows[i]);
}

export function getPunchRowsByContractorIdFromRespId(contractorId) {
  const key = normId(contractorId);
  if (!key) return [];
  const bucket = joinCache.punchByRespId.get(key);
  if (!bucket) return [];
  return bucket.rows.map(i => joinCache.punchRows[i]);
}

export function getPunchSummaryByActionBy() {
  const out = [];
  for (const [, v] of joinCache.punchByActionBy.entries()) {
    if (v.total === 0) continue;
    out.push({
      contractor_id: v.contractor_id,
      description:   v.description,
      contract_no:   v.contract_no,
      total:         v.total,
      Outstanding:   v.byStatus.Outstanding || 0,
      Verified:      v.byStatus.Verified    || 0,
      Cleared:       v.byStatus.Cleared     || 0
    });
  }
  out.sort((a, b) => a.contractor_id.localeCompare(b.contractor_id, undefined, { sensitivity: 'base' }));
  return out;
}

export function getPunchSummaryByRespId() {
  const out = [];
  for (const [, v] of joinCache.punchByRespId.entries()) {
    if (v.total === 0) continue;
    out.push({
      contractor_id: v.contractor_id,
      description:   v.description,
      contract_no:   v.contract_no,
      total:         v.total,
      Outstanding:   v.byStatus.Outstanding || 0,
      Verified:      v.byStatus.Verified    || 0,
      Cleared:       v.byStatus.Cleared     || 0
    });
  }
  out.sort((a, b) => a.contractor_id.localeCompare(b.contractor_id, undefined, { sensitivity: 'base' }));
  return out;
}

export function getUnmatchedPunchActionByCount() { return joinCache.unmatchedPunchActionBy || 0; }
export function getUnmatchedPunchRespIdCount()   { return joinCache.unmatchedPunchRespId   || 0; }

/* ======================== Helpers ======================== */

function getCI(obj, key) {
  if (!obj) return undefined;
  const want = String(key).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === want) return obj[k];
  }
  return undefined;
}

function normId(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\u00A0/g, ' ') // NBSP → space
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function safeStr(v) { return v == null ? '' : String(v).trim(); }

function isNA(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'not applicable' || s === 'n/a' || s === 'na';
}

function hasActualValue(v) {
  if (v == null) return false;
  if (v instanceof Date && !isNaN(v)) return true;
  const s = String(v).trim();
  if (!s) return false;
  const ms = toUtcMsFromUtc8(s);
  return ms != null;
}

// Minimal UTC+8 parser (mirrors your charts)
function toUtcMsFromUtc8(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value)) return value.getTime();
  if (typeof value === 'string') {
    const s = value.trim();
    if (/Z|[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d) ? null : d.getTime();
    }
    let m = s.match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Y, Mo, Da, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, Mo, Da, Y, h, mi, se] = m.map(Number);
      return Date.UTC(Y, Mo - 1, Da, (h ?? 0) - 8, mi ?? 0, se ?? 0, 0);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d.getTime();
  }
  return null;
}

// Punch status normalizer (mirror of charts.js)
function normalizePunchStatus(v) {
  if (v == null) return 'Outstanding';
  const s = String(v).trim().toLowerCase();

  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'outstanding' || s === 'open') return 'Outstanding';
  if (s === 'verified' || s === 'verification complete' || s === 'verified by qa') return 'Verified';
  if (s === 'cleared' || s === 'closed' || s === 'complete' || s === 'completed' || s === 'resolved') return 'Cleared';

  return 'Outstanding';
}
``