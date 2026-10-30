import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

async function moduleUrl(name: string, fresh = false): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const dependency of new Set([...source.matchAll(/from "\.\/([a-z-]+)"/g)].map(match => match[1]))) source = source.replaceAll(`"./${dependency}"`, `"${await moduleUrl(dependency)}"`);
  // Each test has independent in-memory caches as a new Worker instance would.
  if (fresh) source += `\n// fixture ${crypto.randomUUID()}`;
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
type Market = typeof import("../lib/market");
type Registry = typeof import("../lib/entity-registry");
type Figures = typeof import("../lib/public-figures");
type Export = typeof import("../lib/report-export");
const loadMarket = async () => await import(await moduleUrl("market", true)) as Market;
const registry = async () => await import(await moduleUrl("entity-registry")) as Registry;
const figures = async () => await import(await moduleUrl("public-figures")) as Figures;

// All organizations, identifiers and figures are invented for adapter tests, never production fixtures.
function withCheckDigits(base: string): string {
  let remainder = 0;
  for (const char of `${base}00`) for (const digit of /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)) remainder = (remainder * 10 + Number(digit)) % 97;
  return base + String(98 - remainder).padStart(2, "0");
}
const LEI = { listed: withCheckDigits("FIXTURE00000000001"), pension: withCheckDigits("FIXTURE00000000002"), branch: withCheckDigits("FIXTURE00000000003"), sole: withCheckDigits("FIXTURE00000000004"), inactive: withCheckDigits("FIXTURE00000000005"), capital: withCheckDigits("FIXTURE00000000006"), two: withCheckDigits("FIXTURE00000000007"), parent: withCheckDigits("FIXTURE00000000008") };
const agent = "Finscope test contact@example.test";
const env = { SEC_USER_AGENT: agent, FMP_API_KEY: "" };
const directory = { fields: ["cik", "name", "ticker", "exchange"], data: [[111, "Fixture Listed Holdings Inc", "FXLH", "NYSE"]] };

function record(lei: string, name: string, options: { city?: string; category?: string; status?: string; registration?: string } = {}) {
  const address = { addressLines: ["1 Fixture Street"], city: options.city ?? "Fixtureville", region: "CA-ON", country: "CA", postalCode: "A1A 1A1" };
  return { type: "lei-records", id: lei, attributes: { lei, entity: { legalName: { name, language: "en" }, otherNames: [], legalAddress: address, headquartersAddress: address, jurisdiction: "CA", category: options.category ?? "GENERAL", legalForm: { id: "FX01", other: null }, status: options.status ?? "ACTIVE" }, registration: { initialRegistrationDate: "2015-03-04T00:00:00Z", lastUpdateDate: "2026-01-02T00:00:00Z", status: options.registration ?? "ISSUED", corroborationLevel: "FULLY_CORROBORATED" } } };
}

const WIKITEXT = `{{Short description|Invented pension plan}}
{{Infobox company
| name = Fixture Pension Plan
| type = [[Pension fund]]
| hq_location_city = [[Fixtureville]], [[Ontario]]
| founded = {{Start date and age|1961|4|1}}
| revenue = {{increase}} {{CAD|1.2 billion|link=yes}} (2025)<ref name="ar25">{{cite web |url=https://fixture.example/annual-report-2025 |title=Annual report}}</ref>
| net_income = {{decrease}} [[Canadian dollar|C$]]0.4 billion (FY2025)<ref name="ar25" />
| assets = C$12.5 billion<ref>{{cite web |url=https://web.archive.org/web/1/https://fixture.example/old |title=Archived}}</ref>
| num_employees = {{Plainlist|
* 1,234 (2025)
* 1,100 (2024)
}}
| website = {{URL|fixture.example}}
}}
'''Fixture Pension Plan''' is an invented pension plan in [[Fixtureville]].`;

