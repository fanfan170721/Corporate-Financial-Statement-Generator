import type { EmployeeObservation, Report } from "./types";

export const employeeBasisLabels = {
  total: "Total employees",
  "full-time": "Full-time employees",
  "full-time-equivalent": "Full-time equivalents",
  "full-and-part-time": "Full- and part-time employees",
  unspecified: "Reported employees",
} as const;
export type EmployeeBasis = keyof typeof employeeBasisLabels;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Keep scopes separate and retain empty periods instead of implying zero or continuity. */
export function employeeTrend(profile: Report["profile"]) {
  const source = profile?.employeeHistory ?? (profile?.employees ? [profile.employees] : []);
  const groups = new Map<string, EmployeeObservation[]>();
  for (const item of source) {
    if (!validDate(item.asOf) || !Number.isFinite(item.value) || item.value < 0) continue;
    const key = `${item.asOf}:${item.basis ?? "unspecified"}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const observations = [...groups.values()].filter(items => new Set(items.map(item => item.value)).size === 1).map(items => items[0]).sort((a,b) => a.asOf.localeCompare(b.asOf));
  const bases = [...new Set(observations.map(item => item.basis ?? "unspecified"))] as EmployeeBasis[];
  const dates = new Set([...observations.map(item => item.asOf), ...(profile?.employeeCoverage?.unavailablePeriods ?? []).filter(validDate)]);
  const years = [...dates].map(value => Number(value.slice(0,4)));
  if (years.length) for (let year = Math.min(...years); year <= Math.max(...years) && year < Math.min(...years) + 30; year++) {
    if (![...dates].some(value => value.startsWith(String(year)))) dates.add(String(year));
  }
  const rows = [...dates].sort().map(date => {
    const row: {date:string; [key:string]:string|number|null} = {date};
    for (const basis of bases) row[basis] = observations.find(item => item.asOf === date && (item.basis ?? "unspecified") === basis)?.value ?? null;
    return row;
  });
  return {observations, bases, rows, historical: Array.isArray(profile?.employeeHistory)};
}
