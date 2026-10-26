const CORRUPT_NAME = /(avatar|dashboard|centro escolar|panel directora)/i;

export function normalizeSchoolYearName(yearOrName, fallback = 'Año escolar') {
  const year = yearOrName && typeof yearOrName === 'object' ? yearOrName : null;
  const raw = year ? year.name : yearOrName;
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name && name.length <= 120 && !CORRUPT_NAME.test(name)) return name;

  const start = year?.start_date || year?.start;
  const end = year?.end_date || year?.end;
  const startYear = /^\d{4}/.test(String(start || '')) ? String(start).slice(0, 4) : null;
  const endYear = /^\d{4}/.test(String(end || '')) ? String(end).slice(0, 4) : null;

  if (startYear) return endYear && endYear !== startYear ? `${startYear}-${endYear}` : startYear;
  return fallback;
}
