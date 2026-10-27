"use client";
import { useI18n } from "@/components/i18n";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Download, FlaskConical, Info, Layers3, Printer, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ResearchScenarios from "./research-scenarios";
import "./allocation-lab.css";
const ASSET_DEFINITIONS = [
    { id: "equities", name: "Public equities", english: "Public equities", color: "var(--al-equities)", description: "Earnings and valuation exposure" },
    { id: "government", name: "Government bonds", english: "Government bonds", color: "var(--al-government)", description: "Sensitivity to changing yields" },
    { id: "credit", name: "Credit", english: "Credit", color: "var(--al-credit)", description: "Rates and credit-spread exposure" },
    { id: "real", name: "Real assets", english: "Real assets", color: "var(--al-real)", description: "Property and infrastructure" },
    { id: "private", name: "Private equity", english: "Private equity", color: "var(--al-private)", description: "Valuation and exit lags" },
    { id: "cash", name: "Cash", english: "Cash", color: "var(--al-cash)", description: "Available cash, excluding receivables" },
];
const PRESET_DEFINITIONS = [
    { id: "recession", label: "Recession", english: "RECESSION", description: "Risk assets fall; yields decline", shift: -100, returns: [-22, 0, -10, -12, -20, 0], icon: "↘" },
    { id: "inflation", label: "Inflation resurgence", english: "INFLATION", description: "Margin pressure; real-asset repricing", shift: 150, returns: [-12, 0, -5, 6, -10, 0], icon: "↗" },
    { id: "rates", label: "Rates repricing", english: "RATE SHOCK", description: "Parallel yield shift; duration losses", shift: 200, returns: [-8, 0, -3, -6, -10, 0], icon: "〰" },
    { id: "easing", label: "The funding paradox", english: "FUNDING PARADOX", description: "Rising assets can mask weaker funding", shift: -100, returns: [8, 0, 2, 6, 8, 0], icon: "⇄" },
];
const INITIAL_WEIGHTS = [30, 25, 15, 15, 10, 5];
const bounded = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
/** Use integer tenths and largest remainders so allocations always sum to exactly 100%. */
function rebalance(weights: number[], index: number, value: number): number[] {
    const selected = Math.round(bounded(value, 0, 100) * 10);
    const remaining = 1000 - selected;
    const peers = weights.map((weight, position) => ({ position, weight })).filter((item) => item.position !== index);
    const total = peers.reduce((sum, item) => sum + item.weight, 0);
    const distributed = peers.map((item) => ({ position: item.position, exact: remaining * (total > 0 ? item.weight / total : 1 / peers.length) }));
    const allocations = distributed.map((item) => ({ ...item, units: Math.floor(item.exact) }));
    const extra = remaining - allocations.reduce((sum, item) => sum + item.units, 0);
    const priority = [...allocations].sort((a, b) => (b.exact - b.units) - (a.exact - a.units));
    for (let cursor = 0; cursor < extra; cursor++)
        priority[cursor].units++;
    return weights.map((_, position) => position === index ? selected / 10 : allocations.find((item) => item.position === position)!.units / 10);
}
function calculate(weights: number[], shocks: number[], yieldBps: number, assets: number, liabilities: number, governmentDuration: number, creditDuration: number, liabilityDuration: number) {
    const returns = shocks.map((shock, index) => shock - (index === 1 ? governmentDuration : index === 2 ? creditDuration : 0) * yieldBps / 100);
    const contributions = returns.map((shock, index) => weights[index] / 100 * shock);
    const assetReturn = contributions.reduce((sum, contribution) => sum + contribution, 0);
    const endingAssets = assets * (1 + assetReturn / 100);
    const liabilityChange = -liabilityDuration * yieldBps / 100;
    const endingLiabilities = liabilities * (1 + liabilityChange / 100);
    return { returns, contributions, assetReturn, endingAssets, endingLiabilities, liabilityChange, fundingRatio: endingAssets / endingLiabilities * 100, surplus: endingAssets - endingLiabilities };
}
export default function AllocationLab() {
const { t, locale } = useI18n();
const ASSETS = ASSET_DEFINITIONS.map(asset => ({...asset, name:t(asset.name), english:t(asset.english), description:t(asset.description)}));
const PRESETS = PRESET_DEFINITIONS.map(preset => ({...preset, label:t(preset.label), english:t(preset.english), description:t(preset.description)}));
const fmt = (value: number, digits=1) => value.toLocaleString(locale,{minimumFractionDigits:digits,maximumFractionDigits:digits});
const signed = (value:number,digits=1) => `${value>0?"+":""}${fmt(value,digits)}`;
    const [weights, setWeights] = useState(INITIAL_WEIGHTS);
    const [preset, setPreset] = useState("easing");
    const [shocks, setShocks] = useState(PRESETS[3].returns);
    const [yieldBps, setYieldBps] = useState(-100);
    const [assets, setAssets] = useState(100);
    const [liabilities, setLiabilities] = useState(92);
    const [liabilityDuration, setLiabilityDuration] = useState(14);
    const [governmentDuration, setGovernmentDuration] = useState(7);
    const [creditDuration, setCreditDuration] = useState(5);
    const [exported, setExported] = useState(false);
    const scenarioConfig = { version: 1, weights, shocks, preset, yieldBps, assets, liabilities, liabilityDuration, governmentDuration, creditDuration };
    function loadScenario(value: unknown) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("Invalid scenario format.");
        const saved = value as Record<string, unknown>;
        const validNumber = (key: string, minimum: number, maximum: number) => typeof saved[key] === "number" && Number.isFinite(saved[key]) && (saved[key] as number) >= minimum && (saved[key] as number) <= maximum;
        const validArray = (key: string, minimum: number, maximum: number) => Array.isArray(saved[key]) && saved[key].length === 6 && saved[key].every((item) => typeof item === "number" && Number.isFinite(item) && item >= minimum && item <= maximum);
        if (saved.version !== 1 || !validArray("weights", 0, 100) || !validArray("shocks", -50, 50) || Math.abs((saved.weights as number[]).reduce((sum, weight) => sum + weight, 0) - 100) > 1e-6 || !validNumber("yieldBps", -200, 200) || !validNumber("assets", 1, 1000) || !validNumber("liabilities", 1, 1000) || !validNumber("liabilityDuration", 0, 25) || !validNumber("governmentDuration", 0, 20) || !validNumber("creditDuration", 0, 15))
            throw new Error("This scenario has an unsupported version or invalid assumptions. The current model is unchanged.");
        setWeights([...(saved.weights as number[])]);
        setShocks([...(saved.shocks as number[])]);
        setPreset(typeof saved.preset === "string" && PRESETS.some((item) => item.id === saved.preset) ? saved.preset : "custom");
        setYieldBps(saved.yieldBps as number);
        setAssets(saved.assets as number);
        setLiabilities(saved.liabilities as number);
        setLiabilityDuration(saved.liabilityDuration as number);
        setGovernmentDuration(saved.governmentDuration as number);
        setCreditDuration(saved.creditDuration as number);
    }
    const result = useMemo(() => calculate(weights, shocks, yieldBps, assets, liabilities, governmentDuration, creditDuration, liabilityDuration), [weights, shocks, yieldBps, assets, liabilities, governmentDuration, creditDuration, liabilityDuration]);
    const startingRatio = assets / liabilities * 100;
    const fundingDelta = result.fundingRatio - startingRatio;
    const liquidShare = weights[1] + weights[5];
    const effectiveExposures = 1 / weights.reduce((sum, weight) => sum + (weight / 100) ** 2, 0);
    const paradox = result.assetReturn > 0 && fundingDelta < 0;
    const holdings = ASSETS.map((asset, index) => ({ ...asset, weight: weights[index], shock: result.returns[index], contribution: result.contributions[index], value: assets * weights[index] / 100 }));
    const sensitivity = Array.from({ length: 17 }, (_, index) => {
        const shift = -200 + index * 25;
        const scenario = calculate(weights, shocks, shift, assets, liabilities, governmentDuration, creditDuration, liabilityDuration);
        return { shift, funding: Number(scenario.fundingRatio.toFixed(2)), assets: Number(scenario.endingAssets.toFixed(2)), liabilities: Number(scenario.endingLiabilities.toFixed(2)) };
    });
    function choosePreset(id: string) {
        const next = PRESETS.find((item) => item.id === id)!;
        setPreset(id);
        setShocks([...next.returns]);
        setYieldBps(next.shift);
    }
    function reset() {
        setWeights([...INITIAL_WEIGHTS]);
        setAssets(100);
        setLiabilities(92);
        setLiabilityDuration(14);
        setGovernmentDuration(7);
        setCreditDuration(5);
        choosePreset("easing");
    }
    function exportScenario() {
        const snapshot = {
            schemaVersion: 1, title: t("Finscope · Asset–liability scenario"), generatedAt: new Date().toISOString(), type: "hypothetical_instantaneous_stress", currency: "CAD", monetaryUnit: "billion", representsRealInstitution: false,
            assumptions: { startingAssets: assets, startingLiabilities: liabilities, governmentDuration, creditDuration, liabilityDuration, yieldShiftBps: yieldBps, weightsPercent: Object.fromEntries(ASSETS.map((asset, index) => [asset.id, weights[index]])), nonRateShocksPercent: Object.fromEntries(ASSETS.map((asset, index) => [asset.id, shocks[index]])) },
            result: { ...result, startingFundingRatioPercent: startingRatio, fundingChangePercentagePoints: fundingDelta, cashAndGovernmentBondSharePercent: liquidShare, effectiveNumberOfAssetClasses: effectiveExposures },
            limitations: ["Hypothetical stress, not a backtest, forecast or actual pension portfolio", "First-order duration approximation; convexity is excluded", "Cash and government-bond weight is not available cash; encumbrance, margin and haircuts are excluded", "Contributions, benefits, FX, derivatives, leverage, fees and default transmission are excluded", "Private-market valuation lags and cross-asset correlations are not modelled"].map(text => t(text)),
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `finscope-allocation-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setExported(true);
        setTimeout(() => setExported(false), 2500);
    }
    return (<div className="page allocation-lab">
      <div className="al-page-top"><span className="al-eyebrow"><FlaskConical size={15}/>{" " + t("INSTITUTIONAL RESEARCH / 02")}</span><span className="al-model-label"><span />{" " + t("Transparent assumptions \u00B7 Reproducible results")}</span></div>
      <header className="al-heading">
        <div><h1>{t("Assets move.")}<br /><span>{t("Liabilities do, too.")}</span></h1><p>{t("Connect portfolio construction with the obligations it supports.")}<br className="al-desktop-break"/>{t("Stress both sides of the balance sheet. See what changes.")}</p></div>
        <div className="al-heading-art" aria-hidden="true"><span className="al-orbit al-orbit-one"/><span className="al-orbit al-orbit-two"/><span className="al-orbit-core">{t("A")}<span> / </span>{t("L")}</span><span className="al-art-label">{t("ASSETS \u2194 LIABILITIES")}</span></div>
      </header>

      <div className="al-tool-row"><div><span className="al-small-tag">{t("Research lab")}</span><span>{t("Hypothetical pension balance sheet \u00B7 CAD billions")}</span></div><div className="al-tools"><button type="button" onClick={reset}><RotateCcw size={14}/>{" " + t("Reset")}</button><button type="button" onClick={() => window.print()}><Printer size={14}/>{" " + t("Print")}</button><button type="button" onClick={exportScenario} className="al-export">{exported ? <Check size={14}/> : <Download size={14}/>}{exported ? t("Exported") : t("Export scenario")}</button></div></div>
      <ResearchScenarios kind="allocation" config={scenarioConfig} onLoad={loadScenario} defaultName={t("Pension ALM \u00B7 Rate sensitivity")}/>

      <section className="al-scenarios" aria-label={t("Choose a hypothetical stress scenario")}>
        {PRESETS.map((item) => <button key={item.id} type="button" className={`al-scenario ${preset === item.id ? "is-active" : ""}`} aria-pressed={preset === item.id} onClick={() => choosePreset(item.id)}><span className="al-scenario-icon">{item.icon}</span><span className="al-scenario-copy"><small>{item.english}</small><strong>{item.label}</strong><span>{item.description}</span></span><span className="al-scenario-check">{preset === item.id ? <Check size={13}/> : <ArrowRight size={13}/>}</span></button>)}
      </section>

      <section className="al-stats" aria-label={t("Scenario results")} aria-live="polite">
        <article className="al-stat al-stat-primary"><span>{t("Stressed funded ratio")}</span><div>{fmt(result.fundingRatio)}<small>%</small></div><p><span className={fundingDelta < 0 ? "al-negative" : "al-positive"}>{fundingDelta < 0 ? <ArrowDownRight size={13}/> : <ArrowUpRight size={13}/>}{signed(fundingDelta)}{" " + t("percentage points")}</span><span>{t("Starting") + " "}{fmt(startingRatio)}%</span></p></article>
        <article className="al-stat"><span>{t("Stressed surplus / deficit")}</span><div>{signed(result.surplus)}<small>{t("CAD bn")}</small></div><p>{t("Assets") + " "}{fmt(result.endingAssets)}{" " + t("\u2212 liabilities") + " "}{fmt(result.endingLiabilities)}</p></article>
        <article className="al-stat"><span>{t("Cash + government bonds")}</span><div>{fmt(liquidShare)}<small>%</small></div><p>{t("Before encumbrance, margin and haircuts")}</p></article>
        <article className="al-stat"><span>{t("Effective asset classes")}</span><div>{fmt(effectiveExposures, 2)}<small>/ 6</small></div><p>{t("Weight concentration; not risk diversification")}</p></article>
      </section>

      <div className={`al-finding ${paradox ? "al-finding-paradox" : ""}`}><span className="al-finding-symbol">{paradox ? "⇄" : "◎"}</span><div><strong>{paradox ? t("Positive returns. A weaker funding position.") : result.fundingRatio < 100 ? t("Assets fall short of the modelled liabilities.") : t("Assets remain above the modelled liabilities.")}</strong><p>{paradox ? t("Assets rise {value0}%, while lower discount rates increase liabilities by {value1}%. Longer liability duration can outweigh positive portfolio returns.", { value0: fmt(result.assetReturn), value1: fmt(result.liabilityChange) }) : t("The portfolio changes by {value0}%; liability revaluation is {value1}%. Relative movements matter more for funding than asset returns alone.", { value0: signed(result.assetReturn), value1: signed(result.liabilityChange) })}</p></div><span className="al-finding-tag">{t("Research observation")}</span></div>

      <section className="al-workspace">
        <div className="al-panel al-allocation-panel">
          <div className="al-panel-heading"><div><span className="al-step">{t("01 / ALLOCATION")}</span><h2>{t("Build the allocation")}</h2></div><span className="al-total"><Check size={13}/> {fmt(100)}%</span></div>
          <p className="al-helper">{t("Changing one weight rebalances the others proportionally. The portfolio always totals 100%.")}</p>
          <div className="al-holdings">
            {holdings.map((asset, index) => <div className="al-holding" key={asset.id}><div className="al-holding-title"><span className="al-dot" style={{ background: asset.color }}/><label htmlFor={`weight-${asset.id}`}>{asset.name}</label><output htmlFor={`weight-${asset.id}`}>{fmt(asset.weight)}<small>%</small></output></div><input id={`weight-${asset.id}`} aria-label={t("{value0} allocation weight", { value0: asset.name })} type="range" min="0" max="100" step="0.1" value={asset.weight} style={{ accentColor: asset.color }} onChange={(event) => setWeights((current) => rebalance(current, index, Number(event.target.value)))}/><div className="al-holding-bottom"><span>{asset.description}</span><span>{fmt(asset.value)}{" " + t("bn")}</span></div></div>)}
          </div>
        </div>
        <div className="al-panel al-composition-panel">
          <div className="al-panel-heading"><div><span className="al-step">{t("PORTFOLIO SNAPSHOT")}</span><h2>{t("Understand the exposures")}</h2></div><Layers3 size={19}/></div>
          <div className="al-donut" role="img" aria-label={t("Six-asset allocation: Public equities {value0}%, Government bonds {value1}%, Credit {value2}%, Real assets {value3}%, Private equity {value4}%, Cash {value5}%", { value0: weights[0], value1: weights[1], value2: weights[2], value3: weights[3], value4: weights[4], value5: weights[5] })}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={holdings} dataKey="weight" nameKey="name" innerRadius="69%" outerRadius="90%" stroke="var(--panel, #fff)" strokeWidth={5} paddingAngle={1} isAnimationActive={false}>{holdings.map((asset) => <Cell key={asset.id} fill={asset.color}/>)}</Pie><Tooltip formatter={(value) => [`${fmt(Number(value))}%`, t("allocation weight")]} contentStyle={{ background: "var(--panel, #fff)", border: "1px solid var(--line, #e6e9ef)", borderRadius: 12, color: "var(--ink, #20242c)" }}/></PieChart></ResponsiveContainer><div className="al-donut-center"><span>{t("Starting assets")}</span><strong>{fmt(assets, 0)}</strong><small>{t("CAD bn")}</small></div></div>
          <div className="al-legend">{holdings.map((asset) => <div key={asset.id}><span><i style={{ background: asset.color }}/>{asset.name}</span><strong>{fmt(asset.weight)}%</strong></div>)}</div>
          <div className="al-liquidity-note"><Info size={15}/><p>{t("Government bonds may trade in liquid markets, but their value moves with yields. This weight is not a measure of immediately available cash.")}</p></div>
        </div>
      </section>

      <section className="al-panel al-assumptions-panel">
        <div className="al-panel-heading"><div><span className="al-step">{t("02 / ASSUMPTIONS")}</span><h2>{t("Make the assumptions explicit")}</h2></div><span className="al-small-tag">{preset === "custom" ? t("Custom scenario") : PRESETS.find((item) => item.id === preset)?.label}</span></div>
        <div className="al-assumptions-grid">
          <div className="al-balance-fields"><h3>{t("Opening balance sheet")}</h3><label htmlFor="starting-assets">{t("Starting assets") + " "}<span>{t("CAD bn")}</span><input id="starting-assets" type="number" min="1" max="1000" step="1" value={assets} onChange={(event) => setAssets(bounded(Number(event.target.value), 1, 1000))}/></label><label htmlFor="starting-liabilities">{t("Starting liability value") + " "}<span>{t("CAD bn")}</span><input id="starting-liabilities" type="number" min="1" max="1000" step="1" value={liabilities} onChange={(event) => setLiabilities(bounded(Number(event.target.value), 1, 1000))}/></label><p>{t("The 100 / 92 starting point is illustrative and does not represent an institution.")}</p></div>
          <div className="al-duration-fields"><h3>{t("Rates and duration") + " "}<span>{t("First-order approximation")}</span></h3><div className="al-rate-label"><label htmlFor="yield-shift">{t("Parallel yield shift")}</label><output htmlFor="yield-shift">{signed(yieldBps, 0)} <small>{t("bp")}</small></output></div><input id="yield-shift" type="range" min="-200" max="200" step="10" value={yieldBps} onChange={(event) => { setYieldBps(Number(event.target.value)); setPreset("custom"); }}/><div className="al-range-ends"><span>{t("\u2212200 bp")}</span><span>0</span><span>{t("+200 bp")}</span></div><div className="al-duration-row"><label htmlFor="gov-duration">{t("Government-bond duration")}<input id="gov-duration" type="number" min="0" max="20" step="0.5" value={governmentDuration} onChange={(event) => setGovernmentDuration(bounded(Number(event.target.value), 0, 20))}/><span>{t("yrs")}</span></label><label htmlFor="credit-duration">{t("Credit duration")}<input id="credit-duration" type="number" min="0" max="15" step="0.5" value={creditDuration} onChange={(event) => setCreditDuration(bounded(Number(event.target.value), 0, 15))}/><span>{t("yrs")}</span></label><label htmlFor="liability-duration">{t("Liability duration")}<input id="liability-duration" type="number" min="0" max="25" step="0.5" value={liabilityDuration} onChange={(event) => setLiabilityDuration(bounded(Number(event.target.value), 0, 25))}/><span>{t("yrs")}</span></label></div></div>
          <div className="al-shock-fields"><h3>{t("Non-rate price shocks") + " "}<SlidersHorizontal size={13}/></h3><p>{t("Bond duration effects are added separately.")}</p><div>{ASSETS.map((asset, index) => <label key={asset.id} htmlFor={`shock-${asset.id}`}><span><i style={{ background: asset.color }}/>{asset.name}</span><span className="al-number-unit"><input id={`shock-${asset.id}`} aria-label={t("{value0} non-rate price shock (%)", { value0: asset.name })} type="number" min="-50" max="50" step="1" value={shocks[index]} onChange={(event) => { setShocks((current) => current.map((value, position) => position === index ? bounded(Number(event.target.value), -50, 50) : value)); setPreset("custom"); }}/><span>%</span></span></label>)}</div></div>
        </div>
      </section>

      <section className="al-charts">
        <article className="al-panel"><div className="al-panel-heading"><div><span className="al-step">{t("03 / ATTRIBUTION")}</span><h2>{t("Attribute the asset return")}</h2></div><span className="al-chart-unit">{t("Contribution \u00B7 pp")}</span></div><p className="al-helper">{t("Portfolio return") + " "}{signed(result.assetReturn)}{t("%, decomposed by allocation weight and including bond duration effects.")}</p><div className="al-chart" role="img" aria-label={t("Asset-class contributions to the portfolio return")}><ResponsiveContainer width="100%" height="100%"><BarChart data={holdings} layout="vertical" margin={{ left: 0, right: 20, top: 10, bottom: 0 }}><CartesianGrid stroke="var(--line, #e9edf2)" horizontal={false} strokeDasharray="3 4"/><XAxis type="number" tick={{ fill: "var(--muted, #7b8493)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${fmt(Number(value), 0)}%`}/><YAxis dataKey="name" type="category" tick={{ fill: "var(--muted, #7b8493)", fontSize: 11 }} width={118} tickLine={false} axisLine={false}/><Tooltip cursor={{ fill: "var(--soft, #f5f8fb)" }} formatter={(value) => [t("{value0} percentage points", { value0: signed(Number(value), 2) }), t("Return contribution")]} contentStyle={{ background: "var(--panel, #fff)", border: "1px solid var(--line, #e9edf2)", borderRadius: 12, color: "var(--ink, #20242c)" }}/><ReferenceLine x={0} stroke="var(--muted, #7b8493)"/><Bar dataKey="contribution" radius={[0, 5, 5, 0]} maxBarSize={20} isAnimationActive={false}>{holdings.map((asset) => <Cell key={asset.id} fill={asset.contribution < 0 ? "var(--al-negative)" : asset.color}/>)}</Bar></BarChart></ResponsiveContainer></div></article>
        <article className="al-panel"><div className="al-panel-heading"><div><span className="al-step">{t("04 / SENSITIVITY")}</span><h2>{t("Map funding sensitivity")}</h2></div><span className="al-chart-unit">%</span></div><p className="al-helper">{t("Other shocks stay constant. This is a sensitivity curve, not a forecast or probability distribution.")}</p><div className="al-chart" role="img" aria-label={t("Funded ratio across parallel yield shifts from minus 200 to plus 200 basis points")}><ResponsiveContainer width="100%" height="100%"><LineChart data={sensitivity} margin={{ left: -15, right: 12, top: 15, bottom: 0 }}><CartesianGrid stroke="var(--line, #e9edf2)" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="shift" type="number" domain={[-200, 200]} ticks={[-200, -100, 0, 100, 200]} tick={{ fill: "var(--muted, #7b8493)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => signed(Number(value), 0)} label={{ value: t("Yield shift (bp)"), position: "insideBottom", offset: -2, fill: "var(--muted, #7b8493)", fontSize: 10 }} height={40}/><YAxis domain={["auto", "auto"]} tick={{ fill: "var(--muted, #7b8493)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${fmt(Math.round(value), 0)}%`}/><Tooltip labelFormatter={(value) => t("Yield shift {value0} bp", { value0: signed(Number(value), 0) })} formatter={(value) => [`${fmt(Number(value))}%`, t("Funded ratio")]} contentStyle={{ background: "var(--panel, #fff)", border: "1px solid var(--line, #e9edf2)", borderRadius: 12, color: "var(--ink, #20242c)" }}/><ReferenceLine y={100} stroke="#d995ac" strokeDasharray="4 4" label={{ value: "100%", fill: "#ba7a90", fontSize: 10, position: "insideTopRight" }}/><ReferenceLine x={yieldBps} stroke="var(--muted, #7b8493)" strokeDasharray="3 4"/><Line type="monotone" dataKey="funding" stroke="var(--al-equities)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--panel, #fff)" }} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></article>
      </section>

      <section className="al-panel al-detail-panel"><div className="al-panel-heading"><div><span className="al-step">{t("RESEARCH WORKSHEET")}</span><h2>{t("An auditable worksheet")}</h2></div><span className="al-chart-unit">{t("CAD bn")}</span></div><div className="al-table-scroll"><table><thead><tr><th>{t("Asset class")}</th><th>{t("Weight")}</th><th>{t("Starting value")}</th><th>{t("Non-rate shock")}</th><th>{t("Duration effect")}</th><th>{t("Total shock")}</th><th>{t("Return contribution")}</th></tr></thead><tbody>{holdings.map((asset, index) => <tr key={asset.id}><td><i style={{ background: asset.color }}/>{asset.name}</td><td>{fmt(asset.weight)}%</td><td>{fmt(asset.value, 2)}</td><td>{signed(shocks[index])}%</td><td>{signed(asset.shock - shocks[index])}%</td><td className={asset.shock < 0 ? "al-negative" : asset.shock > 0 ? "al-positive" : ""}>{signed(asset.shock)}%</td><td>{signed(asset.contribution, 2)}{" " + t("pp")}</td></tr>)}</tbody><tfoot><tr><td>{t("Total portfolio")}</td><td>{fmt(100)}%</td><td>{fmt(assets, 2)}</td><td>—</td><td>—</td><td>{signed(result.assetReturn)}%</td><td>{signed(result.assetReturn, 2)}{" " + t("pp")}</td></tr></tfoot></table></div></section>

      <details className="al-methodology" open><summary><span><Info size={16}/>{" " + t("Methodology and limitations")}</span><ChevronDown size={16}/></summary><div className="al-methodology-content"><div><h3>{t("Reproduce the calculation")}</h3><p><code>{t("Asset return = \u03A3(weight \u00D7 asset-class shock)")}</code></p><p><code>{t("Bond return \u2248 \u2212modified duration \u00D7 \u0394yield")}</code></p><p><code>{t("Liability change \u2248 \u2212liability duration \u00D7 \u0394discount rate")}</code></p><p><code>{t("Funded ratio = stressed assets / stressed liabilities")}</code></p><p><code>{t("Effective classes = 1 / \u03A3(weight\u00B2)")}</code></p><small>{t("100 bp = 1% = 0.01. Bond yields and the liability discount rate move together here; in practice their basis can change.")}</small></div><div><h3>{t("A hypothetical stress, not a backtest or forecast")}</h3><p>{t("All allocations and shocks are user assumptions, not an actual pension portfolio, return history or actuarial valuation. The model does not produce investment ratings or allocation advice.")}</p><p>{t("First-order duration ignores convexity, curve twists, inflation-linked benefits, contributions and benefit cash flows, FX, leverage, derivatives, default transmission and correlations. Large rate shocks can produce substantial approximation error. Private-market valuation lags are also excluded.")}</p><p>{t("Cash and government-bond weights are broad categories. They do not replace a liquidity stress test, collateral analysis or actuarial valuation.")}</p></div></div></details>
      <footer className="al-local-notice"><span className="al-local-dot"/>{" " + t("Unsaved changes stay on this page. Save a scenario to continue across devices, or export a JSON snapshot.")}<span>{t("MAKE ASSUMPTIONS VISIBLE.")}</span></footer>
    </div>);
}
