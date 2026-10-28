import type { Report, Source } from "./types";

type Filing = NonNullable<Report["filings"]>[number] & { reportDate?: string };
export type CompanyContext = { profile?: Report["profile"]; filings?: Report["filings"]; sources: Source[]; retrievedAt?: string };
type Options = { fetchJson: (url: string) => Promise<unknown>; fetchText?: (url: string) => Promise<string>; currency?: string };
const FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "40-F", "6-K", "S-1", "F-1", "S-3", "F-3", "424B4", "424B2", "10-12B", "10-12G", "DEF 14A"]);
const ANNUAL_FORMS = new Set(["10-K", "20-F", "40-F"]);
const MAX_DOCUMENT_CHARACTERS = 10_000_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function date(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : undefined;
}
function text(value: unknown, maximum = 500): string | undefined {
  if (typeof value !== "string") return;
  const result = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return result && result.length <= maximum ? result : undefined;
}

export function normalizeCik(value: string): string | undefined {
  if (!/^\d{1,10}$/.test(value) || Number(value) === 0) return;
  return value.padStart(10, "0");
}

/** Construct only SEC archive paths; document names cannot supply another URL or path. */
export function filingDocumentUrl(cik: string, accession: unknown, document: unknown): string | undefined {
  const normalized = normalizeCik(cik);
  if (!normalized || typeof accession !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) return;
  if (typeof document !== "string" || document.length > 200 || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.html?$/i.test(document) || document.includes("..")) return;
  return `https://www.sec.gov/Archives/edgar/data/${Number(normalized)}/${accession.replaceAll("-", "")}/${document}`;
}

function safeWebsite(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".") || /^(localhost|127\.|0\.)/i.test(url.hostname)) return;
    return url.href;
  } catch { return; }
}

export function parseSecSubmissions(value: unknown, cik: string): { profile?: Report["profile"]; filings: Filing[]; latestAnnual?: Filing } {
  const body = record(value);
  const normalized = normalizeCik(cik);
  if (!body || !normalized || normalizeCik(String(body.cik ?? "")) !== normalized) return { filings: [] };
  const profile: NonNullable<Report["profile"]> = {};
  const legalName = text(body.name);
  if (legalName) profile.legalName = legalName;
  profile.cik = normalized;
  if (/^\d{4}$/.test(String(body.sic ?? ""))) profile.sic = String(body.sic);
  const fiscalYearEnd = String(body.fiscalYearEnd ?? "");
  if (/^\d{4}$/.test(fiscalYearEnd) && date(`2000-${fiscalYearEnd.slice(0, 2)}-${fiscalYearEnd.slice(2)}`)) profile.fiscalYearEnd = fiscalYearEnd;
  const country = text(record(record(body.addresses)?.business)?.stateOrCountryDescription, 120);
  // SEC uses this field for either a state or country: retain the source label.
  if (country) profile.country = country;
  const industry = text(body.sicDescription);
  const description = text(body.description, 4000);
  const website = safeWebsite(body.website);
  if (industry) { profile.industry = industry; profile.sicDescription = industry; }
  if (description) profile.description = description;
  if (website) profile.website = website;
  const recent = record(record(body.filings)?.recent);
  const forms = Array.isArray(recent?.form) ? recent.form : [];
  const column = (name: string, index: number) => Array.isArray(recent?.[name]) ? recent[name][index] : undefined;
  const filings: Filing[] = [];
  // Submissions may contain many years. A bounded scan supplies the recent feed
  // and finds the latest annual document even after frequent current reports.
  for (let index = 0; index < Math.min(forms.length, 3000); index++) {
    const form = forms[index];
    if (typeof form !== "string" || !FORMS.has(form)) continue;
    const filedAt = date(column("filingDate", index));
    const reportDate = date(column("reportDate", index));
    const url = filingDocumentUrl(normalized, column("accessionNumber", index), column("primaryDocument", index));
    if (!filedAt || !url || (reportDate && reportDate > filedAt)) continue;
    const title = `${form} · ${ANNUAL_FORMS.has(form) ? "Annual filing" : form === "10-Q" ? "Quarterly filing" : "Company filing"}`;
    filings.push({ title, form, filedAt, url, ...(reportDate ? { reportDate } : {}) });
  }
  filings.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  const unique = [...new Map(filings.map(filing => [filing.url, filing])).values()];
  return { ...(Object.keys(profile).length ? { profile } : {}), filings: unique.slice(0, 8), latestAnnual: unique.find(filing => ANNUAL_FORMS.has(filing.form) && filing.reportDate) };
}

