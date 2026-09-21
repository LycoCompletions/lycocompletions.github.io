// /js/parser.js

// Uses the global XLSX from your <script> CDN include.
// Exports parseWorkbook(file) which returns an object the rest of your app expects.

import { ext } from './format.js';

export async function parseWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const sheets = [];
  let totalRows = 0;

  // Parse only the first sheet by default (you can set true to parse all)
  const PARSE_ALL_SHEETS = false;
  const names = PARSE_ALL_SHEETS ? wb.SheetNames : wb.SheetNames.slice(0, 1);

  for (const sheetName of names) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // header: 1 → first row is header row; defval: null so we preserve blanks
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1, blankrows: false, defval: null, raw: true
    });

    if (!rows.length) {
      sheets.push({ name: sheetName, rows: 0, headers: [], data: [] });
      continue;
    }

    // Normalize headers from row 0
    const headersRaw = rows[0].map((h) => (h ?? '').toString());
    const headers = headersRaw.map(normalizeHeader);

    // Build row objects
    const data = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (isEmptyRow(row)) continue;

      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `col_${c + 1}`;
        obj[key] = row[c] ?? null;
      }
      data.push(obj);
    }

    sheets.push({ name: sheetName, rows: data.length, headers, data });
    totalRows += data.length;
  }

  return {
    id: null, // caller sets id
    name: file.name,
    size: file.size,
    typeExt: ext(file.name),
    sheetCount: sheets.length,
    totalRows,
    sheets
  };
}

/**
 * Normalize a header label to a canonical field key.
 * Pipeline:
 *   1) Generic: trim → lowercase → replace non-alnum with '_' → trim '_' → collapse '__'
 *   2) Map: apply exact known mappings to unify shorthand & special cases
 */
function normalizeHeader(h) {
  const raw = String(h || '').trim();

  // Handle variable UTC-offset date headers before generic normalization.
  //
  // Examples:
  // Actual (UTC +8)    -> actual_utc8
  // Actual (UTC +10)   -> actual_utc10
  // Actual (UTC -3)    -> actual_utc_minus3
  // Actual (UTC +9:30) -> actual_utc9_30
  //
  // The same rule applies to Created.
  const utcDateHeader = normalizeUtcDateHeader(raw);

  if (utcDateHeader) {
    return utcDateHeader;
  }

  const base = raw
    .toLowerCase()
    .replace(/%/g, 'pct')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/__+/g, '_');

  // Exact canonicalization map
  // Systems
  const map = {
    project: 'project',
    plant: 'plant',
    system: 'system',
    description: 'description',

    // Punch Items
    status: 'status',
    punch_id: 'punch_id',
    cat: 'category',                // "Cat" → category
    subsystem: 'sub_system',        // "Subsystem" → sub_system
    tag_no: 'tag_no',
    disc: 'discipline',             // "Disc" → discipline
    phase: 'phase',
    action_by: 'action_by',
    resp_id: 'resp_id',
    package: 'package',
    checklist: 'checklist',
    //cleared_utc_8: 'cleared_utc8',            // "(UTC +8)" → "_utc8"
    //verified_utc_8: 'verified_utc8',
    //checked_out_utc_8: 'checked_out_utc8',
    due_date: 'due_date',
    //raised_utc_8: 'raised_utc8',
    raised_by: 'raised_by',
    cleared_by: 'cleared_by',
    verified_by: 'verified_by',
    checked_out_by: 'checked_out_by',
    current_sign_group: 'current_sign_group',
    is_overdue: 'is_overdue',

    // Checklists
    na: 'na', // harmless/no-op
    cert: 'cert',
    event_id_no: 'event_id',        // unify "Event ID No" → event_id
    cert_id: 'cert_id',
    cert_description: 'cert_description',
    event_id: 'event_id',
    event_description: 'event_description',
    taggroupsort1: 'tag_group_sort_1',  // "TagGroupSort1"
    cert_disc: 'cert_disc',
    area: 'area',
    site: 'site',
    revision: 'revision',
    // actual_utc_8: 'actual_utc8',    // "(UTC +8)" → "_utc8"
    actual_by: 'actual_by',
    comment: 'comment',
    updated_by: 'updated_by',
    tag_type: 'tag_type',
    // created_utc_8: 'created_utc8',


    // Contractors
    contractor: 'contractor_id',
    // description: 'description', keeping this produces a warning for duplicate descriptions with the initial systems item
    contract_no: 'contract_no',

  };

  return map[base] || base;
}

function normalizeUtcDateHeader(header) {
  const value = String(header ?? '').trim();

  /*
   * Matches:
   *   Actual (UTC +8)
   *   Actual (UTC +10)
   *   Actual (UTC -3)
   *   Actual (UTC +9:30)
   *   Created (UTC+08:00)
   *
   * This is intentionally limited to Actual and Created for now.
   */
  const match = value.match(
    /^(actual|created|raised|cleared|verified|checked\s*out)\s*\(\s*utc\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\s*\)$/i
  );

  if (!match) return null;

  const field = match[1].toLowerCase().replace(/\s+/g, '_');
  const sign = match[2];
  const hours = Number(match[3]);
  const minutes = Number(match[4] ?? 0);

  // Valid worldwide UTC offsets range from UTC-12 to UTC+14.
  // Minute validation also supports offsets such as +9:30.
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours > 14 ||
    minutes > 59
  ) {
    return null;
  }

  const minuteSuffix = minutes > 0
    ? `_${String(minutes).padStart(2, '0')}`
    : '';

  if (sign === '-') {
    return `${field}_utc_minus${hours}${minuteSuffix}`;
  }

  return `${field}_utc${hours}${minuteSuffix}`;
}

function isEmptyRow(arr) {
  return !arr || arr.every(v =>
    v === null || v === undefined || String(v).trim() === ''
  );
}