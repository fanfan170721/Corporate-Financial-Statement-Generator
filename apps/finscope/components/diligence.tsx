"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from '@/components/i18n';
import { tr, type Locale } from '@/lib/i18n';

import Link from "@/components/app-link";
import { ArrowRight, ArrowUpRight, CheckCircle2, Circle, ClipboardCheck, FileText, Flag, LoaderCircle, Save, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api, useApp } from "@/components/shell";
import type { Memo } from "@/lib/types";
import "./diligence.css";

type Status = "unanswered" | "pass" | "watch" | "fail";
type Finding = { status: Status; evidence: string };
type Topic = { key: string; title: string; focus: string; question: string; critical: boolean };
const TOPICS: Topic[] = [
  { key: "process", title: "Investment process", focus: "Repeatability, not a compelling narrative", question: "What is the source of the edge, and why should it persist? Trace a recent investment from research to sizing, implementation and exit. Test whether decisions followed the stated process.", critical: true },
  { key: "team", title: "People & alignment", focus: "Decision rights and incentives", question: "Who actually makes the decisions? Examine turnover, succession, key-person exposure, ownership, compensation and capacity constraints. Ask how incentives align with long-term client outcomes.", critical: true },
  { key: "performance", title: "Performance attribution", focus: "Net returns against a relevant benchmark", question: "Are reported returns net of all relevant fees, and is the benchmark appropriate to the mandate? Separate market exposure, factor tilts, leverage and currency from security selection. Review drawdowns and changes in the composite.", critical: false },
  { key: "governance", title: "Risk & governance", focus: "Independent challenge and escalation", question: "Who can challenge portfolio decisions independently? Examine limits, stress tests, derivatives and collateral oversight, breach escalation and valuation governance. Identify who owns each unresolved exception.", critical: true },
  { key: "operations", title: "Operational resilience", focus: "Controls that protect client assets", question: "Review the roles of the custodian, administrator and auditor. Request evidence of reconciliations, valuation controls, cybersecurity practices, business continuity testing and oversight of material service providers.", critical: true },
  { key: "fees", title: "Fees & economic terms", focus: "The full cost of the mandate", question: "Reconcile management and performance fees, fund expenses and trading costs. For private assets, examine the waterfall, hurdle, catch-up and clawback. Model how terms affect net outcomes under different return paths.", critical: false },
  { key: "liquidity", title: "Liquidity & fund terms", focus: "Portfolio assets versus investor promises", question: "Do asset liquidity, leverage and funding needs match redemption terms or the commitment schedule? Review gates, notice periods, side pockets and suspension rights. Consider the impact on benefit payments and collateral needs under stress.", critical: true },
  { key: "stewardship", title: "Stewardship & material ESG", focus: "Evidence of integration", question: "How do financially material environmental, social and governance issues affect underwriting and monitoring? Request examples of engagement, proxy voting and climate-risk analysis, and test whether reporting supports the stated approach.", critical: false },
];
const STATUS_LABEL: Record<Status, string> = { unanswered: "Not reviewed", pass: "Supported", watch: "Follow-up needed", fail: "Concern identified" };
const initialFindings = () => Object.fromEntries(TOPICS.map(({ key }) => [key, { status: "unanswered", evidence: "" }])) as Record<string, Finding>;
type Review = { manager: string; mandate: string; summary: string; nextSteps: string; riskNotes: string; sources: string; findings: Record<string, Finding> };
const blankReview = (): Review => ({ manager: "", mandate: "", summary: "", nextSteps: "", riskNotes: "", sources: "", findings: initialFindings() });

function memoFromReview(review: Review,locale:Locale) {
  const t=(source:string)=>tr(locale,source);
  const entry = (key: string) => {
    const topic = TOPICS.find((item) => item.key === key)!;
    const finding = review.findings[key];
    return `${t(topic.title)} — ${t(STATUS_LABEL[finding.status])}\n${finding.evidence.trim() || t("No supporting record documented.")}`;
  };
  const outstanding = TOPICS.filter(({ key, critical }) => critical && (review.findings[key].status !== "pass" || !review.findings[key].evidence.trim())).map(({ title }) => t(title));
  return {
    title: tr(locale,'Manager due diligence · {manager}',{manager:review.manager.trim()}), symbol: null,
    thesis: `${t("Mandate")}: ${review.mandate.trim() || t("Not specified")}\n\n${t("Review summary")}\n${review.summary || t("Not documented.")}\n\n${entry("process")}\n\n${entry("performance")}`,
    catalysts: `${entry("team")}\n\n${t("Follow-up owners and next review")}\n${review.nextSteps || t("Not documented.")}`,
    valuation: entry("fees"),
    risks: `${entry("liquidity")}\n\n${t("Additional risk considerations")}\n${review.riskNotes || t("Not documented.")}\n\n${t("Open critical topics")}: ${outstanding.join(", ") || t("None flagged in this working checklist.")}`,
    disconfirming: `${entry("governance")}\n\n${entry("operations")}`,
    evidence: `${entry("stewardship")}\n\n${t("Source register (document, date, owner / link)")}\n${review.sources || t("Not documented.")}\n\n${t("This record captures a working due diligence review. Coverage is not a manager rating, approval or verification of the underlying evidence.")}`,
  };
}

