"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from '@/components/i18n';
import type { Locale } from '@/lib/i18n';

import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, Clock3, Download, FileSearch, Library, LoaderCircle, NotebookPen, Plus, Printer, Save, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Memo, Viewer } from "@/lib/types";
import "./memo-workbench.css";

type Draft = Pick<Memo, "title" | "symbol" | "thesis" | "catalysts" | "valuation" | "risks" | "disconfirming" | "evidence">;
type ResearchField = "thesis" | "catalysts" | "valuation" | "risks" | "disconfirming" | "evidence";
const SECTIONS: { key: ResearchField; title: string; en: string; prompt: string }[] = [
  { key: "thesis", title: "Investment thesis", en: "THE CASE FOR CAPITAL", prompt: "What role would this investment play in the portfolio? Set out the assumptions, durable advantages and investment horizon. Separate established facts from your interpretation." },
  { key: "catalysts", title: "Catalysts & monitoring", en: "WHAT CHANGES THE OUTLOOK", prompt: "Identify the events that could affect value, the expected timing and the indicators you will monitor. Define what would confirm or undermine each catalyst." },
  { key: "valuation", title: "Valuation & scenarios", en: "PRICE, VALUE AND UNCERTAINTY", prompt: "Document your bear, base and bull cases, valuation method and margin of safety. Make the key assumptions explicit and flag inputs that still need verification." },
  { key: "risks", title: "Risk & portfolio fit", en: "THE DOWNSIDE AND THE MANDATE", prompt: "Consider fundamental, concentration, liquidity and drawdown risk. Explain how the investment horizon and cash flows fit the portfolio's liabilities and spending needs." },
  { key: "disconfirming", title: "Disconfirming evidence", en: "WHAT WOULD CHANGE YOUR MIND", prompt: "Which observable developments would invalidate the thesis, trigger a review or justify an exit? Define them before new information makes the original conviction harder to question." },
  { key: "evidence", title: "Sources & audit trail", en: "MAKE THE RESEARCH REPRODUCIBLE", prompt: "Record source links, disclosure dates, access dates and the specific claims they support. Distinguish primary disclosures, third-party analysis and your own inference." },
];
const EMPTY: Draft = { title: "", symbol: null, thesis: "", catalysts: "", valuation: "", risks: "", disconfirming: "", evidence: "" };
const PENSION: Draft = {
  title: "Institutional investment memo", symbol: null,
  thesis: "[Research outline — complete with your own evidence]\nInvestment objective and portfolio role:\nInvestment horizon:\nKey assumptions and supporting evidence:\nDurable competitive advantages:",
  catalysts: "[Research outline]\nEvent / expected timing / monitoring indicator:\nQuarterly monitoring checklist:\nAnnual review milestones:",
  valuation: "[Research outline]\nValuation method and rationale:\nBear case:\nBase case:\nBull case:\nMargin of safety and sensitivity to assumptions:",
  risks: "[Research outline]\nFit with liability duration and cash-flow needs:\nLiquidity and capacity to exit:\nConcentration and correlations:\nDrawdown tolerance and stress scenarios:\nGovernance and mandate constraints:",
  disconfirming: "[Research outline]\nEvidence that would invalidate the thesis:\nReview triggers and measurable thresholds:\nConditions for reducing exposure or exiting:",
  evidence: "[Research outline]\nPrimary source / disclosure date / access date:\nSpecific claim supported by each source:\nInputs still awaiting verification:",
};
function toDraft(memo: Memo): Draft { return { title: memo.title, symbol: memo.symbol, thesis: memo.thesis, catalysts: memo.catalysts, valuation: memo.valuation, risks: memo.risks, disconfirming: memo.disconfirming, evidence: memo.evidence }; }
function stamp(value: string,locale:Locale) { return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function completion(draft: Draft) { return SECTIONS.filter(({ key }) => draft[key].trim()).length; }
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error || "Unable to save right now. Please try again.");
  return value as T;
}
type Modal = { kind: "discard"; action: () => void } | { kind: "delete"; memo: Memo } | null;

