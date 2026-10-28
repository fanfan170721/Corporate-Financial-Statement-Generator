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
 report.profile!.employees={value:166000,asOf:"2025-09-27",basis:"full-time-equivalent",approximate:true,source:"https://example.test/annual-2025"};
 report.profile!.employeeHistory=[{value:164000,asOf:"2023-09-30",basis:"full-time-equivalent",approximate:true,source:"https://example.test/annual-2023"},report.profile!.employees];
 report.profile!.employeeCoverage={annualFilings:3,extracted:2,unavailablePeriods:["2024-09-28"],retrievalFailures:1};
 const workforce=reportToCsv(report);
 assert.match(workforce,/"Full-time equivalents","164000","Approximate","https:\/\/example.test\/annual-2023"/);
 assert.match(workforce,/"Historical workforce disclosures","2024-09-28","Not available",""/);
 assert.match(workforce,/"Full-time equivalents","166000","Approximate","https:\/\/example.test\/annual-2025"/);
 assert.doesNotMatch(workforce,/"2024-09-28","Not available","0"|REPORTED TOTAL EMPLOYEES/);
 report.profile!.employees={value:170000,asOf:"2026-06-30",basis:"secondary-unspecified",method:"public-directory",sourceLabel:"StockAnalysis",source:"https://example.test/employees",retrievedAt:"2026-10-28T12:00:00Z"};
 report.profile!.employeeHistory.push(report.profile!.employees);
 report.profile!.employeeResearch={checkedAt:"2026-10-28T12:00:00Z",requests:2,bytes:1000,addedObservations:1,steps:[{label:"StockAnalysis",url:"https://example.test/employees",status:"used",observations:1},{label:"Company website",url:"https://example.test/company",status:"no-data"}]};
 const supplemented=reportToCsv(report);
 assert.match(supplemented,/"PUBLICLY REPORTED WORKFORCE","170000","2026-06-30"/);
 assert.match(supplemented,/"Secondary source · scope unspecified","170000","","https:\/\/example.test\/employees","Public company directory","StockAnalysis","2026-10-28T12:00:00Z"/);
 assert.match(supplemented,/"Additional sources checked"/);
 assert.match(supplemented,/"Workforce data added","1"/);
 assert.match(supplemented,/"No dated workforce data found"/);
 assert.match(supplemented,/The source does not specify the workforce measure/);
 assert.doesNotMatch(supplemented,/employee growth|workforce growth/i);
});