export default function Diligence() {
 const { t, locale } = useI18n();

  const { viewer } = useApp();

  const [review, setReview] = useState<Review>(blankReview);
  const [baseline, setBaseline] = useState(() => JSON.stringify(blankReview()));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ action: () => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = JSON.stringify(review) !== baseline;
  const reviewed = TOPICS.filter(({ key }) => review.findings[key].status !== "unanswered").length;
  const documented = TOPICS.filter(({ key }) => review.findings[key].status !== "unanswered" && review.findings[key].evidence.trim()).length;
  const flags = TOPICS.filter(({ key, critical }) => critical && (review.findings[key].status !== "pass" || !review.findings[key].evidence.trim()));
  const memo = memoFromReview(review,locale);
  const tooLong = Object.values(memo).some((value) => typeof value === "string" && value.length > 2000) || new TextEncoder().encode(JSON.stringify(memo)).byteLength > 16_384;
  const update = (key: Exclude<keyof Review, "findings">, value: string) => setReview((current) => ({ ...current, [key]: value }));
  const updateFinding = (key: string, patch: Partial<Finding>) => setReview((current) => ({ ...current, findings: { ...current.findings, [key]: { ...current.findings[key], ...patch } } }));

  useEffect(() => {
    const element = dialog.current;
    if (pendingNavigation && element && !element.open) element.showModal();
    if (!pendingNavigation && element?.open) element.close();
  }, [pendingNavigation]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const href = window.location.href, historyState = window.history.state;
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation(); window.history.pushState(historyState, "", href);
      setPendingNavigation({ action: () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", back, true); window.history.back(); } });
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.download || link.href === window.location.href) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setPendingNavigation({ action: () => {
        window.removeEventListener("beforeunload", unload);
        const destination = new URL(link.href);
        if (destination.origin === window.location.origin && !destination.pathname.startsWith("/signin-with-chatgpt")) window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
        else window.location.assign(link.href);
      } });
    };
    window.addEventListener("beforeunload", unload); window.addEventListener("popstate", back, true); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", back, true); document.removeEventListener("click", navigate, true); };
  }, [dirty]);

  const save = async () => {
    if (!viewer?.user) { toast.error(t("Sign in to save a due diligence review.")); return; }
    if (!review.manager.trim()) { toast.error(t("Enter a manager or strategy name first.")); return; }
    if (tooLong) { toast.error(t("This review exceeds the memo limits. Shorten your notes; nothing will be clipped.")); return; }
    setSaving(true);
    const submitted = JSON.stringify(review);
    try {
      const result = await api<{ memo: Memo }>(savedId ? `/api/memos/${savedId}` : "/api/memos", { method: savedId ? "PATCH" : "POST", body: JSON.stringify(memo) });
      setSavedId(result.memo.id); setBaseline(submitted);
      toast.success(t("Review saved to your private memo library."));
    } catch (cause) { toast.error(cause instanceof Error ? t(cause.message) : t("Unable to save. Your working notes are still here.")); }
    finally { setSaving(false); }
  };

  return <div className="page diligence-page">
    <div className="diligence-heading"><div><div className="eyebrow">{t("MANAGER DUE DILIGENCE")}</div><h1>{t("Look beyond the track record.")}</h1><p>{t("A structured review of the people, process and controls behind an investment mandate.")}</p></div><span className="diligence-heading-icon"><ClipboardCheck size={29} /></span></div>
    <div className="diligence-callout"><ShieldCheck size={19} /><div><strong>{t("Build an evidence trail, not a manager score.")}</strong><p>{t("These questions organize your research. A completed checklist does not establish suitability or replace independent verification.")}</p></div></div>
    <section className="panel diligence-identity"><label>{t("Manager / strategy")}<input value={review.manager} onChange={(event) => update("manager", event.target.value)} maxLength={100} placeholder={t("Name the manager or investment strategy")} /></label><label>{t("Mandate & portfolio role")}<input value={review.mandate} onChange={(event) => update("mandate", event.target.value)} maxLength={120} placeholder={t("e.g. Canadian core fixed income · liability hedging")} /></label></section>
    <div className="diligence-overview"><div><span>{t("Review coverage")}</span><strong>{reviewed}<small> {t("/ 8 topics")}</small></strong><div className="diligence-progress">{TOPICS.map(({ key }) => <span key={key} className={review.findings[key].status !== "unanswered" ? "filled" : ""} />)}</div></div><div><span>{t("Findings with a record")}</span><strong>{documented}<small> {t("/ 8 topics")}</small></strong><p>{t("A status and an explanatory note")}</p></div><div className={flags.length ? "has-flags" : ""}><span>{t("Open critical topics")}</span><strong>{flags.length.toString().padStart(2, "0")} <Flag size={19} /></strong><p>{flags.length ? t("Resolve questions or document exceptions") : t("No open critical topics in this draft")}</p></div></div>
    <div className="diligence-section-heading"><h2>{t("Eight lenses. One accountable decision.")}</h2><span>{t("Notes: 250 characters per topic")}</span></div>
    <div className="diligence-grid">{TOPICS.map((topic, index) => {
      const finding = review.findings[topic.key];
      return <section className={`panel diligence-topic diligence-${finding.status}`} key={topic.key}><div className="diligence-topic-top"><span className="diligence-number">0{index + 1}</span><div><h3>{t(topic.title)}</h3><span>{t(topic.focus)}</span></div>{topic.critical && <span className="diligence-critical">{t("Critical")}</span>}</div><p>{t(topic.question)}</p><div className="diligence-status-row"><label htmlFor={`status-${topic.key}`}>{t("Review status")}</label><select id={`status-${topic.key}`} value={finding.status} onChange={(event) => updateFinding(topic.key, { status: event.target.value as Status })}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></div><label className="diligence-evidence-label" htmlFor={`evidence-${topic.key}`}>{t("Finding & supporting record")}</label><textarea id={`evidence-${topic.key}`} value={finding.evidence} onChange={(event) => updateFinding(topic.key, { evidence: event.target.value })} maxLength={250} rows={3} placeholder={t("State the finding, the evidence reviewed and any remaining gap.")} /><div className="diligence-topic-foot"><span>{finding.status === "pass" && !finding.evidence.trim() ? t("Add a supporting record to close this topic.") : t("Record facts and unresolved questions separately.")}</span><span>{finding.evidence.length}/250</span></div></section>;
    })}</div>
    <section className="panel diligence-conclusion"><div className="diligence-conclusion-heading"><FileText size={21} /><div><h2>{t("Bring the findings together.")}</h2><p>{t("Capture the discussion an investment committee would need to have.")}</p></div></div><div className="diligence-notes-grid"><label>{t("Review summary")} <small>{review.summary.length}/300</small><textarea value={review.summary} onChange={(event) => update("summary", event.target.value)} maxLength={300} rows={4} placeholder={t("What is supported, what remains uncertain, and what merits further work?")} /></label><label>{t("Follow-up owners & next review")} <small>{review.nextSteps.length}/300</small><textarea value={review.nextSteps} onChange={(event) => update("nextSteps", event.target.value)} maxLength={300} rows={4} placeholder={t("Action / responsible person / target date / evidence required")} /></label><label>{t("Additional risk considerations")} <small>{review.riskNotes.length}/300</small><textarea value={review.riskNotes} onChange={(event) => update("riskNotes", event.target.value)} maxLength={300} rows={4} placeholder={t("Mandate restrictions, exceptions, portfolio interactions or conditions that would change the assessment.")} /></label><label>{t("Source register")} <small>{review.sources.length}/600</small><textarea value={review.sources} onChange={(event) => update("sources", event.target.value)} maxLength={600} rows={4} placeholder={t("Document or interview / date / source owner / URL. Identify records that are still outstanding.")} /></label></div></section>
    <section className="diligence-save-panel"><div className="diligence-save-copy"><span>{dirty ? <Circle size={13} /> : <CheckCircle2 size={15} />}{savedId ? dirty ? t("Unsaved updates") : t("Saved to your memo library") : t("Working draft")}</span><p>{t("The complete review is saved as an investment memo, including every status, note and open critical topic.")}</p>{tooLong && <strong className="diligence-limit-error">{t("Review exceeds memo limits. Shorten your notes before saving; content is never clipped.")}</strong>}</div><div className="diligence-save-actions">{savedId && <Link className="button" href={`/memos?id=${encodeURIComponent(savedId)}`}>{t("Open saved memo")} <ArrowUpRight size={15} /></Link>}{viewer?.user ? <button className="button button-dark" onClick={() => void save()} disabled={saving || tooLong || (Boolean(savedId) && !dirty)}>{saving ? <LoaderCircle size={16} className="diligence-spin" /> : <Save size={16} />}{saving ? t("Saving…") : savedId ? t("Update saved review") : t("Save review as memo")}</button> : <a className="button button-dark" href="/login?return_to=%2Fdiligence" target="_top">{t("Sign in to save")} <ArrowRight size={15} /></a>}</div></section>
    <dialog className="diligence-dialog" ref={dialog} aria-labelledby="diligence-leave-title" onCancel={(event) => { event.preventDefault(); setPendingNavigation(null); }}><button className="diligence-dialog-close" onClick={() => setPendingNavigation(null)} aria-label={t("Close")}><X size={18} /></button><h2 id="diligence-leave-title">{t("Keep your working notes?")}</h2><p>{t("Your latest edits have not been saved. Stay here to save them, or discard the changes and leave.")}</p><div><button className="button" onClick={() => setPendingNavigation(null)}>{t("Keep editing")}</button><button className="button button-dark" onClick={() => { const action = pendingNavigation?.action; setPendingNavigation(null); action?.(); }}>{t("Discard and leave")}</button></div></dialog>
  </div>;
}
