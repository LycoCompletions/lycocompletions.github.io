import { SCHEMAS } from './schema.js';

export function validateFileAgainstType(file, type) {
  const schema = SCHEMAS[type];
  if (!schema) return { ok: true, missing: [], groups: { anyOk: true, details: [] }, headers: [] };

  const headersArr = (file.sheets?.[0]?.headers ?? []).filter(Boolean);
  const headers = new Set(headersArr);

  // 1) Hard required
  const missing = (schema.required || []).filter(col => !headers.has(col));

  // 2) oneOfGroups → any one group should be fully present
  const groups = schema.oneOfGroups || [];
  let anyOk = true;        // default to true when there are no groups
  const details = [];

  if (groups.length > 0) {
    anyOk = false;
    for (const group of groups) {
      const missingInGroup = group.filter(col => !headers.has(col));
      const ok = missingInGroup.length === 0;
      details.push({ group, missingInGroup, ok });
      if (ok) anyOk = true;
    }
  }

  const ok = missing.length === 0 && anyOk;
  return { ok, missing, groups: { anyOk, details }, headers: headersArr };
}