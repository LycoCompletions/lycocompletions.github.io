// /modules/checklistDates.js

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Detect the Created and Actual date columns and their UTC offsets.
 *
 * Accepts either:
 * - a parsed sheet object containing { headers, data }
 * - an array of parsed row objects
 *
 * Supported normalized headers:
 * - actual_utc8
 * - actual_utc10
 * - actual_utc_minus3
 * - actual_utc9_30
 * - created_utc8
 * - created_utc10
 * - created_utc_minus3
 * - created_utc9_30
 */
export function detectChecklistDateContext(sheetOrRows) {
  const { headers, rows } = resolveSheetInput(sheetOrRows);

  const allHeaders = headers.length
    ? headers
    : collectHeadersFromRows(rows);

  const actualColumn =
    allHeaders.find(header => isOffsetDateHeader(header, 'actual')) ?? null;

  const createdColumn =
    allHeaders.find(header => isOffsetDateHeader(header, 'created')) ?? null;

  const actualOffsetMinutes = actualColumn
    ? parseUtcOffsetFromNormalizedHeader(actualColumn, 'actual')
    : null;

  const createdOffsetMinutes = createdColumn
    ? parseUtcOffsetFromNormalizedHeader(createdColumn, 'created')
    : null;

  /*
   * Actual is the primary reporting timestamp.
   * Created is used as a fallback if Actual is unavailable.
   */
  const reportingOffsetMinutes =
    actualOffsetMinutes ??
    createdOffsetMinutes ??
    null;

  return {
    actualColumn,
    createdColumn,
    actualOffsetMinutes,
    createdOffsetMinutes,
    reportingOffsetMinutes,

    offsetsMatch:
      actualOffsetMinutes == null ||
      createdOffsetMinutes == null ||
      actualOffsetMinutes === createdOffsetMinutes
  };
}

/**
 * Determine whether a normalized header represents an offset-based
 * Actual or Created column.
 */
export function isOffsetDateHeader(header, fieldName) {
  const field = String(fieldName ?? '')
    .trim()
    .toLowerCase();

  if (field !== 'actual' && field !== 'created') {
    return false;
  }

  const pattern = new RegExp(
    `^${field}_utc(?:minus)?\\d{1,2}(?:_\\d{2})?$`,
    'i'
  );

  return pattern.test(String(header ?? '').trim());
}

/**
 * Extract a UTC offset from a normalized parser header.
 *
 * Examples:
 * actual_utc8         -> 480
 * actual_utc10        -> 600
 * actual_utc_minus3   -> -180
 * actual_utc9_30      -> 570
 */
export function parseUtcOffsetFromNormalizedHeader(
  header,
  expectedField = null
) {
  const value = String(header ?? '')
    .trim()
    .toLowerCase();

  const match = value.match(
    /^(actual|created)_utc(minus)?(\d{1,2})(?:_(\d{2}))?$/
  );

  if (!match) return null;

  const field = match[1];
  const isNegative = match[2] === 'minus';
  const hours = Number(match[3]);
  const minutes = Number(match[4] ?? 0);

  if (
    expectedField &&
    field !== String(expectedField).trim().toLowerCase()
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

  /*
   * UTC+14 is the maximum valid positive offset.
   * An offset such as UTC+14:30 is invalid.
   */
  if (hours === 14 && minutes !== 0) {
    return null;
  }

  const totalMinutes = (hours * 60) + minutes;

  return isNegative
    ? -totalMinutes
    : totalMinutes;
}

/**
 * Return the parsed Actual timestamp for a checklist row.
 */
export function getActualTimestamp(row, context) {
  if (!row || !context?.actualColumn) return null;

  return parseChecklistTimestamp(
    row[context.actualColumn],
    context.actualOffsetMinutes
  );
}

/**
 * Return the parsed Created timestamp for a checklist row.
 */
export function getCreatedTimestamp(row, context) {
  if (!row || !context?.createdColumn) return null;

  return parseChecklistTimestamp(
    row[context.createdColumn],
    context.createdOffsetMinutes
  );
}

/**
 * Generic date field accessor.
 *
 * fieldName must be "actual" or "created".
 */
export function getChecklistTimestamp(row, fieldName, context) {
  const field = String(fieldName ?? '')
    .trim()
    .toLowerCase();

  if (field === 'actual') {
    return getActualTimestamp(row, context);
  }

  if (field === 'created') {
    return getCreatedTimestamp(row, context);
  }

  return null;
}

/**
 * Convert a checklist date value into an absolute UTC timestamp.
 *
 * The spreadsheet value represents a wall-clock date/time in the UTC
 * offset identified by its column header.
 */
export function parseChecklistTimestamp(value, offsetMinutes) {
  if (value == null || value === '') return null;

  /*
   * Excel cells parsed with SheetJS cellDates:true become Date objects.
   *
   * Spreadsheet dates do not inherently contain a timezone. We therefore
   * read the local date components and reinterpret those components using
   * the offset extracted from the spreadsheet column header.
   */
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    if (!Number.isFinite(offsetMinutes)) return null;

    return localPartsToUtcMs({
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
      millisecond: value.getMilliseconds(),
      offsetMinutes
    });
  }

  /*
   * Support raw Excel serial values if parser settings change later.
   */
  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseExcelSerial(value, offsetMinutes);
  }

  const text = String(value).trim();
  if (!text) return null;

  /*
   * If the cell contains its own Z or ±HH:MM suffix, that explicit
   * timestamp is authoritative.
   */
  if (hasExplicitOffset(text)) {
    const parsed = Date.parse(normalizeExplicitOffset(text));

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  if (!Number.isFinite(offsetMinutes)) {
    return null;
  }

  const parts = parseWallClockString(text);
  if (!parts) return null;

  return localPartsToUtcMs({
    ...parts,
    offsetMinutes
  });
}

