// /modules/punchdates.js

import {
  parseChecklistTimestamp
} from './checklistdates.js';

const PUNCH_DATE_FIELDS = [
  'raised',
  'cleared',
  'verified',
  'checked_out'
];

/**
 * Detect the available Punch date columns and their UTC offsets.
 *
 * Accepts either:
 * - a parsed sheet containing { headers, data }
 * - an array of parsed row objects
 *
 * Supported normalized headers include:
 * - raised_utc8
 * - cleared_utc10
 * - verified_utc9_30
 * - checked_out_utc_minus3
 */
export function detectPunchDateContext(sheetOrRows) {
  const { headers, rows } = resolveSheetInput(sheetOrRows);

  const allHeaders = headers.length
    ? headers
    : collectHeadersFromRows(rows);

  const context = {};

  for (const field of PUNCH_DATE_FIELDS) {
    const column =
      allHeaders.find(header =>
        isPunchDateHeader(header, field)
      ) ?? null;

    const offsetMinutes = column
      ? parsePunchUtcOffsetFromHeader(column, field)
      : null;

    context[`${camelCaseField(field)}Column`] =
      column;

    context[`${camelCaseField(field)}OffsetMinutes`] =
      offsetMinutes;
  }

  /*
   * The Punch Cumulative chart is driven by Verified dates,
   * so Verified is the primary reporting offset.
   *
   * Other offsets are fallbacks in case Verified is unavailable.
   */
  const reportingOffsetMinutes =
    context.verifiedOffsetMinutes ??
    context.clearedOffsetMinutes ??
    context.raisedOffsetMinutes ??
    context.checkedOutOffsetMinutes ??
    null;

  const detectedOffsets = [
    context.raisedOffsetMinutes,
    context.clearedOffsetMinutes,
    context.verifiedOffsetMinutes,
    context.checkedOutOffsetMinutes
  ].filter(Number.isFinite);

  const uniqueOffsets =
    new Set(detectedOffsets);

  return {
    ...context,
    reportingOffsetMinutes,
    offsetsMatch: uniqueOffsets.size <= 1
  };
}

/**
 * Determine whether a normalized header represents one of the
 * supported Punch date fields.
 */
export function isPunchDateHeader(
  header,
  fieldName
) {
  const field = normalizeFieldName(fieldName);

  if (!PUNCH_DATE_FIELDS.includes(field)) {
    return false;
  }

  const pattern = new RegExp(
    `^${field}_utc(?:minus)?\\d{1,2}(?:_\\d{2})?$`,
    'i'
  );

  return pattern.test(
    String(header ?? '').trim()
  );
}

/**
 * Extract the UTC offset from a normalized Punch date header.
 *
 * Examples:
 * verified_utc8           -> 480
 * verified_utc10          -> 600
 * verified_utc9_30        -> 570
 * verified_utc_minus3     -> -180
 * checked_out_utc_minus5  -> -300
 */
export function parsePunchUtcOffsetFromHeader(
  header,
  expectedField = null
) {
  const value = String(header ?? '')
    .trim()
    .toLowerCase();

  const match = value.match(
    /^(raised|cleared|verified|checked_out)_utc(minus)?(\d{1,2})(?:_(\d{2}))?$/
  );

  if (!match) return null;

  const field = match[1];
  const isNegative = match[2] === 'minus';
  const hours = Number(match[3]);
  const minutes = Number(match[4] ?? 0);

  if (
    expectedField &&
    field !== normalizeFieldName(expectedField)
  ) {
    return null;
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours > 14 ||
    minutes > 59
  ) {
    return null;
  }

  // UTC+14 is valid, but UTC+14:30 is not.
  if (hours === 14 && minutes !== 0) {
    return null;
  }

  const totalMinutes =
    (hours * 60) + minutes;

  return isNegative
    ? -totalMinutes
    : totalMinutes;
}

/**
 * Return a parsed Raised timestamp.
 */
export function getRaisedTimestamp(
  row,
  context
) {
  return getPunchTimestamp(
    row,
    'raised',
    context
  );
}

/**
 * Return a parsed Cleared timestamp.
 */
export function getClearedTimestamp(
  row,
  context
) {
  return getPunchTimestamp(
    row,
    'cleared',
    context
  );
}

/**
 * Return a parsed Verified timestamp.
 */
export function getVerifiedTimestamp(
  row,
  context
) {
  return getPunchTimestamp(
    row,
    'verified',
    context
  );
}

/**
 * Return a parsed Checked Out timestamp.
 */
export function getCheckedOutTimestamp(
  row,
  context
) {
  return getPunchTimestamp(
    row,
    'checked_out',
    context
  );
}

/**
 * Generic Punch date accessor.
 *
 * fieldName can be:
 * - raised
 * - cleared
 * - verified
 * - checked_out
 * - checked out
 */
export function getPunchTimestamp(
  row,
  fieldName,
  context
) {
  if (!row || !context) return null;

  const field = normalizeFieldName(fieldName);

  if (!PUNCH_DATE_FIELDS.includes(field)) {
    return null;
  }

  const propertyPrefix =
    camelCaseField(field);

  const column =
    context[`${propertyPrefix}Column`];

  const offsetMinutes =
    context[`${propertyPrefix}OffsetMinutes`];

  if (
    !column ||
    !Number.isFinite(offsetMinutes)
  ) {
    return null;
  }

  return parseChecklistTimestamp(
    row[column],
    offsetMinutes
  );
}

/**
 * Format an offset for diagnostics.
 */
export function formatPunchUtcOffset(
  offsetMinutes
) {
  if (!Number.isFinite(offsetMinutes)) {
    return 'Unknown UTC offset';
  }

  const sign =
    offsetMinutes < 0 ? '-' : '+';

  const absolute =
    Math.abs(offsetMinutes);

  const hours =
    Math.floor(absolute / 60);

  const minutes =
    absolute % 60;

  if (minutes === 0) {
    return `UTC ${sign}${hours}`;
  }

  return `UTC ${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

/* ---------------- Internal helpers ---------------- */

function resolveSheetInput(sheetOrRows) {
  if (Array.isArray(sheetOrRows)) {
    return {
      headers: [],
      rows: sheetOrRows
    };
  }

  return {
    headers: Array.isArray(sheetOrRows?.headers)
      ? sheetOrRows.headers.filter(Boolean)
      : [],

    rows: Array.isArray(sheetOrRows?.data)
      ? sheetOrRows.data
      : []
  };
}

function collectHeadersFromRows(rows) {
  const headers = new Set();

  for (const row of rows ?? []) {
    for (const key of Object.keys(row ?? {})) {
      if (key) {
        headers.add(key);
      }
    }

    // Parsed rows normally share the same keys.
    if (headers.size) break;
  }

  return [...headers];
}

function normalizeFieldName(fieldName) {
  return String(fieldName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function camelCaseField(fieldName) {
  return normalizeFieldName(fieldName)
    .replace(
      /_([a-z])/g,
      (_, letter) => letter.toUpperCase()
    );
}