function transport(options: { gleifCity?: string; missingRecord?: boolean } = {}) {
  const requested: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); requested.push(url.href);
    assert.equal(init?.redirect, "manual");
    if (url.hostname === "www.sec.gov" && url.pathname === "/files/company_tickers_exchange.json") return Response.json(directory);
    if (url.hostname === "api.gleif.org") {
      if (url.pathname === "/api/v1/lei-records") {
        if (url.searchParams.has("filter[entity.legalName]") && /listed/i.test(url.searchParams.get("filter[entity.legalName]")!)) return Response.json({ data: [
          record(LEI.listed, "FIXTURE LISTED HOLDINGS INC"), record(LEI.branch, "Fixture Listed Holdings Paris Branch", { category: "BRANCH" }), record(LEI.sole, "Fixture Listed Holdings Sole", { category: "SOLE_PROPRIETOR" }),
          record(LEI.inactive, "Fixture Listed Holdings Old", { status: "INACTIVE" }), record(LEI.capital, "Fixture Listed Holdings Capital"), record(LEI.two, "Fixture Listed Holdings Two"), record(LEI.pension, "Fixture Listed Holdings Pension Trust"),
        ] });
        if (url.searchParams.has("filter[fulltext]") && /pension/i.test(url.searchParams.get("filter[fulltext]")!)) return Response.json({ data: [record(LEI.pension, "Fixture Listed Holdings Pension Trust")] });
        return Response.json({ data: [] });
      }
      if (url.pathname === `/api/v1/lei-records/${LEI.pension}`) return options.missingRecord ? new Response("not found", { status: 404 }) : Response.json({ data: record(LEI.pension, "Fixture Listed Holdings Pension Trust", { city: options.gleifCity }) });
      if (url.pathname === "/api/v1/entity-legal-forms/FX01") return Response.json({ data: { attributes: { names: [{ localName: "fixture trust", languageCode: "en" }, { localName: "fiducie fictive", languageCode: "fr" }] } } });
      if (url.pathname.endsWith("/direct-parent")) return new Response("no parent reported", { status: 404 });
      if (url.pathname.endsWith("/ultimate-parent")) return Response.json({ data: record(LEI.parent, "Fixture Ultimate Parent AG") });
    }
    if (url.hostname === "en.wikipedia.org") {
      assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /contact@example\.test/, "Wikimedia clients identify a contact");
      if (url.searchParams.get("action") === "query") return Response.json({ query: { redirects: [{ from: "Fixture Listed Holdings Pension", to: "Fixture Pension Plan" }], pages: [{ title: "Fixture Listed Holdings Pension Trust", missing: true }, { title: "Fixture Pension Plan" }] } });
      if (url.searchParams.get("action") === "parse") { assert.equal(url.searchParams.get("page"), "Fixture Pension Plan"); return Response.json({ parse: { title: "Fixture Pension Plan", revid: 42, wikitext: WIKITEXT } }); }
    }
    throw new Error(`Unexpected request: ${url.href}`);
  }) as typeof fetch;
  return { fetcher, requested };
}

test("LEI validation applies the ISO 17442 check digits", async () => {
  const { isLei } = await registry();
  assert.equal(isLei(LEI.pension), true);
  assert.equal(isLei(LEI.pension.slice(0, 19) + String((Number(LEI.pension[19]) + 1) % 10)), false);
  assert.equal(isLei(LEI.pension.toLowerCase()), false);
  assert.equal(isLei("AAPL"), false);
});

test("registry ranking requires every query word and prefers exact, then shorter, legal names", async () => {
  const { registryMatchScore } = await registry();
  assert.equal(registryMatchScore("Fixture Pension Plan", "fixture pension plan"), 100);
  assert.ok(registryMatchScore("Fixture Pension Plan Trust Fund", "Fixture Pension") > registryMatchScore("Mutual Fixture Pension", "Fixture Pension"));
  assert.ok(registryMatchScore("Fixture Pension", "fixture") > registryMatchScore("Fixture Pension Plan Trust Fund", "fixture"));
  assert.equal(registryMatchScore("Fixture Pension Plan", "Fixture Bank"), 0);
  assert.equal(registryMatchScore("Fixture Pension Plan", "of the"), 0);
});

test("infobox values keep the published text, stated year and first citation without archive links", async () => {
  const { parseInfobox, publicFigure, articleTitleCandidates, sameOrganization } = await figures();
  const infobox = parseInfobox(WIKITEXT)!;
  assert.equal(infobox.type, "Infobox company");
  assert.deepEqual(publicFigure("revenue", infobox.values.revenue, infobox.citations.revenue), { key: "revenue", value: "C$1.2 billion", year: "2025", citation: "https://fixture.example/annual-report-2025" });
  assert.deepEqual(publicFigure("netIncome", infobox.values.net_income, infobox.citations.net_income), { key: "netIncome", value: "C$0.4 billion", year: "2025", citation: "https://fixture.example/annual-report-2025" }, "Named references resolve to their definition");
  assert.deepEqual(publicFigure("assets", infobox.values.assets, infobox.citations.assets), { key: "assets", value: "C$12.5 billion" }, "Archived copies are not presented as the cited source");
  assert.deepEqual(publicFigure("employees", infobox.values.num_employees), { key: "employees", value: "1,234", year: "2025" }, "Only the first listed value is kept");
  assert.equal(publicFigure("revenue", "Undisclosed"), undefined);
  assert.equal(sameOrganization(infobox, "", "FIXTUREVILLE"), true);
  assert.equal(sameOrganization(infobox, "", "Elsewhere"), false);
  assert.equal(sameOrganization({ type: "Infobox person", values: { birth_place: "Fixtureville" } }, "born in Fixtureville", "Fixtureville"), false, "People are never matched to an organization");
  assert.deepEqual(articleTitleCandidates("Fixture Werke Gesellschaft mit beschränkter Haftung"), ["Fixture Werke Gesellschaft mit beschränkter Haftung", "Fixture Werke GmbH", "Fixture Werke"]);
  assert.ok(articleTitleCandidates("FIXTURE PENSION PLAN INVESTMENT BOARD").includes("Fixture Pension Plan Investment Board"));
});

