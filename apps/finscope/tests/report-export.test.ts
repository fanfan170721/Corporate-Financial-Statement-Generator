import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { Report } from "../lib/types";

async function moduleUrl(name:string):Promise<string>{
 let source=stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),"utf8"));
 for(const match of [...source.matchAll(/from "\.\/([a-z-]+)"/g)]) source=source.replaceAll(`"./${match[1]}"`,`"${await moduleUrl(match[1])}"`);
 return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const {reportToCsv}=await import(await moduleUrl("report-export")) as typeof import("../lib/report-export");
test("basic profile CSV preserves evidence and scope without inventing financial tables",()=>{
 const report:Report={id:"basic-export",symbol:"TEST",company:{symbol:"TEST",name:"Example Company",nameEn:"Example Company",exchange:"NYSE",sector:"Other",color:"#abc",mark:"E",cik:"123"},generatedAt:"2026-10-27T00:00:00Z",retrievedAt:"2026-10-27T00:00:00Z",dataAsOf:"",mode:"live",currency:"",periods:[],metrics:{revenueGrowth:null,netMargin:null,freeCashFlow:null,debtToEquity:null,cashRatio:null,roe:null},insights:[],sources:[{label:"SEC submissions",url:"https://data.sec.gov/submissions/CIK0000000123.json"}],profile:{legalName:"=Example Company",cik:"123"},filings:[{title:"Annual filing",form:"10-K",filedAt:"2026-02-01",url:"https://www.sec.gov/Archives/edgar/data/123/123/test.htm"}]};
 const csv=reportToCsv(report);
 assert.match(csv,/Basic company profile/);
 assert.match(csv,/Information included/);
 assert.match(csv,/Outside this report’s scope/);
 assert.match(csv,/SEC submissions/);
 assert.match(csv,/2026-02-01/);
 assert.match(csv,/'=Example Company/);
 assert.doesNotMatch(csv,/PUBLISHED FINANCIAL STATEMENTS|Analytical metrics|Reporting currency|Financial period ending|Amounts in reporting-currency/);
 const translated=reportToCsv(report,value=>value==='Basic company profile'?'Profil de base de l’entreprise':value);
 assert.match(translated,/Profil de base de l’entreprise/);
});
