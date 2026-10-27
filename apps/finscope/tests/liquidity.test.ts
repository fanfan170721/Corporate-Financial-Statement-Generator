import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
const source = stripTypeScriptTypes(await readFile(new URL("../lib/liquidity.ts", import.meta.url), "utf8"));
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as typeof import("../lib/liquidity");
const almost = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} !== ${expected}`);

test("every month and the complete horizon reconcile without a hidden financing plug", () => {
  for (const stressed of [false, true]) {
    const result = model.projectLiquidity(model.DEFAULT_LIQUIDITY, stressed);
    for (const [index, month] of result.months.entries()) {
      almost(month.opening + month.investmentIncome + month.contributions + month.distributions - month.benefits - month.capitalCalls, month.closing);
      if (index) almost(month.opening, result.months[index - 1].closing);
    }
    almost(result.endingBalance, model.DEFAULT_LIQUIDITY.initialLiquidAssets + result.totalInvestmentIncome + result.totalContributions + result.totalDistributions - result.totalBenefits - result.totalCalls);
  }
});
test("capital-call acceleration changes timing while preserving total calls and remaining commitments", () => {
  for (const acceleration of [1, 1.3, 1.5, 2, 2.5, 3]) {
    const schedule = model.capitalCallSchedule(12, 75, [15, 25, 30, 30], acceleration);
    almost(schedule.reduce((sum, value) => sum + value, 0), 9);
    assert.ok(schedule.every((value) => value >= 0));
    assert.ok(schedule.slice(Math.ceil(24 / acceleration)).every((value) => value === 0));
  }
  const stressed = model.projectLiquidity(model.DEFAULT_LIQUIDITY, true);
  almost(stressed.months[23].remainingCommitments, 3);
  assert.ok(stressed.months.every((month) => month.cumulativeCalls <= 12 + 1e-8));
});
test("first breach is the first negative month; zero cash is not labelled negative", () => {
  const result = model.projectLiquidity({ ...model.DEFAULT_LIQUIDITY, initialLiquidAssets: 1, annualBenefits: 6, annualContributions: 0, annualDistributions: 0, unfundedCommitments: 0, annualYieldPercent: 0, liquidityBuffer: 0.75 });
  assert.equal(result.firstBreach, 3);
  assert.equal(result.firstBufferBreach, 1);
  almost(result.months[1].closing, 0);
  almost(result.fundingGap, 11);
  assert.ok(result.months.slice(2).every((month) => month.investmentIncome === 0));
});
test("stress haircuts and contributions affect actual flows, not just labels", () => {
  const base = model.projectLiquidity(model.DEFAULT_LIQUIDITY);
  const stress = model.projectLiquidity(model.DEFAULT_LIQUIDITY, true);
  almost(stress.totalDistributions, base.totalDistributions * 0.25);
  almost(stress.totalContributions, base.totalContributions * 0.8);
  almost(stress.totalBenefits, base.totalBenefits * 1.1);
  assert.ok(stress.endingBalance < base.endingBalance);
  assert.notEqual(stress.firstBreach, null);
});
test("zero uses has no invented coverage ratio and invalid assumptions are rejected", () => {
  const result = model.projectLiquidity({ ...model.DEFAULT_LIQUIDITY, annualBenefits: 0, unfundedCommitments: 0 });
  assert.equal(result.twelveMonthCoverage, null);
  assert.equal(model.validateLiquidityConfig({ ...model.DEFAULT_LIQUIDITY, initialLiquidAssets: Number.NaN }), false);
  assert.equal(model.validateLiquidityConfig({ ...model.DEFAULT_LIQUIDITY, callWeights: [0, 0, 0, 0] }), false);
  assert.throws(() => model.capitalCallSchedule(10, 101, [1, 1, 1, 1]));
});