function decode(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, entity: string) => {
    const point = entity[0].toLowerCase() === "x" ? parseInt(entity.slice(1), 16) : Number(entity);
    return point <= 0x10ffff && point > 0 ? String.fromCodePoint(point) : "";
  }).replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, name: string) => ({ nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[name.toLowerCase()]!);
}
function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
  return result;
}
function plain(value: string): string {
  return decode(value.replace(/<(?:[\w.-]+:)?exclude\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?exclude\s*>/gi, "").replace(/<[^>]*>/g, "")).trim();
}
function element(body: string, name: string): string | undefined {
  return new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`, "i").exec(body)?.[1];
}

function numericFact(body: string, attrs: Record<string, string>): number | undefined {
  if (attrs.sign && attrs.sign !== "+") return;
  if (attrs["xsi:nil"] === "true" || attrs["xsi:nil"] === "1" || attrs.continuedat) return;
  const format = attrs.format?.split(":").at(-1)?.toLowerCase();
  if (format && !["num-dot-decimal", "numdotdecimal", "num-comma-decimal", "numcommadecimal"].includes(format)) return;
  let value = plain(body);
  const commaDecimal = format === "num-comma-decimal" || format === "numcommadecimal";
  const pattern = commaDecimal ? /^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?: \d{3})+)(?:,\d+)?$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)(?:\.\d+)?$/;
  if (!pattern.test(value)) return;
  value = commaDecimal ? value.replace(/[. ]/g, "").replace(",", ".") : value.replace(/[, ]/g, "");
  const scale = attrs.scale ?? "0";
  if (!/^[+-]?\d{1,2}$/.test(scale) || Math.abs(Number(scale)) > 9) return;
  const result = Number(value) * 10 ** Number(scale);
  return Number.isSafeInteger(result) && result >= 0 ? result : undefined;
}

/** Read explicit, undimensioned employee facts from the matching annual period.
 * Narrative numbers, regional subsets, other periods and unrecognised units are
 * deliberately not used. The caller supplies the SEC filing's reporting date.
 */
export function parseEmployeeFact(html: string, options: { periodEnd: string; cik: string }): { value: number; asOf: string } | undefined {
  const periodEnd = date(options.periodEnd);
  const cik = normalizeCik(options.cik);
  if (!periodEnd || !cik || html.length > MAX_DOCUMENT_CHARACTERS) return;
  const document = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const contexts = new Set<string>();
  for (const match of document.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context\s*>/gi)) {
    const id = attributes(match[1]).id;
    if (!id || /<(?:[\w.-]+:)?(?:segment|scenario)\b/i.test(match[2])) continue;
    const entity = element(match[2], "entity");
    const identifier = entity && element(entity, "identifier");
    if (!identifier || normalizeCik(plain(identifier)) !== cik) continue;
    const period = element(match[2], "period");
    if (!period) continue;
    const instant = date(plain(element(period, "instant") ?? ""));
    const end = date(plain(element(period, "endDate") ?? ""));
    const start = date(plain(element(period, "startDate") ?? ""));
    if (instant === periodEnd && !end && !start) contexts.add(id);
    if (!instant && end === periodEnd && start) {
      const days = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (days >= 300 && days <= 380) contexts.add(id);
    }
  }
  const units = new Set<string>();
  for (const match of document.matchAll(/<(?:[\w.-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?unit\s*>/gi)) {
    const id = attributes(match[1]).id;
    if (!id || /<(?:[\w.-]+:)?divide\b/i.test(match[2])) continue;
    const measures = [...match[2].matchAll(/<(?:[\w.-]+:)?measure\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?measure\s*>/gi)];
    if (measures.length === 1 && /^(?:[\w.-]+:)?(?:pure|employees|headcount)$/i.test(plain(measures[0][1]))) units.add(id);
  }
  const values = new Set<number>();
  for (const match of document.matchAll(/<(?:[\w.-]+:)?nonFraction\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?nonFraction\s*>/gi)) {
    const attrs = attributes(match[1]);
    const concept = attrs.name?.split(":").at(-1);
    if (!["NumberOfEmployees", "EntityNumberOfEmployees"].includes(concept ?? "") || !contexts.has(attrs.contextref) || !units.has(attrs.unitref)) continue;
    const value = numericFact(match[2], attrs);
    if (value !== undefined) values.add(value);
  }
  // Conflicting total facts need interpretation; they are not resolved by
  // taking the largest count or silently selecting document order.
  return values.size === 1 ? { value: [...values][0], asOf: periodEnd } : undefined;
}

export type EmployeeDisclosure = { value: number; asOf: string; basis: "total" | "full-time"; evidence: string; method: "annual-disclosure" };

/** A narrow fallback for a dated issuer-wide statement, not a general scraper.
 * A number elsewhere on the page, salary figure, regional count or count of
 * contractors cannot satisfy these sentence templates. No counts are added.
 */
export function parseEmployeeDisclosure(html: string, options: { periodEnd: string }): EmployeeDisclosure | undefined {
  const periodEnd = date(options.periodEnd);
  if (!periodEnd || html.length > MAX_DOCUMENT_CHARACTERS) return;
  const [year, month, day] = periodEnd.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // The date must be the reporting date supplied by SEC, not another number
  // nearby or an assumed year inferred from the document's publication date.
  const dayPattern = `0?${day}`;
  const datePattern = `(?:${months[month - 1]} ${dayPattern},? ${year}|${dayPattern} ${months[month - 1]} ${year}|${periodEnd})`;
  const quantity = "(?:approximately |about |a total of )?(?<count>\\d{1,3}(?:,\\d{3})+|\\d+) (?:(?<basis>full[- ]time) )?employees(?: (?:worldwide|globally))?";
  const subject = "(?:we|the company|our company|the company and its subsidiaries)";
  const prefix = new RegExp(`^(?:as of|at) ${datePattern},? ${subject} (?:had|employed|had a total of) ${quantity}\\.?$`, "i");
  const suffix = new RegExp(`^${subject} (?:had|employed|had a total of) ${quantity} (?:as of|at) ${datePattern}\\.?$`, "i");
  const body = decode(html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<\/?(?:p|div|h[1-6]|li)\b[^>]*>/gi, ". ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const observations: EmployeeDisclosure[] = [];
  for (const sentence of body.match(/[^.!?]+[.!?]?/g) ?? []) {
    const clean = sentence.trim();
    if (clean.length > 350 || /contractor|temporary|seasonal|non-employee|leased|regional|domestic|united states|canada|europe|asia|excluding|including/i.test(clean)) continue;
    const match = prefix.exec(clean) ?? suffix.exec(clean);
    if (!match?.groups?.count) continue;
    const count = Number(match.groups.count.replaceAll(",", ""));
    if (!Number.isSafeInteger(count) || count < 0) continue;
    // Keep only a short original statement as evidence. Longer statements are
    // omitted rather than shortened in a way that could remove qualifiers.
    if (clean.split(/\s+/).length > 25) continue;
    observations.push({ value: count, asOf: periodEnd, basis: match.groups.basis ? "full-time" : "total", evidence: clean, method: "annual-disclosure" });
  }
  if (!observations.length) return;
  const total = observations.filter(observation => observation.basis === "total");
  const chosen = total.length ? total : observations;
  if (new Set(chosen.map(observation => observation.value)).size !== 1) return;
  // A total below an explicitly reported full-time count is contradictory.
  if (total.length && observations.some(observation => observation.basis === "full-time" && observation.value > total[0].value)) return;
  return chosen[0];
}

export async function getCompanyContext(cik: string, options: Options): Promise<CompanyContext> {
  const normalized = normalizeCik(cik);
  if (!normalized) return { sources: [] };
  const url = `https://data.sec.gov/submissions/CIK${normalized}.json`;
  let parsed: ReturnType<typeof parseSecSubmissions>;
  try { parsed = parseSecSubmissions(await options.fetchJson(url), normalized); } catch { return { sources: [] }; }
  if (!parsed.profile && !parsed.filings.length) return { sources: [] };
  const retrievedAt = new Date().toISOString();
  const sources: Source[] = [{ label: "SEC EDGAR · Company profile and filing history", url, ...(parsed.filings[0] ? { asOf: parsed.filings[0].filedAt } : {}) }];
  const profile = parsed.profile ? { ...parsed.profile } : undefined;
  if (parsed.latestAnnual?.reportDate && options.fetchText) {
    try {
      const annual = parsed.latestAnnual;
      const html = await options.fetchText(annual.url);
      const fact = parseEmployeeFact(html, { periodEnd: annual.reportDate!, cik: normalized });
      const disclosure = parseEmployeeDisclosure(html, { periodEnd: annual.reportDate! });
      // Never silently choose between two contradictory reported totals.
      const inconsistent = fact && disclosure?.basis === "total" && fact.value !== disclosure.value;
      const employees = inconsistent ? undefined : fact ? { ...fact, basis: "total" as const, method: "inline-xbrl" as const } : disclosure;
      if (employees) {
        const source = { label: `${annual.form} · Reported employee count`, url: annual.url, asOf: employees.asOf };
        sources.push(source);
        return { profile: { ...profile, employees: { ...employees, source: annual.url } }, filings: parsed.filings, sources, retrievedAt };
      }
    } catch { /* Optional enrichment must not prevent financial report generation. */ }
  }
  return { ...(profile ? { profile } : {}), filings: parsed.filings, sources, retrievedAt };
}
