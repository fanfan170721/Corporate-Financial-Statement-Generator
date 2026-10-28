import type { EmployeeObservation, EmployeeResearch, Report } from "./types";

export const employeeBasisLabels = {
  total: "Total employees",
  "full-time": "Full-time employees",
  "full-time-equivalent": "Full-time equivalents",
  "full-and-part-time": "Full- and part-time employees",
  "secondary-unspecified": "Secondary source · scope unspecified",
  unspecified: "Reported employees",
} as const;
export type EmployeeBasis = keyof typeof employeeBasisLabels;
export function employeeObservationBasis(item: EmployeeObservation): EmployeeBasis {
  return item.basis ?? (item.method === "public-directory" ? "secondary-unspecified" : "unspecified");
}
export function employeeSourceType(item: EmployeeObservation): string {
  if (item.method === "public-directory" && /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+(?:#|$)/.test(item.source)) return "Community-maintained public data";
  if (item.method === "public-directory") return "Public company directory";
  if (item.method === "issuer-website") return "Company website";
  if (item.method === "inline-xbrl" || item.method === "annual-disclosure") return "Annual filing";
  return "Reported source";
}
export const employeeSourceLabel = (item: EmployeeObservation) => item.sourceLabel || employeeSourceType(item);
export function employeeHeadline(item: EmployeeObservation): string {
  const basis = employeeObservationBasis(item);
  return ({total:"REPORTED TOTAL EMPLOYEES", "full-time":"REPORTED FULL-TIME EMPLOYEES", "full-time-equivalent":"REPORTED FULL-TIME EQUIVALENTS", "full-and-part-time":"REPORTED FULL- AND PART-TIME EMPLOYEES", "secondary-unspecified":"PUBLICLY REPORTED WORKFORCE", unspecified:"PUBLICLY REPORTED WORKFORCE"})[basis];
}
export const employeeResearchStatusLabels: Record<EmployeeResearch["steps"][number]["status"], string> = {
  used: "Workforce data added",
  "no-data": "No dated workforce data found",
  blocked: "Source access restricted",
  unavailable: "Source unavailable",
  "identity-mismatch": "Company identity could not be confirmed",
  conflict: "Conflicting figures excluded",
  skipped: "Not checked in this run",
};
export const employeeResearchStatusLabel = (step: EmployeeResearch["steps"][number]) => step.status === "used" && step.observations == null ? "Company identity confirmed" : employeeResearchStatusLabels[step.status];
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Keep scopes separate and retain empty periods instead of implying zero or continuity. */
export function employeeTrend(profile: Report["profile"]) {
  const source = profile?.employeeHistory ?? (profile?.employees ? [profile.employees] : []);
  const groups = new Map<string, EmployeeObservation[]>();
  for (const item of source) {
    if (!validDate(item.asOf) || !Number.isFinite(item.value) || item.value < 0) continue;
    const key = `${item.asOf}:${employeeObservationBasis(item)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const observations = [...groups.values()].filter(items => new Set(items.map(item => item.value)).size === 1).map(items => items[0]).sort((a,b) => a.asOf.localeCompare(b.asOf));
  const bases = [...new Set(observations.map(employeeObservationBasis))];
  const dates = new Set([...observations.map(item => item.asOf), ...(profile?.employeeCoverage?.unavailablePeriods ?? []).filter(validDate)]);
  const years = [...dates].map(value => Number(value.slice(0,4)));
  if (years.length) for (let year = Math.min(...years); year <= Math.max(...years) && year < Math.min(...years) + 30; year++) {
    if (![...dates].some(value => value.startsWith(String(year)))) dates.add(String(year));
  }
  const rows = [...dates].sort().map(date => {
    const row: {date:string; [key:string]:string|number|null} = {date};
    for (const basis of bases) row[basis] = observations.find(item => item.asOf === date && employeeObservationBasis(item) === basis)?.value ?? null;
    return row;
  });
  return {observations, bases, rows, historical: Array.isArray(profile?.employeeHistory)};
}
