export type LiquidityConfig = {
  version: 1; initialLiquidAssets: number; annualBenefits: number; annualContributions: number;
  unfundedCommitments: number; commitmentDrawPercent: number; callWeights: number[];
  annualDistributions: number; annualYieldPercent: number; liquidityBuffer: number;
  stressAcceleration: number; stressDistributionHaircut: number; stressContributionDecline: number;
  stressBenefitIncrease: number; stressYieldShiftBps: number;
};
export type LiquidityMonth = {
  month: number; label: string; opening: number; investmentIncome: number; contributions: number;
  distributions: number; benefits: number; capitalCalls: number; netFlow: number; closing: number;
  remainingCommitments: number; cumulativeCalls: number;
};
export type LiquidityProjection = {
  months: LiquidityMonth[]; endingBalance: number; minimumBalance: number; minimumMonth: number;
  firstBreach: number | null; firstBufferBreach: number | null; fundingGap: number;
  twelveMonthCoverage: number | null; totalCalls: number; totalInvestmentIncome: number;
  totalContributions: number; totalDistributions: number; totalBenefits: number;
};
export const DEFAULT_LIQUIDITY: LiquidityConfig = {
  version: 1, initialLiquidAssets: 12, annualBenefits: 6, annualContributions: 4,
  unfundedCommitments: 12, commitmentDrawPercent: 75, callWeights: [15, 25, 30, 30],
  annualDistributions: 3, annualYieldPercent: 2.5, liquidityBuffer: 2,
  stressAcceleration: 2, stressDistributionHaircut: 75, stressContributionDecline: 20,
  stressBenefitIncrease: 10, stressYieldShiftBps: -100,
};
const finiteRange = (value: unknown, minimum: number, maximum: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

export function validateLiquidityConfig(value: unknown): value is LiquidityConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  const monetary = ["initialLiquidAssets", "annualBenefits", "annualContributions", "unfundedCommitments", "annualDistributions", "liquidityBuffer"];
  return c.version === 1 && monetary.every((key) => finiteRange(c[key], 0, 1000))
    && finiteRange(c.commitmentDrawPercent, 0, 100) && finiteRange(c.annualYieldPercent, -5, 15)
    && finiteRange(c.stressAcceleration, 1, 3) && finiteRange(c.stressDistributionHaircut, 0, 100)
    && finiteRange(c.stressContributionDecline, 0, 100) && finiteRange(c.stressBenefitIncrease, 0, 100)
    && finiteRange(c.stressYieldShiftBps, -500, 500)
    && Array.isArray(c.callWeights) && c.callWeights.length === 4 && c.callWeights.every((weight) => finiteRange(weight, 0, 100))
    && c.callWeights.reduce((sum: number, weight: number) => sum + weight, 0) > 0;
}

/** Four six-month buckets, allocated uniformly inside each bucket. Timing compression preserves the total. */
export function capitalCallSchedule(commitments: number, drawPercent: number, bucketWeights: number[], acceleration = 1): number[] {
  if (!finiteRange(commitments, 0, 1000) || !finiteRange(drawPercent, 0, 100) || !finiteRange(acceleration, 1, 3) || bucketWeights.length !== 4 || !bucketWeights.every((weight) => finiteRange(weight, 0, 100))) throw new Error("Invalid commitment assumptions");
  const totalWeight = bucketWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) throw new Error("Capital-call weights cannot all be zero");
  const planned = commitments * drawPercent / 100;
  const schedule = Array.from({ length: 24 }, () => 0);
  for (let month = 1; month <= 24; month++) {
    const target = Math.max(1, Math.ceil(month / acceleration));
    schedule[target - 1] += planned * bucketWeights[Math.floor((month - 1) / 6)] / totalWeight / 6;
  }
  // Remove floating-point residual from the last nonempty month, without changing timing.
  const last = schedule.findLastIndex((amount) => amount > 0);
  if (last >= 0) schedule[last] += planned - schedule.reduce((sum, amount) => sum + amount, 0);
  return schedule;
}

export function projectLiquidity(config: LiquidityConfig, stressed = false): LiquidityProjection {
  if (!validateLiquidityConfig(config)) throw new Error("Invalid liquidity assumptions");
  const calls = capitalCallSchedule(config.unfundedCommitments, config.commitmentDrawPercent, config.callWeights, stressed ? config.stressAcceleration : 1);
  const contribution = config.annualContributions / 12 * (stressed ? 1 - config.stressContributionDecline / 100 : 1);
  const distribution = config.annualDistributions / 12 * (stressed ? 1 - config.stressDistributionHaircut / 100 : 1);
  const benefit = config.annualBenefits / 12 * (stressed ? 1 + config.stressBenefitIncrease / 100 : 1);
  const annualYield = config.annualYieldPercent + (stressed ? config.stressYieldShiftBps / 100 : 0);
  const monthlyYield = annualYield / 100 / 12;
  let opening = config.initialLiquidAssets;
  let cumulativeCalls = 0;
  const months = calls.map((capitalCalls, index): LiquidityMonth => {
    const investmentIncome = Math.max(opening, 0) * monthlyYield;
    cumulativeCalls += capitalCalls;
    const netFlow = investmentIncome + contribution + distribution - benefit - capitalCalls;
    const closing = opening + netFlow;
    const row = { month: index + 1, label: `M${String(index + 1).padStart(2, "0")}`, opening, investmentIncome, contributions: contribution, distributions: distribution, benefits: benefit, capitalCalls, netFlow, closing, remainingCommitments: Math.max(0, config.unfundedCommitments - cumulativeCalls), cumulativeCalls };
    opening = closing;
    return row;
  });
  const firstYear = months.slice(0, 12);
  const uses = firstYear.reduce((sum, month) => sum + month.benefits + month.capitalCalls, 0);
  const sources = config.initialLiquidAssets + firstYear.reduce((sum, month) => sum + month.contributions + month.distributions + month.investmentIncome, 0);
  const minimum = months.reduce((lowest, month) => month.closing < lowest.closing ? month : lowest, months[0]);
  return {
    months, endingBalance: months[23].closing, minimumBalance: Math.min(config.initialLiquidAssets, minimum.closing), minimumMonth: minimum.closing < config.initialLiquidAssets ? minimum.month : 0,
    firstBreach: config.initialLiquidAssets < 0 ? 0 : months.find((month) => month.closing < -1e-9)?.month ?? null,
    firstBufferBreach: config.initialLiquidAssets < config.liquidityBuffer ? 0 : months.find((month) => month.closing < config.liquidityBuffer - 1e-9)?.month ?? null,
    fundingGap: Math.max(0, -minimum.closing), twelveMonthCoverage: uses > 0 ? sources / uses : null,
    totalCalls: cumulativeCalls, totalInvestmentIncome: months.reduce((sum, month) => sum + month.investmentIncome, 0),
    totalContributions: contribution * 24, totalDistributions: distribution * 24, totalBenefits: benefit * 24,
  };
}