/**
 * Return the end of the reporting-local day as UTC milliseconds.
 */
export function dayEndUtc(msUtc, offsetMinutes) {
  if (!Number.isFinite(msUtc)) return null;
  if (!Number.isFinite(offsetMinutes)) return null;

  const local = utcInstantToOffsetDate(msUtc, offsetMinutes);

  return localPartsToUtcMs({
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
    offsetMinutes
  });
}

/**
 * Return the upcoming Saturday at 23:59:59.999 in the detected
 * reporting offset, represented as UTC milliseconds.
 */
export function weekEndUtc(msUtc, offsetMinutes) {
  if (!Number.isFinite(msUtc)) return null;
  if (!Number.isFinite(offsetMinutes)) return null;

  const local = utcInstantToOffsetDate(msUtc, offsetMinutes);
  const dayOfWeek = local.getUTCDay();
  const daysToSaturday = (6 - dayOfWeek + 7) % 7;

  const localSaturdayEndAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + daysToSaturday,
    23,
    59,
    59,
    999
  );

  return localSaturdayEndAsUtc -
    (offsetMinutes * MS_PER_MINUTE);
}

/**
 * Return the end of the reporting-local month as UTC milliseconds.
 */
export function monthEndUtc(msUtc, offsetMinutes) {
  if (!Number.isFinite(msUtc)) return null;
  if (!Number.isFinite(offsetMinutes)) return null;

  const local = utcInstantToOffsetDate(msUtc, offsetMinutes);

  const localMonthEndAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  return localMonthEndAsUtc -
    (offsetMinutes * MS_PER_MINUTE);
}

/**
 * Advance from one reporting-local month-end bucket to another.
 */
export function addMonthsEndUtc(
  endUtc,
  months,
  offsetMinutes
) {
  if (!Number.isFinite(endUtc)) return null;
  if (!Number.isFinite(months)) return null;
  if (!Number.isFinite(offsetMinutes)) return null;

  const local = utcInstantToOffsetDate(
    endUtc,
    offsetMinutes
  );

  const nextMonthEndAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth() + Number(months) + 1,
    0,
    23,
    59,
    59,
    999
  );

  return nextMonthEndAsUtc -
    (offsetMinutes * MS_PER_MINUTE);
}

/**
 * Return the appropriate bucket end for a timestamp.
 */
export function keyForDateBucket(
  msUtc,
  bucket,
  offsetMinutes
) {
  switch (bucket) {
    case 'day':
      return dayEndUtc(msUtc, offsetMinutes);

    case 'week':
      return weekEndUtc(msUtc, offsetMinutes);

    case 'month':
      return monthEndUtc(msUtc, offsetMinutes);

    default:
      return weekEndUtc(msUtc, offsetMinutes);
  }
}

/**
 * Return the current period end using the detected offset.
 */
export function currentPeriodEndUtc(
  now,
  bucket,
  offsetMinutes
) {
  const nowMs = now instanceof Date
    ? now.getTime()
    : Number(now);

  if (!Number.isFinite(nowMs)) return null;

  return keyForDateBucket(
    nowMs,
    bucket,
    offsetMinutes
  );
}

