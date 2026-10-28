import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { EmployeeObservation } from "../lib/types";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/employee-trend.ts", import.meta.url), "utf8"));
const {employeeTrend, employeeSourceLabel, employeeSourceType, employeeHeadline, employeeResearchStatusLabel} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as typeof import("../lib/employee-trend");
const item = (asOf:string,value:number,basis:EmployeeObservation["basis"]="total"):EmployeeObservation => ({asOf,value,basis,source:"https://example.test/annual"});

test("workforce chart leaves missing years empty and separates FTE from headcount",()=>{
  const trend=employeeTrend({employeeHistory:[item("2023-09-30",100),item("2025-09-27",120,"full-time-equivalent")],employeeCoverage:{annualFilings:3,extracted:2,unavailablePeriods:["2024-09-28"],retrievalFailures:0}});
  assert.deepEqual(trend.bases,["total","full-time-equivalent"]);
  assert.equal(trend.rows[0].total,100);
  assert.equal(trend.rows[0]["full-time-equivalent"],null);
  assert.equal(trend.rows[1].total,null);
  assert.equal(trend.rows[1]["full-time-equivalent"],null);
  assert.equal(trend.rows[2].total,null);
  assert.equal(trend.rows[2]["full-time-equivalent"],120);
});

test("nonconsecutive dates cannot draw a line across an unknown year",()=>{
  const trend=employeeTrend({employeeHistory:[item("2022-06-30",100),item("2024-06-30",120)]});
  assert.deepEqual(trend.rows.map(row=>row.date),["2022-06-30","2023","2024-06-30"]);
  assert.equal(trend.rows[1].total,null);
});

test("older snapshots remain a single dated observation; conflicting and invalid values are excluded",()=>{
  assert.equal(employeeTrend({employees:item("2025-12-31",0)}).historical,false);
  assert.equal(employeeTrend({employees:item("2025-12-31",0)}).observations[0].value,0);
  const result=employeeTrend({employeeHistory:[item("2025-12-31",100),item("2025-12-31",200),item("2025-02-30",9),item("2024-12-31",Infinity)]});
  assert.equal(result.observations.length,0);
});

test("public-directory counts remain separate from primary and legacy unknown measures",()=>{
  const primary={...item("2024-09-28",160000,"full-time-equivalent"),method:"annual-disclosure" as const};
  const legacy={...item("2025-09-27",166000),basis:undefined};
  const secondary={...item("2025-09-27",166000,"secondary-unspecified"),method:"public-directory" as const,sourceLabel:"StockAnalysis"};
  const trend=employeeTrend({employeeHistory:[primary,legacy,secondary]});
  assert.deepEqual(trend.bases,["full-time-equivalent","unspecified","secondary-unspecified"]);
  assert.equal(trend.observations.length,3);
  assert.equal(trend.rows[0]["secondary-unspecified"],null);
  assert.equal(trend.rows[1]["full-time-equivalent"],null);
  assert.equal(trend.rows[1]["secondary-unspecified"],166000);
  assert.equal(employeeSourceLabel(secondary),"StockAnalysis");
  assert.equal(employeeSourceType(secondary),"Public company directory");
  assert.equal(employeeHeadline(secondary),"PUBLICLY REPORTED WORKFORCE");
  assert.equal(employeeHeadline(primary),"REPORTED FULL-TIME EQUIVALENTS");
});

test("directory observations without a basis cannot silently become primary unknown data",()=>{
  const directory={...item("2025-12-31",100),basis:undefined,method:"public-directory" as const};
  const primary={...item("2025-12-31",120),basis:undefined,method:"annual-disclosure" as const};
  const trend=employeeTrend({employeeHistory:[directory,primary]});
  assert.equal(trend.observations.length,2);
  assert.deepEqual(trend.bases,["secondary-unspecified","unspecified"]);
  assert.equal(employeeSourceLabel({...primary,method:"issuer-website"}),"Company website");
});

test("source checks distinguish confirmed identity from added workforce evidence",()=>{
  assert.equal(employeeResearchStatusLabel({label:"Company identity check",url:"https://example.com",status:"used"}),"Company identity confirmed");
  assert.equal(employeeResearchStatusLabel({label:"Workforce observations",url:"https://example.com",status:"used",observations:2}),"Workforce data added");
  assert.equal(employeeSourceType({...item("2025-12-31",100,"secondary-unspecified"),method:"public-directory",source:"https://www.wikidata.org/wiki/Q123#P1128"}),"Community-maintained public data");
});
