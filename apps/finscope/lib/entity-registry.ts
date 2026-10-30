import { normalizeCompanySearch } from "./company-search";
import type { Company, RegistryParty, RegistryProfile } from "./types";

/** Fetches one JSON document. Callers own transport limits, caching and error handling. */
export type RegistryFetch = (url: string) => Promise<unknown>;

const GLEIF = "https://api.gleif.org/api/v1";

/** ISO 17442: 18 alphanumerics followed by ISO 7064 MOD 97-10 check digits. */
export function isLei(value: string): boolean {
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) return false;
  let remainder = 0;
  for (const char of value) for (const digit of /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

/** Common names that differ from the registered legal name. Each LEI and article title was checked on 30 October 2026. */
export const REGISTRY_ALIASES: { lei: string; names: string[]; wikipedia?: string }[] = [
  { lei: "KRVONIXV1JBEY6WQ6092", names: ["hoopp", "healthcare of ontario pension plan", "regime de retraite des employes du secteur de la sante de l'ontario"], wikipedia: "Healthcare of Ontario Pension Plan" },
  { lei: "H8N91ZZ5ZBHE2NQ34P83", names: ["otpp", "ontario teachers", "ontario teachers' pension plan", "regime de retraite des enseignantes et des enseignants de l'ontario"], wikipedia: "Ontario Teachers' Pension Plan" },
  { lei: "70DNWEAINTGFO4DMV441", names: ["cppib", "cpp investments", "canada pension plan investment board", "investissements rpc"], wikipedia: "CPP Investments" },
  { lei: "HWR6ATEU4L0XN8IT6Y39", names: ["cdpq", "la caisse", "caisse de depot", "caisse de depot et placement du quebec"], wikipedia: "La Caisse" },
  { lei: "HK15VDWNE3FL77FUSC13", names: ["omers", "ontario municipal employees retirement system"], wikipedia: "OMERS" },
  { lei: "3CCUJEU88P85MIG5R153", names: ["psp investments", "investissements psp", "public sector pension investment board"], wikipedia: "Public Sector Pension Investment Board" },
  { lei: "549300211OPKUEMQ9F64", names: ["aimco", "alberta investment management corporation"], wikipedia: "AIMCo" },
  { lei: "549300C74Y46JUAO4N13", names: ["bcimc", "bci pension", "british columbia investment management corporation"], wikipedia: "British Columbia Investment Management Corporation" },
  { lei: "549300LGZ1IY6IGRCP97", names: ["imco", "investment management corporation of ontario"] },
  { lei: "549300YJBGEJS145KR40", names: ["optrust", "opseu pension trust", "opseu pension plan"], wikipedia: "OPTrust" },
];

export function registryAlias(lei: string) { return REGISTRY_ALIASES.find(alias => alias.lei === lei); }

type Address = { addressLines?: string[]; city?: string | null; region?: string | null; country?: string | null; postalCode?: string | null };
type LeiRecord = {
  id: string;
  attributes: {
    entity: { legalName: { name: string }; otherNames?: { name: string }[]; legalAddress?: Address; headquartersAddress?: Address; jurisdiction?: string | null; category?: string | null; legalForm?: { id?: string | null; other?: string | null }; status?: string | null; creationDate?: string | null };
    registration?: { initialRegistrationDate?: string | null; lastUpdateDate?: string | null; status?: string | null; corroborationLevel?: string | null };
  };
};

// Registrations that GLEIF itself marks as invalid or superseded never become search results.
const UNUSABLE_REGISTRATIONS = new Set(["ANNULLED", "DUPLICATE", "MERGED", "RETIRED"]);
const CATEGORY_SECTORS: Record<string, string> = { FUND: "Fund", RESIDENT_GOVERNMENT_ENTITY: "Government entity", INTERNATIONAL_ORGANIZATION: "International organization" };
const QUERY_STOPWORDS = new Set(["the", "of", "and", "de", "du", "des", "la", "le", "les", "et", "d", "l"]);

function leiRecords(payload: unknown): LeiRecord[] {
  const data = (payload as { data?: unknown } | null)?.data;
  return (Array.isArray(data) ? data : data ? [data] : []).filter((item): item is LeiRecord => {
    const record = item as Partial<LeiRecord> | null;
    return typeof record?.id === "string" && isLei(record.id) && typeof record.attributes?.entity?.legalName?.name === "string" && record.attributes.entity.legalName.name.trim().length > 0;
  });
}

// Branches are not separate legal entities and sole proprietors are individuals; neither is a search result.
const UNLISTED_CATEGORIES = new Set(["BRANCH", "SOLE_PROPRIETOR"]);

function usable(record: LeiRecord): boolean {
  const { entity, registration } = record.attributes;
  return entity.status === "ACTIVE" && !UNUSABLE_REGISTRATIONS.has(registration?.status ?? "") && !UNLISTED_CATEGORIES.has(entity.category ?? "");
}

function tokens(value: string): string[] {
  return normalizeCompanySearch(value).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/** Names are compared without punctuation, accents or case; listed issuers keep precedence on duplicates. */
export function registryNameKey(value: string): string { return tokens(value).join(" "); }

/** Every meaningful query word must begin a word of the legal name; closer and shorter names rank first. */
export function registryMatchScore(legalName: string, query: string): number {
  const name = tokens(legalName);
  const words = tokens(query).filter(word => !QUERY_STOPWORDS.has(word));
  if (!words.length || !words.every(word => name.some(part => part.startsWith(word)))) return 0;
  const joined = name.join(" "), wanted = tokens(query).join(" ");
  return (joined === wanted ? 100 : joined.startsWith(wanted) ? 80 : 60) - Math.min(20, Math.max(0, name.length - words.length));
}

function registrySector(record: LeiRecord): string {
  if (/\b(pension|retraite|retirement)\b/i.test(record.attributes.entity.legalName.name)) return "Pension fund";
  return CATEGORY_SECTORS[record.attributes.entity.category ?? ""] ?? "Registered organization";
}

export function registryCompany(record: LeiRecord): Company {
  const entity = record.attributes.entity;
  const name = entity.legalName.name.trim();
  const jurisdiction = entity.jurisdiction || entity.headquartersAddress?.country || "";
  return { symbol: record.id, name, nameEn: name, exchange: jurisdiction ? `LEI · ${jurisdiction}` : "LEI", sector: registrySector(record), color: "#7d8ca3", mark: (name.match(/[A-Za-z0-9]/)?.[0] ?? "•").toUpperCase(), lei: record.id, discoveryOnly: true, discoveryProvider: "gleif" };
}

/** Discovery only: legal names and identifiers from the Global LEI System, without financial retrieval. */
export async function searchRegistry(term: string, fetch: RegistryFetch, limit = 5): Promise<Company[]> {
  const normalized = normalizeCompanySearch(term);
  const aliases = REGISTRY_ALIASES.filter(alias => alias.names.some(name => name === normalized || (normalized.length >= 4 && name.startsWith(normalized))));
  const page = (filter: string, value: string, size: number) => `${GLEIF}/lei-records?${new URLSearchParams({ [`filter[${filter}]`]: value, "page[size]": String(size) })}`;
  const requests = [fetch(page("entity.legalName", term, 20)), fetch(page("fulltext", term, 10))];
  if (aliases.length) requests.push(fetch(page("lei", aliases.map(alias => alias.lei).join(","), aliases.length)));
  const settled = await Promise.allSettled(requests);
  const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure && settled.every(result => result.status === "rejected")) throw failure.reason;
  const preferred = new Set(aliases.map(alias => alias.lei));
  const seen = new Set<string>();
  return settled.flatMap(result => result.status === "fulfilled" ? leiRecords(result.value) : [])
    .filter(record => usable(record) && !seen.has(record.id) && Boolean(seen.add(record.id)))
    .map(record => ({ record, score: preferred.has(record.id) ? 200 : registryMatchScore(record.attributes.entity.legalName.name, term) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => registryCompany(item.record));
}

function formatAddress(address: Address | undefined): string {
  if (!address) return "";
  const region = address.region?.includes("-") ? address.region.split("-").pop() : address.region;
  return [...(address.addressLines ?? []), address.city, [region, address.postalCode].filter(Boolean).join(" "), address.country].map(part => part?.trim()).filter(Boolean).join(", ");
}

const day = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);

async function relatedParty(fetch: RegistryFetch, url: string): Promise<RegistryParty | undefined> {
  // GLEIF answers 404 when no parent is reported; that is not a retrieval failure.
  try { const parent = leiRecords(await fetch(url))[0]; return parent ? { lei: parent.id, name: parent.attributes.entity.legalName.name.trim() } : undefined; }
  catch { return undefined; }
}

export async function registryProfile(lei: string, fetch: RegistryFetch): Promise<{ company: Company; registry: RegistryProfile }> {
  if (!isLei(lei)) throw new Error("Invalid LEI");
  const record = leiRecords(await fetch(`${GLEIF}/lei-records/${lei}`))[0];
  if (!record || record.id !== lei) throw new Error("LEI record unavailable");
  const { entity, registration } = record.attributes;
  const formCode = entity.legalForm?.id && entity.legalForm.id !== "8888" ? entity.legalForm.id : undefined;
  const [form, directParent, ultimateParent] = await Promise.all([
    formCode ? fetch(`${GLEIF}/entity-legal-forms/${encodeURIComponent(formCode)}`).catch(() => undefined) : Promise.resolve(undefined),
    relatedParty(fetch, `${GLEIF}/lei-records/${lei}/direct-parent`),
    relatedParty(fetch, `${GLEIF}/lei-records/${lei}/ultimate-parent`),
  ]);
  const names = ((form as { data?: { attributes?: { names?: { localName?: string; languageCode?: string }[] } } } | undefined)?.data?.attributes?.names ?? []);
  const formName = (language: string) => names.find(name => name.languageCode === language)?.localName?.trim();
  const headquarters = entity.headquartersAddress ?? entity.legalAddress;
  const registry: RegistryProfile = {
    source: "GLEIF", lei, legalName: entity.legalName.name.trim(),
    otherNames: (entity.otherNames ?? []).map(name => name.name?.trim()).filter((name): name is string => Boolean(name)).slice(0, 5),
    jurisdiction: entity.jurisdiction ?? "", category: entity.category ?? "",
    legalForm: formName("en") ?? entity.legalForm?.other?.trim() ?? undefined, legalFormFr: formName("fr"), legalFormCode: formCode,
    entityStatus: entity.status ?? "", registrationStatus: registration?.status ?? "", corroboration: registration?.corroborationLevel ?? undefined,
    registeredSince: day(registration?.initialRegistrationDate), lastUpdated: day(registration?.lastUpdateDate),
    headquarters: formatAddress(headquarters), legalAddress: formatAddress(entity.legalAddress),
    city: headquarters?.city?.trim() ?? "", country: headquarters?.country?.trim() ?? "",
    directParent, ultimateParent: ultimateParent?.lei === directParent?.lei ? undefined : ultimateParent,
    recordUrl: `https://search.gleif.org/#/record/${lei}`,
  };
  return { company: { ...registryCompany(record), discoveryOnly: undefined }, registry };
}
