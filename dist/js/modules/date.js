// Excel serial date (days since 1899-12-30) → "YYYY-MM-DD"
export function excelSerialToISODateString(n) {
  const base = new Date(Date.UTC(1899, 11, 30));
  const millis = Math.round((Number(n) || 0) * 86400000);
  const d = new Date(base.getTime() + millis);
  return d.toISOString().slice(0, 10);
}

// Normalize many date forms to "YYYY-MM-DD"
// - Accepts Excel serials
// - Strips "(UTC +8)" / "UTC +8"
// - Parses common ISO, D/M/Y, etc.
export function normalizeToISODateOnly(v) {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw) return null;

  // Excel serial (int or float)
  if (/^\d+(\.\d+)?$/.test(raw)) return excelSerialToISODateString(Number(raw));

  // Remove any "(UTC +8)" or "UTC +8"
  let s = raw
    .replace(/\(.*?UTC\s*\+?8.*?\)/i, '')
    .replace(/\bUTC\s*\+?8\b/i, '')
    .trim();

  // ISO-like YYYY-MM-DD or YYYY/MM/DD
  const mIso = s.match(/^(\d{4})-/-/$/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;

  // D/M/YYYY or DD/MM/YYYY with "/", ".", or "-"
  const mDmy = s.match(/^(\d{1,2})\/\.\-\/\.\-$/);
  if (mDmy) {
    const d = mDmy[1].padStart(2, '0');
    const mo = mDmy[2].padStart(2, '0');
    const y = mDmy[3];
    return `${y}-${mo}-${d}`;
  }

  // Fallback parse
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const da = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  return null;
}

export function parseISODateUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1)));
}

export function fmtYMDUTC(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Monday-start week
export function startOfISOWeekYMD(isoYMD) {
  const d = parseISODateUTC(isoYMD);
  const dow = d.getUTCDay();           // 0..6 (Sun..Sat)
  const offset = dow === 0 ? -6 : (1 - dow); // Monday start
  return fmtYMDUTC(new Date(d.getTime() + offset * 86400000));
}

// Last day of month
export function endOfMonthYMD(isoYMD) {
  const d = parseISODateUTC(isoYMD);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0));
  return fmtYMDUTC(last);
}