test("registry discovery is opt-in, removes listed duplicates, branches, individuals and inactive entities", async () => {
  const market = await loadMarket();
  const quiet = transport();
  await market.searchCompanies("Fixture Listed Holdings", { env, fetcher: quiet.fetcher, live: true });
  assert.ok(quiet.requested.every(url => !url.includes("gleif")), "Without the server option discovery stays on the SEC directory");
  const f = transport();
  const results = await market.searchCompanies("Fixture Listed Holdings", { env, fetcher: f.fetcher, live: true, entityRegistry: true });
  assert.deepEqual(results.map(company => company.symbol), ["FXLH", LEI.capital, LEI.two], "Listed issuer first, then at most two registered organizations");
  assert.equal(results[1].discoveryProvider, "gleif");
  assert.equal(results[1].exchange, "LEI · CA");
  assert.equal(results[1].coverage, undefined, "Discovery never claims coverage");
  assert.ok(!f.requested.some(url => url.includes(`/lei-records/${LEI.capital}`)), "Search reads list results only");
  const unlisted = await market.searchCompanies("Fixture Pension", { env, fetcher: transport().fetcher, live: true, entityRegistry: true });
  assert.deepEqual(unlisted.map(company => [company.symbol, company.sector]), [[LEI.pension, "Pension fund"]]);
});

test("searching by an LEI returns that organization for selection", async () => {
  const market = await loadMarket();
  const f = transport();
  const results = await market.searchCompanies(LEI.pension.toLowerCase(), { env, fetcher: f.fetcher, live: true, entityRegistry: true });
  assert.deepEqual(results.map(company => [company.symbol, company.discoveryOnly, company.discoveryProvider]), [[LEI.pension, true, "gleif"]]);
  assert.ok(!f.requested.some(url => url.includes("wikipedia")), "Selection does not retrieve public figures");
});

test("common acronyms look up their verified LEI directly", async () => {
  const market = await loadMarket();
  const f = transport();
  await market.searchCompanies("HOOPP", { env, fetcher: f.fetcher, live: true, entityRegistry: true });
  assert.ok(f.requested.some(url => new URL(url).searchParams.get("filter[lei]") === "KRVONIXV1JBEY6WQ6092"));
});

test("an LEI report contains registry details and cited public figures, never financial statements", async () => {
  const market = await loadMarket();
  const f = transport();
  const report = await market.generateReport(LEI.pension, { env, fetcher: f.fetcher });
  assert.equal(report.scope?.level, "basic");
  assert.deepEqual(report.periods, []);
  assert.equal(report.provider, "GLEIF");
  assert.equal(report.profile?.registry?.legalForm, "fixture trust");
  assert.equal(report.profile?.registry?.legalFormFr, "fiducie fictive");
  assert.equal(report.profile?.registry?.headquarters, "1 Fixture Street, Fixtureville, ON A1A 1A1, CA");
  assert.equal(report.profile?.registry?.directParent, undefined);
  assert.deepEqual(report.profile?.registry?.ultimateParent, { lei: LEI.parent, name: "Fixture Ultimate Parent AG" });
  assert.equal(report.profile?.registry?.registeredSince, "2015-03-04");
  assert.equal(report.dataAsOf, "2026-01-02");
  assert.deepEqual(report.profile?.publicFigures?.figures.map(figure => [figure.key, figure.value, figure.year ?? null]), [["revenue", "C$1.2 billion", "2025"], ["netIncome", "C$0.4 billion", "2025"], ["assets", "C$12.5 billion", null], ["employees", "1,234", "2025"]]);
  assert.equal(report.profile?.publicFigures?.url, "https://en.wikipedia.org/w/index.php?title=Fixture_Pension_Plan&oldid=42");
  assert.equal(report.profile?.website, "https://fixture.example");
  assert.ok(report.sources.some(source => source.url === `https://search.gleif.org/#/record/${LEI.pension}`));
  assert.ok(report.sources.some(source => source.url === "https://fixture.example/annual-report-2025"));
  assert.ok(report.scope?.available.includes("Legal entity registration"));
  assert.ok(report.scope?.available.includes("Publicly reported key figures"));
  assert.ok(report.scope?.missing.includes("Income and profitability"));
  assert.ok(report.scope?.limitations.some(item => item.startsWith("Key figures come from Wikipedia")));
  const csv = (await import(await moduleUrl("report-export")) as Export).reportToCsv(report);
  assert.match(csv, new RegExp(`"Legal Entity Identifier \\(LEI\\)","${LEI.pension}"`));
  assert.match(csv, /"Revenue","C\$1\.2 billion","2025","https:\/\/fixture\.example\/annual-report-2025"/);
});

test("an article in another city is not attributed to the registered organization", async () => {
  const market = await loadMarket();
  const report = await market.generateReport(LEI.pension, { env, fetcher: transport({ gleifCity: "Elsewhere" }).fetcher });
  assert.equal(report.profile?.publicFigures, undefined);
  assert.ok(report.scope?.missing.includes("Publicly reported key figures"));
  assert.equal(report.profile?.registry?.city, "Elsewhere");
});

test("an unknown LEI reports a missing organization instead of substituting details", async () => {
  const market = await loadMarket();
  await assert.rejects(market.generateReport(LEI.pension, { env, fetcher: transport({ missingRecord: true }).fetcher }), (error: Error & { code?: string }) => error.code === "UNKNOWN_SYMBOL");
});
