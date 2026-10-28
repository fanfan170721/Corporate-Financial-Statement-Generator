import type { Report, Source, EmployeeObservation } from "./types";

type Filing = NonNullable<Report["filings"]>[number] & { reportDate?: string };
export type CompanyContext = { profile?: Report["profile"]; filings?: Report["filings"]; sources: Source[]; retrievedAt?: string };
type Options = { fetchJson: (url: string) => Promise<unknown>; fetchText?: (url: string) => Promise<string>; currency?: string; cache?: {get(key:string):Promise<unknown>;set(key:string,value:unknown,ttl:number):Promise<void>} };
const FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "40-F", "6-K", "S-1", "F-1", "S-3", "F-3", "424B4", "424B2", "10-12B", "10-12G", "DEF 14A"]);
const ANNUAL_FORMS = new Set(["10-K", "20-F", "40-F"]);
const MAX_DOCUMENT_CHARACTERS = 17_000_000;

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

export function parseSecSubmissions(value: unknown, cik: string): { profile?: Report["profile"]; filings: Filing[]; latestAnnual?: Filing; annualFilings?: Filing[] } {
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
  for (let index = 0; index < Math.min(forms.length, 50_000); index++) {
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
  const annualFilings = [...new Map(unique.filter(filing => ANNUAL_FORMS.has(filing.form) && filing.reportDate).map(filing => [filing.reportDate, filing])).values()].sort((a,b) => b.reportDate!.localeCompare(a.reportDate!));
  return { ...(Object.keys(profile).length ? { profile } : {}), filings: unique.slice(0, 8), latestAnnual: annualFilings[0], annualFilings };
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

/** Fiscal-year labels are issuer-defined; January year-ends must not be
 * inferred from the calendar year. Accept only the filing's explicit DEI fact
 * bound to the same issuer and reporting period. */
function filingFiscalYear(html: string, periodEnd: string, cik?: string): string | undefined {
  const normalized = cik && normalizeCik(cik);
  if (!normalized) return;
  const document = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const contexts = new Set<string>();
  for (const match of document.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context\s*>/gi)) {
    const id = attributes(match[1]).id;
    const identifier = element(element(match[2], "entity") ?? "", "identifier");
    if (!id || !identifier || normalizeCik(plain(identifier)) !== normalized || /<(?:[\w.-]+:)?(?:segment|scenario)\b/i.test(match[2])) continue;
    const period = element(match[2], "period") ?? "";
    const instant = date(plain(element(period, "instant") ?? ""));
    const end = date(plain(element(period, "endDate") ?? ""));
    const start = date(plain(element(period, "startDate") ?? ""));
    const days = start && end ? (Date.parse(end) - Date.parse(start)) / 86400000 : 0;
    if ((instant === periodEnd && !end && !start) || (!instant && end === periodEnd && days >= 300 && days <= 380)) contexts.add(id);
  }
  const years = new Set<string>();
  for (const match of document.matchAll(/<(?:[\w.-]+:)?nonNumeric\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?nonNumeric\s*>/gi)) {
    const attrs = attributes(match[1]);
    const value = plain(match[2]);
    if (attrs.name?.split(":").at(-1) === "DocumentFiscalYearFocus" && contexts.has(attrs.contextref) && !attrs.continuedat && /^20\d{2}$/.test(value)) years.add(value);
  }
  return years.size === 1 ? [...years][0] : undefined;
}

export type EmployeeDisclosure = { value: number; asOf: string; basis: "total" | "full-time" | "full-time-equivalent" | "full-and-part-time"; approximate?: boolean; evidence: string; method: "annual-disclosure" };

/** Match dated issuer-wide disclosures while retaining the measurement basis.
 * FTE, full-time and full-/part-time counts are not interchangeable. No
 * regional counts, contractors or separate categories are added together.
 */
export function parseEmployeeDisclosure(html: string, options: { periodEnd: string; cik?: string; legalName?: string }): EmployeeDisclosure | undefined {
  const periodEnd = date(options.periodEnd);
  if (!periodEnd || html.length > MAX_DOCUMENT_CHARACTERS) return;
  const [year, month, day] = periodEnd.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayPattern = `0?${day}`;
  const datePattern = `(?:${months[month - 1]} ${dayPattern},? ${year}|${dayPattern} ${months[month - 1]} ${year}|${periodEnd})`;
  const fiscalYear = filingFiscalYear(html, periodEnd, options.cik);
  const datedScope = fiscalYear ? `(?:${datePattern}|the end of fiscal year ${fiscalYear})` : datePattern;
  const countPattern = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)";
  const measure = "(?:(?:(?<employeeBasis>full[- ]time[- ]equivalent|full[- ]time and part[- ]time|full[- ]time) )?employees(?: (?:worldwide|globally|in \\d{1,3} countries))?|(?<fteNoun>full[- ]time equivalents)|people on a (?<peopleBasis>full[- ]time) basis)";
  const quantity = `(?:(?<approximate>approximately|about) |a total of )?(?<count>${countPattern}) ${measure}`;
  const legalName = text(options.legalName, 200);
  const escapedName = legalName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const coreName = legalName?.replace(/(?:,?\s+(?:&\s*)?(?:co|inc|corp|corporation|ltd|limited|plc)\.?)+$/i, "").trim();
  const compactName = coreName && coreName.length >= 4 ? coreName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*") : undefined;
  const subject = `(?:we|the company|our company|the firm|the group|the company and its subsidiaries|we and our subsidiaries${escapedName ? `|${escapedName}` : ""}${compactName ? `|${compactName}` : ""})`;
  // Microsoft's annual disclosure follows its global total with two regional
  // counts. Accept this exact breakdown only if it reconciles to that total.
  const breakdown = `(?<breakdown>, (?<domestic>${countPattern}) in the U\\.S\\. and (?<international>${countPattern}) internationally|[;,] (?<research>${countPattern}) were engaged in research and development and (?<other>${countPattern}) were engaged in sales, marketing, operations, and administrative positions|, an (?:increase|decrease) of ${countPattern} employees from the prior year)`;
  const prefix = new RegExp(`^(?:as of|at) ${datedScope}\\s*,?\\s+${subject} (?:had|employed|had a total of) ${quantity}${breakdown}?\\.?$`, "i");
  const suffix = new RegExp(`^${subject} (?:had|employed|had a total of) ${quantity} (?:as of|at) ${datedScope}\\.?$`, "i");
  // Inline spans may split a word or number. Strip them without inserting
  // whitespace; block boundaries still delimit separate statements.
  const body = decode(html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<\/?(?:p|div|h[1-6]|li)\b[^>]*>/gi, ". ").replace(/<[^>]*>/g, "")).replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim();
  const observations: EmployeeDisclosure[] = [];
  // Preserve U.S. inside the sole supported regional breakdown during splitting.
  const sentenceBody = escapedName ? body.replace(new RegExp(escapedName, "gi"), name => name.replaceAll(".", "§")) : body;
  for (const sentence of sentenceBody.replace(/U\.S\./g, "U§S§").match(/[^.!?]+[.!?]?/g) ?? []) {
    const clean = sentence.replaceAll("§", ".").trim();
    if (clean.length > 350 || /contractor|temporary|seasonal|non-employee|leased|regional|excluding|including/i.test(clean)) continue;
    const match = prefix.exec(clean) ?? suffix.exec(clean);
    if (!match?.groups?.count) continue;
    const count = Number(match.groups.count.replaceAll(",", ""));
    if (!Number.isSafeInteger(count) || count < 0) continue;
    if ((match.groups.domestic || match.groups.research) && Number((match.groups.domestic ?? match.groups.research).replaceAll(",", "")) + Number((match.groups.international ?? match.groups.other).replaceAll(",", "")) !== count) continue;
    const scope = (match.groups.employeeBasis ?? match.groups.peopleBasis ?? "").toLowerCase().replaceAll(" ", "-");
    const basis: EmployeeDisclosure["basis"] = (scope === "full-time-equivalent" || match.groups.fteNoun) ? "full-time-equivalent" : scope === "full-time-and-part-time" ? "full-and-part-time" : scope === "full-time" ? "full-time" : "total";
    const evidence = match.groups.breakdown ? clean.slice(0, clean.indexOf(match.groups.breakdown)) + "…" : clean;
    if (evidence.split(/\s+/).length > 25) continue;
    observations.push({ value: count, asOf: periodEnd, basis, ...(match.groups.approximate ? { approximate: true } : {}), evidence, method: "annual-disclosure" });
  }
  if (!observations.length) return;
  // Compare conflicts only within the same measurement basis. Prefer headcount
  // over FTE when both are independently reported, without converting either.
  for (const basis of new Set(observations.map(item => item.basis))) {
    if (new Set(observations.filter(item => item.basis === basis).map(item => item.value)).size !== 1) return;
  }
  const totals = observations.filter(item => item.basis === "total" || item.basis === "full-and-part-time");
  if (new Set(totals.map(item => item.value)).size > 1) return;
  if (totals.length && observations.some(item => item.basis === "full-time" && item.value > totals[0].value)) return;
  return totals[0] ?? observations.find(item => item.basis === "full-time") ?? observations[0];
}