export default function MemoWorkbench() {
 const { t, locale } = useI18n();
 const latestTranslate = useRef(t);
 useEffect(() => { latestTranslate.current = t; }, [t]);

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<Memo | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY });
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const dirty = editing && JSON.stringify(draft) !== baseline;
  const filled = completion(draft);

  const load = useCallback(() => api<Viewer>("/api/me").then(async (account) => {
    setViewer(account);
    if (account.user) {
      const items = (await api<{ memos: Memo[] }>("/api/memos")).memos;
      setMemos(items);
      const requestedId = new URL(window.location.href).searchParams.get("id");
      const requested = items.find((memo) => memo.id === requestedId);
      if (requested) { const value = toDraft(requested); setDraft(value); setBaseline(JSON.stringify(value)); setActive(requested); setEditing(true); }
      else if (requestedId) toast.error(latestTranslate.current("This memo was not found in your account."));
    }
  }).catch((cause) => { setError(cause instanceof Error ? cause.message : "Your research library is temporarily unavailable."); }).finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const current = dialog.current;
    if (!current) return;
    if (modal && !current.open) current.showModal();
    if (!modal && current.open) current.close();
  }, [modal]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const currentUrl = window.location.href;
    const currentHistoryState = window.history.state;
    const browserBack = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      window.history.pushState(currentHistoryState, "", currentUrl);
      setModal({ kind: "discard", action: () => {
        window.removeEventListener("beforeunload", beforeUnload);
        window.removeEventListener("popstate", browserBack, true);
        window.history.back();
      } });
    };
    const navigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.download || link.target === "_blank" || link.href === window.location.href || link.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setModal({ kind: "discard", action: () => {
        window.removeEventListener("beforeunload", beforeUnload);
        const destination = new URL(link.href);
        if (destination.origin === window.location.origin && !/^\/(signin-with-chatgpt|signout-with-chatgpt|callback)/.test(destination.pathname)) window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
        else window.location.assign(link.href);
      } });
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", browserBack, true);
    document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", browserBack, true); document.removeEventListener("click", navigation, true); };
  }, [dirty, draft]);

  const leaveEditor = () => { setEditing(false); setActive(null); setDraft({ ...EMPTY }); setBaseline(JSON.stringify(EMPTY)); window.history.replaceState(window.history.state, "", "/memos"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const guarded = (action: () => void) => { if (dirty) setModal({ kind: "discard", action }); else action(); };
  const openMemo = (memo: Memo) => { const value = toDraft(memo); setDraft(value); setBaseline(JSON.stringify(value)); setActive(memo); setEditing(true); window.history.replaceState(window.history.state, "", `/memos?id=${encodeURIComponent(memo.id)}`); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const newMemo = (template: boolean) => {
    if (!viewer?.user) { toast.error(t("Sign in to create an investment memo.")); return; }
    setDraft(template ? Object.fromEntries(Object.entries(PENSION).map(([key,value])=>[key,typeof value==="string"?t(value):value])) as Draft : { ...EMPTY, title: t("New investment memo") }); setBaseline(""); setActive(null); setEditing(true); window.history.replaceState(window.history.state, "", "/memos"); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const update = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: key === "symbol" ? value.toUpperCase() || null : value }));
  const save = async () => {
    if (!draft.title.trim()) { toast.error(t("Give your memo a title before saving.")); titleInput.current?.focus(); return; }
    if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > 16_384) { toast.error(t("This memo is too long. Shorten a few sections before saving.")); return; }
    setSaving(true);
    const submitted = JSON.stringify(draft);
    try {
      const { memo } = await api<{ memo: Memo }>(active ? `/api/memos/${active.id}` : "/api/memos", { method: active ? "PATCH" : "POST", body: submitted });
      setActive(memo); setDraft((current) => JSON.stringify(current) === submitted ? toDraft(memo) : current); setBaseline(JSON.stringify(toDraft(memo)));
      window.history.replaceState(window.history.state, "", `/memos?id=${encodeURIComponent(memo.id)}`);
      setMemos((current) => [memo, ...current.filter((item) => item.id !== memo.id)]);
      toast.success(t("Memo saved. Your research is available across devices."));
    } catch (cause) { toast.error(cause instanceof Error ? t(cause.message) : t("Save failed. Your edits are still here.")); }
    finally { setSaving(false); }
  };
  const deleteMemo = async (memo: Memo) => {
    setDeleting(true);
    try {
      await api(`/api/memos/${memo.id}`, { method: "DELETE" });
      setMemos((current) => current.filter((item) => item.id !== memo.id));
      if (active?.id === memo.id) leaveEditor();
      setModal(null); toast.success(t("Memo deleted."));
    } catch (cause) { toast.error(cause instanceof Error ? t(cause.message) : t("Unable to delete this memo. Please try again.")); }
    finally { setDeleting(false); }
  };
  const exportMemo = () => {
    const content = [`# ${draft.title || t("Investment committee memo")}`, draft.symbol ? t('Ticker: {symbol}',{symbol:draft.symbol}) : "", t('Exported: {date}{status}',{date:new Date().toLocaleString(locale),status:dirty?t(' (includes unsaved edits)'):''}), ...SECTIONS.map(({ key, title }) => `\n## ${t(title)}\n\n${draft[key] || t("Not yet documented")}`)].filter(Boolean).join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${(draft.title || t("Investment committee memo")).replace(/[<>:"/\\|?*]/g, "-")}.md`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success(t("Memo exported."));
  };
  const filtered = memos.filter((memo) => `${memo.title} ${memo.symbol || ""}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="page memo-workbench">
    {!editing ? <>
      <div className="memo-intro">
        <div><div className="eyebrow">{t("INVESTMENT MEMOS")} <span>{t("RESEARCH LIBRARY")}</span></div><h1 className="page-heading">{t("Make the case.")} <br className="memo-mobile-break" />{t("Show your work.")}</h1><p>{t("Turn an investment view into a traceable argument, from the initial hypothesis to the evidence that changes it.")}</p></div>
        {viewer?.user && <button className="button memo-primary" onClick={() => newMemo(false)}><Plus size={17} /> {t("New memo")}</button>}
      </div>
      {loading ? <div className="memo-loading" role="status" aria-label={t("Loading your research library")}><div /><div /><div /></div> : error ? <div className="panel memo-empty"><FileSearch size={32} /><h2>{t("Your library is temporarily unavailable")}</h2><p>{t(error)}</p><button className="button" onClick={() => { setLoading(true); setError(""); void load(); }}>{t("Try again")}</button></div> : !viewer?.user ? <div className="panel memo-signin"><div className="memo-symbol"><NotebookPen size={28} /></div><h2>{t("Build a lasting research record.")}</h2><p>{t("Sign in to save investment memos and pick up your research on another device.")}</p><a className="button memo-primary" href="/login?return_to=%2Fmemos" target="_top">{t("Sign in to continue")} <ArrowUpRight size={16} /></a></div> : <>
        <section className="memo-framework panel">
          <div className="memo-framework-main"><span className="memo-small-tag"><ShieldCheck size={13} /> {t("A framework for long-horizon capital")}</span><h2>{t("Conviction needs")}<br />{t("a clear framework.")}</h2><p>{t("From liability matching to liquidity and margin of safety,")}<br />{t("organize the evidence behind every capital allocation decision.")}</p><button className="memo-text-button" onClick={() => newMemo(true)}>{t("Use the institutional outline")} <ArrowRight size={17} /></button></div>
          <div className="memo-framework-steps">{SECTIONS.map(({ title, en }, i) => <div key={title}><span className="memo-step-number">0{i + 1}</span><div><strong>{t(title)}</strong><small>{t(en)}</small></div><Check size={15} /></div>)}</div>
          <span className="memo-framework-deco" aria-hidden="true">↗</span>
        </section>
        <div className="memo-library-heading"><div><h2><Library size={19} /> {t("Your investment memos")} <span>{memos.length.toString().padStart(2, "0")}</span></h2><p>{t("The argument matters as much as the conclusion.")}</p></div><label className="memo-filter"><Search size={16} /><input aria-label={t("Search memos")} placeholder={t("Search by title or ticker")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        {filtered.length ? <div className="memo-card-grid">{filtered.map((memo, index) => <button className="memo-card panel" key={memo.id} onClick={() => openMemo(memo)}><div className="memo-card-top"><span className={`memo-card-icon ${index % 2 ? "pink" : ""}`}><NotebookPen size={19} /></span><span className="memo-company">{memo.symbol || t("Portfolio research")}</span><ArrowUpRight size={17} /></div><h3>{memo.title}</h3><p>{memo.thesis.replace(/\n/g, " ") || t("Your thesis is still taking shape. Continue building the case.")}</p><div className="memo-card-bottom"><span><Clock3 size={12} /> {stamp(memo.updatedAt,locale)}</span><span>{t('{count} / 6 documented',{count:completion(memo)})}</span></div><div className="memo-card-progress" aria-hidden="true"><span style={{ width: `${completion(memo) / 6 * 100}%` }} /></div></button>)}</div> : <div className="panel memo-empty"><span className="memo-empty-icon"><NotebookPen size={27} /></span><h2>{query ? t("No matching memos") : t("Good research starts with a question.")}</h2><p>{query ? t("Try a ticker or a keyword from the title.") : t("Choose an investment, state your hypothesis and let the evidence challenge it.")}</p>{!query && <button className="button" onClick={() => newMemo(false)}>{t("Start your first memo")} <Plus size={16} /></button>}</div>}
        <div className="memo-bottom-note"><ShieldCheck size={14} /><span>{t("Memos are private to your account. Outlines provide research prompts; judgments and supporting evidence are yours.")}</span></div>
      </>}
    </> : <>
      <div className="memo-breadcrumb"><button onClick={() => guarded(leaveEditor)}><ArrowLeft size={15} /> {t("RESEARCH LIBRARY")}</button><ChevronRight size={13} /><span>{active ? t("Edit memo") : t("New memo")}</span></div>
      <div className="memo-editor-heading"><div><div className="eyebrow">{t("YOUR INVESTMENT PROCESS")}</div><h1 className="page-heading">{t("Build the investment case.")}</h1><p>{t("Document the thesis—and the evidence that would invalidate it.")}</p></div><div className="memo-editor-actions"><button className="button memo-icon-button" onClick={exportMemo} title={t("Export Markdown")}><Download size={17} /><span>{t("Export")}</span></button><button className="button memo-icon-button" onClick={() => window.print()} title={t("Print or save as PDF")}><Printer size={17} /><span>{t("Print")}</span></button><button className="button memo-primary" onClick={() => void save()} disabled={saving || (!dirty && Boolean(active))}>{saving ? <LoaderCircle className="memo-spin" size={16} /> : <Save size={16} />}{saving ? t("Saving…") : t("Save memo")}</button></div></div>
      <section className="panel memo-editor-meta"><div className="memo-title-field"><label htmlFor="memo-title">{t("Memo title")}</label><input id="memo-title" ref={titleInput} value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={160} placeholder={t("e.g. Is the competitive advantage durable?")} /></div><div className="memo-ticker-field"><label htmlFor="memo-symbol">{t("Ticker")} <span>{t("optional")}</span></label><input id="memo-symbol" value={draft.symbol || ""} onChange={(event) => update("symbol", event.target.value)} maxLength={20} placeholder={t("e.g. RY.TO / AAPL")} /></div><div className="memo-save-state" role="status">{dirty ? <><span className="memo-unsaved-dot" /> {t("Unsaved changes")}</> : <><CheckCircle2 size={14} /> {t("Saved to your account")}</>}<small>{active ? t('Last saved {date}',{date:stamp(active.updatedAt,locale)}) : t("New draft · Save to continue across devices")}</small></div></section>
      <div className="memo-editor-progress"><span>{t("Sections documented")} <strong>{filled} / 6</strong></span><div>{SECTIONS.map(({ key, title }) => <span key={key} className={draft[key].trim() ? "filled" : ""} title={`${t(title)}${draft[key].trim() ? t(": documented") : t(": not yet documented")}`} />)}</div><small>{t("Documented does not mean verified")}</small></div>
      <div className="memo-editor-grid">{SECTIONS.map(({ key, title, en, prompt }, i) => <section className={`panel memo-field ${key === "disconfirming" ? "memo-field-rose" : ""}`} key={key}><div className="memo-field-heading"><span>0{i + 1}</span><div><label htmlFor={`memo-${key}`}>{t(title)}</label><small>{t(en)}</small></div>{key === "disconfirming" && <ShieldCheck size={18} />}</div><p>{t(prompt)}</p><textarea id={`memo-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} placeholder={t("Write your analysis here…")} maxLength={2000} rows={7} /><div className="memo-field-footer"><span>{key === "evidence" ? t("Prioritize primary disclosures") : key === "disconfirming" ? t("Actively seek contrary evidence") : t("Separate facts, assumptions and inference")}</span><span>{draft[key].length} / 2000</span></div></section>)}</div>
      <div className="memo-editor-footer"><div><ShieldCheck size={15} /><span>{t("Private to your account. Save to keep your changes.")}</span></div>{active && <button className="memo-delete-button" onClick={() => setModal({ kind: "delete", memo: active })}><Trash2 size={15} /> {t("Delete memo")}</button>}</div>
      <article className="memo-print-view"><div>{t("FINSCOPE · FINANCIAL NOTES")}</div><h1>{draft.title}</h1><p>{draft.symbol ? `${draft.symbol} · ` : ""}{new Date().toLocaleDateString(locale)}{dirty ? t(" · Includes unsaved edits") : ""}</p>{SECTIONS.map(({ key, title }) => <section key={key}><h2>{t(title)}</h2><p>{draft[key] || t("Not yet documented")}</p></section>)}</article>
    </>}
    <dialog ref={dialog} className="memo-dialog" aria-labelledby="memo-dialog-title" onCancel={(event) => { event.preventDefault(); if (!deleting) setModal(null); }} onClick={(event) => { if (event.target === event.currentTarget && !deleting) setModal(null); }}>
      {modal && <div><button className="memo-dialog-close" onClick={() => setModal(null)} disabled={deleting} aria-label={t("Close")}><X size={18} /></button><span className="memo-dialog-icon">{modal.kind === "delete" ? <Trash2 size={23} /> : <NotebookPen size={23} />}</span><h2 id="memo-dialog-title">{modal.kind === "delete" ? t("Delete this memo?") : t("Your changes are not saved.")}</h2><p>{modal.kind === "delete" ? t('{title} will be permanently deleted. Export a copy first if you need to keep it.',{title:modal.memo.title}) : t("Leaving now will discard your latest edits. Stay here to finish or save your work.")}</p><div className="memo-dialog-actions"><button className="button" onClick={() => setModal(null)} disabled={deleting}>{modal.kind === "delete" ? t("Keep memo") : t("Keep editing")}</button><button className={`button ${modal.kind === "delete" ? "memo-danger" : "memo-primary"}`} disabled={deleting} onClick={() => { if (modal.kind === "delete") void deleteMemo(modal.memo); else { const action = modal.action; setModal(null); action(); } }}>{deleting ? t("Deleting…") : modal.kind === "delete" ? t("Delete permanently") : t("Discard and leave")}</button></div></div>}
    </dialog>
  </div>;
}
