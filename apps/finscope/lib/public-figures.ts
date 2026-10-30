import { normalizeCompanySearch } from "./company-search";
import type { PublicFigure, PublicFigures } from "./types";

/** Fetches one JSON document from the fixed Wikipedia API origin. */
export type WikiFetch = (url: string) => Promise<unknown>;

const API = "https://en.wikipedia.org/w/api.php";
const FIELDS: [string, PublicFigure["key"]][] = [["revenue", "revenue"], ["operating_income", "operatingIncome"], ["net_income", "netIncome"], ["assets", "assets"], ["aum", "aum"], ["equity", "equity"], ["num_employees", "employees"]];
const LOCATION_FIELDS = ["hq_location", "hq_location_city", "hq_location_country", "headquarters", "location", "location_city", "hq"];
// People, places and products also have infoboxes; only organization summaries are accepted.
const ORGANIZATION_INFOBOX = /^infobox[ _](company|organi[sz]ation|bank|fund|pension|government agency|public company|private company|corporation|institution|investment|non-profit|financial|insurance|state-owned|cooperative|co-operative|conglomerate)/i;
const TREND_TEMPLATES = /^(increase|decrease|steady|increasenegative|decreasepositive|increasepositive|decreasenegative|up|down|nochange|gain|loss)$/;
const CURRENCIES: Record<string, string> = { euro: "€", "€": "€", eur: "€", "us$": "US$", usd: "US$", cad: "C$", "c$": "C$", "ca$": "C$", gbp: "£", "£": "£", jpy: "¥", "¥": "¥", yen: "¥", aud: "A$", "a$": "A$", inr: "₹", "₹": "₹", cny: "CN¥", rmb: "CN¥", krw: "₩", chf: "CHF ", sek: "SEK ", nok: "NOK ", dkk: "DKK ", hkd: "HK$", sgd: "S$", brl: "R$", mxn: "MX$", nzd: "NZ$", twd: "NT$", zar: "R", rub: "₽" };
const LONG_FORMS: [RegExp, string][] = [[/gesellschaft mit beschr(?:ä|a)nkter haftung/i, "GmbH"], [/aktiengesellschaft/i, "AG"], [/soci(?:é|e)t(?:é|e) anonyme/i, "SA"], [/public limited company/i, "plc"], [/limited liability company/i, "LLC"]];
const LEGAL_SUFFIX = /[\s,]+(?:inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|llc|l\.?p\.?|llp|plc|gmbh|ag|s\.?a\.?|se|n\.?v\.?|b\.?v\.?|ab|asa|oyj|s\.?p\.?a\.?|trust fund|fund|board|trust)$/i;
const LOWER_WORDS = new Set(["of", "and", "the", "for", "de", "du", "des", "la", "le", "et"]);

function templateEnd(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length - 1; index++) {
    if (text.startsWith("{{", index)) { depth++; index++; }
    else if (text.startsWith("}}", index)) { depth--; index++; if (depth === 0) return index + 1; }
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let index = 0; index < text.length; index++) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{" || pair === "[[") { depth++; index++; }
    else if ((pair === "}}" || pair === "]]") && depth > 0) { depth--; index++; }
    else if (text[index] === "|" && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  return [...parts, text.slice(start)];
}

function citationUrl(reference: string | undefined): string | undefined {
  const url = reference?.match(/\burl\s*=\s*(https?:\/\/[^\s|}<]+)/i)?.[1] ?? reference?.match(/https?:\/\/[^\s|\]}<]+/)?.[0];
  return url && !/web\.archive\.org|archive\.(?:today|ph|is)/i.test(url) ? url : undefined;
}