export async function getCompanyContext(cik: string, options: Options): Promise<CompanyContext> {
  const normalized = normalizeCik(cik);
  if (!normalized) return { sources: [] };
  const url = `https://data.sec.gov/submissions/CIK${normalized}.json`;
  let parsed: ReturnType<typeof parseSecSubmissions>;
  let submissions: unknown;
  try { submissions = await options.fetchJson(url); parsed = parseSecSubmissions(submissions, normalized); } catch { return { sources: [] }; }
  if (!parsed.profile && !parsed.filings.length) return { sources: [] };
  const retrievedAt = new Date().toISOString();
  const sources: Source[] = [{ label: "SEC EDGAR · Company profile and filing history", url, ...(parsed.filings[0] ? { asOf: parsed.filings[0].filedAt } : {}) }];
  const profile = parsed.profile ? { ...parsed.profile } : undefined;
  if (options.fetchText && profile) {
    let annuals = parsed.annualFilings ?? [];
    // Frequent filers split their history across many manifest files. Select
    // bounded date windows around earlier annual filing anniversaries; never
    // crawl the entire archive or accept URLs supplied by the response.
    const manifest = record(record(submissions)?.filings)?.files;
    const archiveFiles = (Array.isArray(manifest) ? manifest : []).flatMap(item => {
      const row = record(item);
      const name = text(row?.name, 100), from = date(row?.filingFrom), to = date(row?.filingTo);
      return name && new RegExp(`^CIK${normalized}-submissions-\\d{3,}\\.json$`).test(name) && from && to && from <= to ? [{name, from, to}] : [];
    });
    const fetched = new Set<string>();
    const mergeAnnuals = (extra: Filing[]) => {
      const all = [...annuals, ...extra].sort((a,b) => b.filedAt.localeCompare(a.filedAt));
      annuals = all.filter((filing,index) => all.findIndex(other => other.reportDate === filing.reportDate) === index).sort((a,b) => b.reportDate!.localeCompare(a.reportDate!));
    };
    const loadIndex = async (name: string) => {
      fetched.add(name);
      try {
        const history = await options.fetchJson(`https://data.sec.gov/submissions/${name}`);
        const extra = parseSecSubmissions({cik: normalized, filings: {recent: history}}, normalized);
        mergeAnnuals(extra.annualFilings ?? []);
      } catch { /* Missing archive metadata does not invalidate available years. */ }
    };
    if (!annuals.length) for (const file of [...archiveFiles].sort((a,b) => b.to.localeCompare(a.to)).slice(0,2)) {
      await loadIndex(file.name);
      if (annuals.length) break;
    }
    const latest = annuals[0];
    if (latest?.reportDate && annuals.length < 5) for (let offset = 1; offset < 5 && fetched.size < 8; offset++) {
      const year = Number(latest.reportDate.slice(0,4)) - offset;
      if (annuals.some(item => item.reportDate?.startsWith(`${year}-`))) continue;
      const target = Date.parse(`${Number(latest.filedAt.slice(0,4))-offset}${latest.filedAt.slice(4)}T00:00:00Z`);
      const distance = (file: typeof archiveFiles[number]) => Math.max(Date.parse(file.from)-target, target-Date.parse(file.to), 0);
      for (const file of archiveFiles.filter(item => !fetched.has(item.name) && distance(item) <= 60*86400000).sort((a,b) => distance(a)-distance(b)).slice(0,2)) {
        if (fetched.size >= 8) break;
        await loadIndex(file.name);
        if (annuals.some(item => item.reportDate?.startsWith(`${year}-`))) break;
      }
    }
    annuals = annuals.slice(0,5);
    const employeeHistory: EmployeeObservation[] = [];
    const unavailablePeriods: string[] = [];
    let retrievalFailures = 0;
    // Parse one large annual document at a time to bound Worker memory.
    for (const annual of annuals) try {
      const cacheKey = `sec:employees:v1:${annual.url}`;
      const cached = record(await options.cache?.get(cacheKey));
      const saved = record(cached?.observation);
      if (saved && saved.source === annual.url && saved.asOf === annual.reportDate && Number.isSafeInteger(saved.value) && Number(saved.value) >= 0) {
        const observation = saved as EmployeeObservation;
        employeeHistory.push(observation);
        sources.push({label:`${annual.form} · Reported employee count`,url:annual.url,asOf:observation.asOf});
        continue;
      }
      if (cached?.missing === true) { unavailablePeriods.push(annual.reportDate!); if(cached.retrievalFailed===true)retrievalFailures++; continue; }
      const html = await options.fetchText(annual.url);
      const fact = parseEmployeeFact(html, { periodEnd: annual.reportDate!, cik: normalized });
      const disclosure = parseEmployeeDisclosure(html, { periodEnd: annual.reportDate!, cik: normalized, legalName: profile.legalName });
      // Never silently choose between two contradictory reported totals.
      const inconsistent = fact && (disclosure?.basis === "total" || disclosure?.basis === "full-and-part-time") && fact.value !== disclosure.value;
      const employees = inconsistent ? undefined : fact ? { ...fact, basis: "total" as EmployeeDisclosure["basis"], ...(disclosure?.value === fact.value ? disclosure : {}), method: "inline-xbrl" as const } : disclosure;
      if (employees) {
        const source = { label: `${annual.form} · Reported employee count`, url: annual.url, asOf: employees.asOf };
        sources.push(source);
        employeeHistory.push({ ...employees, source: annual.url });
        // Annual documents have immutable accession URLs. Keep compact verified
        // observations, never the multi-megabyte source HTML, for thirty days.
        await options.cache?.set(cacheKey,{observation:employeeHistory.at(-1)},30*86400000).catch(()=>undefined);
      } else {
        unavailablePeriods.push(annual.reportDate!);
        await options.cache?.set(cacheKey,{missing:true},86400000).catch(()=>undefined);
      }
    } catch {
      retrievalFailures++; unavailablePeriods.push(annual.reportDate!);
      // Short failure cooldown; a temporary outage must not become a day-long miss.
      await options.cache?.set(`sec:employees:v1:${annual.url}`,{missing:true,retrievalFailed:true},60000).catch(()=>undefined);
    }
    employeeHistory.sort((a,b) => a.asOf.localeCompare(b.asOf));
    profile.employeeHistory = employeeHistory;
    profile.employeeCoverage = {annualFilings: annuals.length, extracted: employeeHistory.length, unavailablePeriods, retrievalFailures};
    if (employeeHistory.length) profile.employees = employeeHistory.at(-1);
  }
  return { ...(profile ? { profile } : {}), filings: parsed.filings, sources, retrievedAt };
}
