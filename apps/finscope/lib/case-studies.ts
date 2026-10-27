import { getCompany } from "./companies";
import { calculateMetrics } from "./market";
import type { FinancialPeriod, Report } from "./types";

// Manually verified consolidated statements; USD millions, never a current-data feed.
const MICROSOFT_PERIODS: FinancialPeriod[] = [
  { year: "2021", revenue: 168088, netIncome: 61271, operatingCashFlow: 76740, capex: 20622, assets: 333779, liabilities: 191791, cash: 14224, debt: 58146, grossProfit: 115856, operatingIncome: 69916, equity: 141988 },
  { year: "2022", revenue: 198270, netIncome: 72738, operatingCashFlow: 89035, capex: 23886, assets: 364840, liabilities: 198298, cash: 13931, debt: 49781, grossProfit: 135620, operatingIncome: 83383, equity: 166542 },
  { year: "2023", revenue: 211915, netIncome: 72361, operatingCashFlow: 87582, capex: 28107, assets: 411976, liabilities: 205753, cash: 34704, debt: 47237, grossProfit: 146052, operatingIncome: 88523, equity: 206223 },
  { year: "2024", revenue: 245122, netIncome: 88136, operatingCashFlow: 118548, capex: 44477, assets: 512163, liabilities: 243686, cash: 18315, debt: 51630, grossProfit: 171008, operatingIncome: 109433, equity: 268477 },
  { year: "2025", revenue: 281724, netIncome: 101832, operatingCashFlow: 136162, capex: 64551, assets: 619003, liabilities: 275524, cash: 30242, debt: 43151, grossProfit: 193893, operatingIncome: 128528, equity: 343479 },
];

export function getCaseStudy(symbol: string): Report | undefined {
  if (symbol.trim().toUpperCase() !== "MSFT") return undefined;
  const periods = MICROSOFT_PERIODS.map((period) => ({ ...period }));
  return {
    id: "case-MSFT", symbol: "MSFT", company: { ...getCompany("MSFT")! },
    generatedAt: "2026-10-27T00:19:36.000Z", dataAsOf: "2025-06-30", mode: "live", dataKind: "filing-snapshot", currency: "USD", periods,
    metrics: calculateMetrics(periods),
    note: "Published financial snapshot: Microsoft FY2021–FY2025, compiled 26 October 2026 (America/Toronto). Frozen annual-report figures, not refreshed data or current market prices. USD millions; fiscal years end 30 June. Cash excludes short-term investments. Debt sums separately reported borrowing lines and excludes lease liabilities. Capex is cash additions to property and equipment; free cash flow excludes finance-lease additions and acquisitions. This case does not incorporate disclosures after FY2025.",
    insights: [
      { title: "Revenue durability", stance: "positive", summary: "FY2025 revenue reached $281.7bn, up 14.9%.", detail: "The five-year record supports a growth thesis. Underwriting still needs segment demand, retention and competitive evidence; historical growth is not a forecast. Source 1." },
      { title: "Operating economics", stance: "positive", summary: "Operating margin reached 45.6%, versus 44.6% in FY2024.", detail: "Monitor whether incremental revenue continues to cover infrastructure and operating costs. Margin expansion alone does not establish an attractive entry valuation. Source 1." },
      { title: "Reinvestment pressure", stance: "caution", summary: "Cash capex rose 45.1%; free cash flow fell 3.3% to $71.6bn.", detail: "Operating cash flow grew, but cash additions to property and equipment grew faster. Test the utilization and return assumptions behind reinvestment. This FCF measure excludes finance-lease additions and acquisitions. Source 1." },
      { title: "Balance-sheet context", stance: "neutral", summary: "Reported borrowings were $43.2bn against $343.5bn of equity.", detail: "Cash and equivalents are a narrower measure than cash plus marketable investments. Lease obligations are excluded from this debt figure and need separate review. Source 1." },
      { title: "Capital efficiency", stance: "neutral", summary: "ROE is 33.3% using average FY2024–FY2025 equity.", detail: "Compare returns with the evolving capital base and financing structure. ROE is not incremental return on invested capital and can be affected by buybacks. Source 1." },
      { title: "Institutional underwriting", stance: "caution", summary: "A strong business still needs a price, a downside case and a portfolio role.", detail: "Next work: explicit valuation scenarios, reinvestment payback, concentration, CAD/USD exposure and evidence that could disprove the thesis. This financial snapshot contains no market price or investment rating." },
    ],
    sources: [
      { label: "Microsoft FY2025 annual report · FY2023–2025 income/cash flows; FY2024–2025 balance sheets", url: "https://www.microsoft.com/investor/reports/ar25/index.html", asOf: "2025-06-30" },
      { label: "Microsoft FY2023 annual report · FY2021–2023 income/cash flows; FY2022–2023 balance sheets", url: "https://www.microsoft.com/investor/reports/ar23/index.html", asOf: "2023-06-30" },
      { label: "Microsoft FY2022 annual report · FY2021 balance sheet and comparative checks", url: "https://www.microsoft.com/investor/reports/ar22/index.html", asOf: "2022-06-30" },
    ],
  };
}