function renderTemplate(inner: string): string {
  const parts = inner.split("|").map(part => part.trim());
  const name = parts[0].toLowerCase().replace(/_/g, " ").trim();
  const positional = parts.slice(1).filter(part => !/^[a-z][\w -]*=/i.test(part));
  const compact = name.replace(/\s/g, "");
  if (TREND_TEMPLATES.test(compact)) return "";
  if (CURRENCIES[name] !== undefined) return `${CURRENCIES[name]}${positional[0] ?? ""}`;
  if (/^start date|^founded|^birth date|^date$/.test(name)) return positional.find(part => /^\d{4}$/.test(part)) ?? "";
  if (/^(cite|citation|efn|refn|sfn|r|rp|cn|citation needed|clarify|when|dubious|update|better source)/.test(name)) return "";
  if (name === "as of") return `as of ${positional.join(" ")}`;
  if (name === "lang") return positional[1] ?? "";
  if (/^(plainlist|plain list|ubl|unbulleted list|flatlist|hlist)$/.test(name)) return positional.join("; ").replace(/\n\s*\*\s*/g, "; ").replace(/^\s*\*\s*/, "");
  return positional[0] ?? "";
}

/** Converts one infobox value to plain display text; references are removed by the caller. */
export function cleanWikiValue(raw: string): string {
  let value = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, "; ");
  value = value.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");
  for (let pass = 0; pass < 8 && /\{\{[^{}]*\}\}/.test(value); pass++) value = value.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => renderTemplate(inner));
  return value.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, "")
    .replace(/'''?/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/^[\s;,*]+|[\s;,*]+$/g, "").trim();
}

/** Reads the first infobox in a lead section. Named references may be defined anywhere in that section. */
export function parseInfobox(wikitext: string): { type: string; values: Record<string, string>; citations: Record<string, string> } | undefined {
  const start = wikitext.search(/\{\{\s*Infobox/i);
  if (start < 0) return;
  const end = templateEnd(wikitext, start);
  if (end < 0) return;
  const named = new Map<string, string>();
  for (const match of wikitext.matchAll(/<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>([\s\S]*?)<\/ref>/gi)) named.set(match[1].trim(), match[2]);
  const references: string[] = [];
  const body = wikitext.slice(start + 2, end - 2)
    .replace(/<ref\b[^>]*\/>/gi, tag => { const name = tag.match(/name\s*=\s*"?([^">/]+?)"?\s*\//i)?.[1]?.trim(); references.push(name ? named.get(name) ?? "" : ""); return `\u0000${references.length - 1}\u0000`; })
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, tag => { references.push(tag); return `\u0000${references.length - 1}\u0000`; });
  const [type, ...parameters] = splitTopLevel(body);
  const values: Record<string, string> = {}, citations: Record<string, string> = {};
  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");
    if (separator < 0) continue;
    const name = parameter.slice(0, separator).trim().toLowerCase();
    const raw = parameter.slice(separator + 1);
    const firstReference = raw.match(/\u0000(\d+)\u0000/)?.[1];
    const url = firstReference === undefined ? undefined : citationUrl(references[Number(firstReference)]);
    if (url) citations[name] = url;
    values[name] = cleanWikiValue(raw.replace(/\u0000\d+\u0000/g, ""));
  }
  return { type: type.trim().replace(/\s+/g, " "), values, citations };
}

/** Keeps the first stated value and its year, exactly as published. */
export function publicFigure(key: PublicFigure["key"], value: string | undefined, citation?: string): PublicFigure | undefined {
  const first = value?.split(";").map(part => part.trim()).find(part => /\d/.test(part));
  if (!first || first.length > 90) return;
  const year = first.match(/\((?:FY\s*|fiscal(?: year)?\s*)?((?:19|20)\d{2})(?:[–/-]\d{2,4})?\)/i)?.[1] ?? first.match(/\b(?:as of|in|FY)\s*((?:19|20)\d{2})\b/i)?.[1];
  const display = first.replace(/\s*\((?:FY\s*|fiscal(?: year)?\s*)?(?:19|20)\d{2}(?:[–/-]\d{2,4})?\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!/\d/.test(display)) return;
  return { key, value: display, ...(year ? { year } : {}), ...(citation ? { citation } : {}) };
}

function titleCase(value: string): string {
  return value.toLowerCase().split(" ").map((word, index) => index > 0 && LOWER_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Article titles are tried only as exact pages or redirects, never as loose search hits. */
export function articleTitleCandidates(legalName: string): string[] {
  const base = legalName.trim().replace(/\s+/g, " ");
  const variants = [base];
  let abbreviated = base;
  for (const [pattern, short] of LONG_FORMS) abbreviated = abbreviated.replace(pattern, short);
  variants.push(abbreviated);
  let stripped = abbreviated;
  for (let pass = 0; pass < 2; pass++) stripped = stripped.replace(LEGAL_SUFFIX, "").trim();
  variants.push(stripped);
  for (const variant of [...variants]) if (variant === variant.toUpperCase() && /[A-Z]{4}/.test(variant)) variants.push(titleCase(variant));
  return [...new Set(variants.filter(variant => variant.length >= 3))].slice(0, 6);
}

const plain = (value: string) => normalizeCompanySearch(value).replace(/[^a-z0-9]+/g, " ").trim();

/** The article must describe an organization located in the registered headquarters city. */
export function sameOrganization(infobox: { type: string; values: Record<string, string> }, lead: string, city: string): boolean {
  if (!ORGANIZATION_INFOBOX.test(infobox.type)) return false;
  const wanted = plain(city);
  if (wanted.length < 2) return false;
  const places = [...LOCATION_FIELDS.map(field => infobox.values[field] ?? ""), lead].map(plain).join(" ");
  return ` ${places} `.includes(` ${wanted} `);
}

type QueryPayload = { query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: { title: string; missing?: boolean; invalid?: boolean; pageprops?: { disambiguation?: string } }[] } };
type ParsePayload = { parse?: { title?: string; revid?: number; wikitext?: string } };

async function resolveArticle(titles: string[], fetch: WikiFetch): Promise<string | undefined> {
  const url = `${API}?${new URLSearchParams({ action: "query", titles: titles.join("|"), redirects: "1", prop: "pageprops", ppprop: "disambiguation", format: "json", formatversion: "2" })}`;
  const query = (await fetch(url) as QueryPayload).query;
  const follow = (title: string) => {
    let current = query?.normalized?.find(item => item.from === title)?.to ?? title;
    for (let hop = 0; hop < 3; hop++) { const next = query?.redirects?.find(item => item.from === current)?.to; if (!next) break; current = next; }
    return current;
  };
  for (const title of titles) {
    const resolved = follow(title);
    const page = query?.pages?.find(item => item.title === resolved);
    if (page && !page.missing && !page.invalid && page.pageprops?.disambiguation === undefined) return page.title;
  }
}

/**
 * Wikipedia is a community-maintained secondary source. Figures are kept as display text with
 * their stated year and first citation, and only when the article matches the registered city.
 */
export async function findPublicFigures(input: { legalName: string; city: string; article?: string }, fetch: WikiFetch, now = new Date()): Promise<PublicFigures | undefined> {
  const title = await resolveArticle(input.article ? [input.article] : articleTitleCandidates(input.legalName), fetch);
  if (!title) return;
  const parsed = (await fetch(`${API}?${new URLSearchParams({ action: "parse", page: title, prop: "wikitext|revid", section: "0", redirects: "1", format: "json", formatversion: "2" })}`) as ParsePayload).parse;
  if (!parsed?.wikitext) return;
  const infobox = parseInfobox(parsed.wikitext);
  if (!infobox) return;
  const lead = parsed.wikitext.slice(templateEnd(parsed.wikitext, parsed.wikitext.search(/\{\{\s*Infobox/i))).replace(/<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").slice(0, 2_000);
  if (!sameOrganization(infobox, cleanWikiValue(lead), input.city)) return;
  const figures = FIELDS.map(([field, key]) => publicFigure(key, infobox.values[field], infobox.citations[field])).filter((figure): figure is PublicFigure => Boolean(figure));
  const website = infobox.values.website?.match(/^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i)?.[0];
  const founded = infobox.values.founded?.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];
  const finalTitle = parsed.title ?? title;
  return {
    source: "Wikipedia", title: finalTitle,
    url: parsed.revid ? `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(finalTitle.replace(/ /g, "_"))}&oldid=${parsed.revid}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(finalTitle.replace(/ /g, "_"))}`,
    ...(parsed.revid ? { revisionId: parsed.revid } : {}), retrievedAt: now.toISOString(), figures,
    ...(website ? { website: /^https?:\/\//i.test(website) ? website : `https://${website}` } : {}), ...(founded ? { founded } : {}),
  };
}