/**
 * Enumerate reporting bucket end timestamps.
 */
export function enumerateDatePeriods(
  startEndUtc,
  endEndUtc,
  bucket,
  offsetMinutes
) {
  if (
    !Number.isFinite(startEndUtc) ||
    !Number.isFinite(endEndUtc)
  ) {
    return [];
  }

  const output = [];

  if (bucket === 'month') {
    let cursor = startEndUtc;

    while (cursor <= endEndUtc) {
      output.push(cursor);

      cursor = addMonthsEndUtc(
        cursor,
        1,
        offsetMinutes
      );
    }

    return output;
  }

  const stepDays = bucket === 'day' ? 1 : 7;
  const stepMs = stepDays * MS_PER_DAY;

  for (
    let cursor = startEndUtc;
    cursor <= endEndUtc;
    cursor += stepMs
  ) {
    output.push(cursor);
  }

  return output;
}

/**
 * Format a bucket label using the detected source offset.
 */
export function labelForDateBucket(
  endUtc,
  bucket,
  offsetMinutes
) {
  if (!Number.isFinite(endUtc)) return '';

  const local = utcInstantToOffsetDate(
    endUtc,
    offsetMinutes
  );

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr',
    'May', 'Jun', 'Jul', 'Aug',
    'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const month = months[local.getUTCMonth()];
  const day = String(local.getUTCDate())
    .padStart(2, '0');

  const year = local.getUTCFullYear();

  if (bucket === 'month') {
    return `${month} ${year}`;
  }

  return `${day} ${month} ${year}`;
}

/**
 * Format an offset for logging and validation messages.
 */
export function formatUtcOffset(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) {
    return 'Unknown UTC offset';
  }

  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  if (minutes === 0) {
    return `UTC ${sign}${hours}`;
  }

  return `UTC ${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

/* ============================================================
 * Internal helpers
 * ============================================================ */

/**
 * Accept either a sheet object or an array of row objects.
 */
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
      if (key) headers.add(key);
    }

    /*
     * All parsed rows should share the same keys, so the first populated
     * row is normally sufficient.
     */
    if (headers.size) break;
  }

  return [...headers];
}

function parseExcelSerial(serial, offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) return null;

  /*
   * Excel's common 1900 date system uses 1899-12-30 as the practical
   * conversion epoch.
   */
  const excelEpochAsUtc = Date.UTC(1899, 11, 30);
  const localAsUtc = excelEpochAsUtc +
    (serial * MS_PER_DAY);

  return Math.round(
    localAsUtc -
    (offsetMinutes * MS_PER_MINUTE)
  );
}

function parseWallClockString(text) {
  let match;

  /*
   * MM/DD/YYYY HH:mm[:ss]
   *
   * This matches the sample checklist values such as:
   * 02/14/2025 09:15:18
   */
  match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (match) {
    return validatedDateParts({
      year: Number(match[3]),
      month: Number(match[1]),
      day: Number(match[2]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? 0),
      millisecond: 0
    });
  }

  /*
   * YYYY-MM-DD HH:mm[:ss]
   * YYYY-MM-DDTHH:mm[:ss]
   */
  match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (match) {
    return validatedDateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? 0),
      millisecond: 0
    });
  }

  /*
   * MM/DD/YYYY, date only.
   */
  match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (match) {
    return validatedDateParts({
      year: Number(match[3]),
      month: Number(match[1]),
      day: Number(match[2]),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    });
  }

  /*
   * YYYY-MM-DD, date only.
   */
  match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (match) {
    return validatedDateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    });
  }

  return null;
}

function validatedDateParts(parts) {
  const {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond
  } = parts;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(millisecond)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return null;
  }

  /*
   * Confirm that JavaScript did not roll an invalid date such as
   * 31 February into the following month.
   */
  const check = new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond
  ));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return parts;
}

function localPartsToUtcMs({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  offsetMinutes
}) {
  const localAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond
  );

  return localAsUtc -
    (offsetMinutes * MS_PER_MINUTE);
}

function utcInstantToOffsetDate(msUtc, offsetMinutes) {
  return new Date(
    msUtc +
    (offsetMinutes * MS_PER_MINUTE)
  );
}

function hasExplicitOffset(value) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function normalizeExplicitOffset(value) {
  /*
   * Convert trailing +0800 into +08:00 for consistent Date.parse support.
   */
  return String(value).replace(
    /([+-]\d{2})(\d{2})$/,
    '$1:$2'
  );
}