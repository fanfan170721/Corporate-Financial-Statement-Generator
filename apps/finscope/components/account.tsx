"use client";
import { useI18n } from "@/components/i18n";
import { useEffect, useState } from 'react';
import Link from './app-link';
import { ArrowRight, ArrowUpRight, Check, Clock3, Download, Globe2, LockKeyhole, ShieldCheck, Sparkles, Sun, Moon, Plus, X, CalendarDays, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, useApp, LoginGate, SectionHeading, CompanySearch } from './shell';
import CompanyMark from './company-mark';
import { AdminAIAccess } from './ai-settings';
import { getCompany } from '@/lib/companies';
import type { Schedule, Preferences, Report } from '@/lib/types';
export function SchedulePage() {
const { t, locale, setLocale } = useI18n(); const { viewer, refresh } = useApp(); const [draft, setDraft] = useState<Schedule>({ symbols: [], time: '08:00', timezone: 'America/Toronto', enabled: false }); const [busy, setBusy] = useState(false); useEffect(() => { if (viewer)
    setDraft(viewer.schedule); }, [viewer?.schedule]); const save = async () => { setBusy(true); try {
    await api('/api/schedule', { method: 'PUT', body: JSON.stringify({ symbols: draft.symbols, time: draft.time, timezone: draft.timezone, enabled: draft.enabled }) });
    await refresh();
    toast.success(draft.enabled ? t("Your morning brief is scheduled.") : t("Schedule preferences saved."));
}
catch (e) {
    toast.error(t((e as Error).message));
}
finally {
    setBusy(false);
} }; return <div className="page"><SectionHeading eyebrow={t("A MORE CONSIDERED MORNING")} title={t("Your research, ready for the day.")} description={t("Set a daily review rhythm for up to three companies. New reports appear in your archive, with their sources and reporting dates intact.")}/>{!viewer?.user ? <LoginGate title={viewer?.guest ? t("A daily rhythm needs an account.") : undefined} description={viewer?.guest ? t("Guest sessions support manual reports for 24 hours. Sign in to choose companies, schedule daily reports and keep a research history across devices.") : undefined}/> : <div className="form-grid"><section className="panel form-panel"><div className="row-between"><h2>{t("Morning brief")}</h2><span className={`pill ${draft.enabled ? 'blue' : ''}`}>{draft.enabled ? t("Scheduled") : t("Draft")}</span></div><label className="field"><span>{t("Companies to follow") + " "}<small>{t("Choose up to three.")}</small></span></label><CompanySearch onSelect={c => setDraft(p => p.symbols.includes(c.symbol) ? p : p.symbols.length >= 3 ? (toast(t("A morning brief can follow up to three companies.")), p) : { ...p, symbols: [...p.symbols, c.symbol] })}/><div className="selected-list" style={{ marginTop: 14 }}>{draft.symbols.map(s => <span className="selected-chip" key={s}><CompanyMark symbol={s} size={22}/>{getCompany(s)?.name || s}<button onClick={() => setDraft(p => ({ ...p, symbols: p.symbols.filter(x => x !== s) }))} aria-label={t("Remove {value0}", { value0: s })}><X size={12}/></button></span>)}</div><div className="row" style={{ alignItems: 'flex-start' }}><label className="field" style={{ flex: 1 }}><span>{t("Preferred time")}</span><input type="time" value={draft.time} onChange={e => setDraft(p => ({ ...p, time: e.target.value }))}/></label><label className="field" style={{ flex: 2 }}><span>{t("Time zone")}</span><select value={draft.timezone} onChange={e => setDraft(p => ({ ...p, timezone: e.target.value }))}>{['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/New_York', 'Europe/London', 'Asia/Hong_Kong'].map(zone => <option key={zone} value={zone}>{t(zone.replaceAll('_', ' '))}</option>)}</select></label></div><div className="setting-row"><div><strong>{t("Generate a brief each morning")}</strong><p>{t("Scheduled for your chosen local time and generated on the next scheduler check. Daylight saving changes are handled automatically.")}</p></div><button className={`switch ${draft.enabled ? 'on' : ''}`} role="switch" aria-checked={draft.enabled} aria-label={t("Enable daily research")} disabled={!viewer.capabilities.scheduler} onClick={() => setDraft(p => ({ ...p, enabled: !p.enabled }))}/></div>{!viewer.capabilities.scheduler && <div className="notice">{t("Scheduling is not active yet. The workspace owner needs to connect a financial data service and the background job runner. You can save your preferred companies and time now.")}</div>}<p className="form-note">{t(viewer.usage.unlimited ? "Financial statements update when companies publish new results. A new brief may contain the same reported numbers as yesterday. Your administrator account has no daily report quota." : "Financial statements update when companies publish new results. A new brief may therefore contain the same reported numbers as yesterday. Daily account limits still apply.")}</p><button className="button button-dark" onClick={save} disabled={busy}>{busy ? t("Saving\u2026") : draft.enabled ? t("Save schedule") : t("Save preferences")}<Check size={16}/></button>{draft.lastRun && <p className="form-note">{t("Last completed run:") + " "}{new Date(draft.lastRun).toLocaleString(locale)}</p>}</section><section className="panel form-panel"><div className="feature-icon blue"><Clock3 size={25}/></div><h2 style={{ marginTop: 20 }}>{t("A routine, not a reaction.")}</h2><p className="form-note">{t("Create space for what changed\u2014and what did not. Your morning brief keeps the evidence organised, so you can spend more time interpreting it.")}</p><div className="steps"><div className="step"><div><h3>{t("Refresh the public record")}</h3><p>{t("Retrieve the latest complete financial periods available from the connected source.")}</p></div></div><div className="step"><div><h3>{t("Keep the context")}</h3><p>{t("Preserve financial dates, sources and any missing observations.")}</p></div></div><div className="step"><div><h3>{t("Build a research history")}</h3><p>{t("Each completed report is saved to your private archive. No browser tab needs to stay open.")}</p></div></div></div><Link href="/reports" className="text-link" style={{ marginTop: 30 }}>{t("Open the archive") + " "}<ArrowRight size={15}/></Link></section></div>}</div>; }
export function SettingsPage() {
const { t, locale, setLocale } = useI18n(); const { viewer, refresh } = useApp(); const [busy, setBusy] = useState(false); const update = async (patch: Partial<Preferences>) => { try {
    await api('/api/preferences', { method: 'PATCH', body: JSON.stringify(patch) });
    await refresh();
    toast.success(t("Preferences saved."));
}
catch (e) {
    toast.error(t((e as Error).message));
} }; const download = async () => { setBusy(true); try {
    const reports: Report[] = [];
    let cursor: string | null = null;
    do {
        const data: {
            reports: Report[];
            nextCursor: string | null;
        } = await api<{
            reports: Report[];
            nextCursor: string | null;
        }>(`/api/reports?limit=50${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`);
        reports.push(...data.reports);
        cursor = data.nextCursor;
    } while (cursor);
    const [memos, scenarios] = await Promise.all([api('/api/memos'), api('/api/scenarios')]);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: viewer, reports, memos, scenarios }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finscope-my-research.json';
    a.click();
    URL.revokeObjectURL(url);
}
catch (e) {
    toast.error(t((e as Error).message));
}
finally {
    setBusy(false);
} }; return <div className="page"><SectionHeading eyebrow={t("MAKE ROOM FOR YOUR WAY OF WORKING")} title={t("Your workspace.")} description={t("A few thoughtful preferences. A consistent financial planning experience.")}/>{!viewer?.user ? <LoginGate /> : <div className="form-grid"><section className="panel form-panel"><div className="row"><span className="avatar" style={{ width: 48, height: 48, fontSize: 20 }}>{viewer.user.name.slice(0, 1).toUpperCase()}</span><div><h3>{viewer.user.name}</h3>{viewer.isAdmin && <span className="pill blue">{t("Administrator")}</span>}<p className="muted" style={{ fontSize: 12 }}>{viewer.user.email}</p></div></div><div className="setting-row"><div><strong>{t("Language")}</strong><p>{t("Choose the language used throughout Finscope.")}</p></div><select aria-label={t("Language")} value={locale} onChange={e => setLocale(e.target.value === "fr-CA" ? "fr-CA" : "en-CA")}><option value="en-CA" lang="en-CA">English (Canada)</option><option value="fr-CA" lang="fr-CA">Français (Canada)</option></select></div><div className="setting-row"><div><strong>{t("Appearance")}</strong><p>{t("Choose your preferred working environment.")}</p></div><select aria-label={t("Appearance")} value={viewer.preferences.theme} onChange={e => update({ theme: e.target.value as Preferences['theme'] })}><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option><option value="system">{t("System")}</option></select></div><div className="setting-row"><div><strong>{t("Reduce motion")}</strong><p>{t("A quieter interface with fewer animated transitions.")}</p></div><button className={`switch ${viewer.preferences.reducedMotion ? 'on' : ''}`} role="switch" aria-checked={viewer.preferences.reducedMotion} aria-label={t("Reduce motion")} onClick={() => update({ reducedMotion: !viewer.preferences.reducedMotion })}/></div><div className="setting-row"><div><strong>{t("Your research belongs to you")}</strong><p>{t("Download your reports, memos and saved scenario inputs.")}</p></div><button className="button button-outline button-small" onClick={download} disabled={busy}><Download size={15}/>{busy ? t("Exporting\u2026") : t("Export")}</button></div><div className="row" style={{ marginTop: 28 }}><Link href="/ai-access" className="button button-outline"><Sparkles size={16}/>{t("AI access & API keys")}</Link><button type="button" className="text-link" onClick={async () => { try {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
}
catch (error) {
    toast.error(t((error as Error).message));
} }}>{t("Sign out") + " "}<ArrowUpRight size={14}/></button></div></section><section className="panel form-panel"><div className="eyebrow">{t("TODAY\u2019S RESEARCH CAPACITY")}</div><div className="quota-number">{viewer.usage.unlimited ? t("Unlimited") : <>{viewer.usage.used}<span> / {viewer.usage.limit}</span></>}</div><p className="form-note">{viewer.usage.unlimited ? t("{count} research credits recorded today. Your administrator account has no daily generation quota.",{count:viewer.usage.used}) : t("Research credits used today. One financial report uses one credit; an AI brief uses one additional credit. Started requests count towards the limit, including failed provider calls.")}</p><div className="setting-row"><div><strong>{t("Concurrent companies")}</strong><p>{t(viewer.usage.unlimited ? "No administrator concurrency quota." : "Up to three per account.")}</p></div><span className="mono">{viewer.usage.unlimited ? t("{count} active",{count:viewer.usage.active}) : <>{viewer.usage.active} / 3</>}</span></div><p className="form-note">{t(viewer.usage.unlimited ? "Finscope does not apply daily report or AI quotas to your verified administrator account. Provider availability and rate limits still apply." : "The daily allowance resets at 00:00 UTC. Limits are enforced by the server, not just this interface.")}</p><div className="notice"><ShieldCheck size={16}/>{" " + t("Your reports and notes are scoped to your authenticated account. Saved API credentials are never returned to the browser.")}</div><Link className="text-link" href="/methodology">{t("Read our methodology") + " "}<ArrowRight size={15}/></Link></section></div>}</div>; }
type AdminState = {
    counts: Record<string, number>;
    capabilities: Record<string, boolean>;
    services: Record<string, string | boolean>;
    limits: {
        daily: number;
        concurrent: number;
    };
    serverTime: string;
};
export function AdminPage() {
const { t, locale, setLocale } = useI18n(); const { viewer } = useApp(); const [state, setState] = useState<AdminState | null>(null); const [error, setError] = useState(''); useEffect(() => { if (viewer?.isAdmin)
    api<AdminState>('/api/admin').then(setState).catch(e => setError(e.message)); }, [viewer?.isAdmin]); return <div className="page"><SectionHeading eyebrow={t("WORKSPACE OPERATIONS")} title={t("A clear view behind the scenes.")} description={t("Service readiness, account usage and job status. Credentials remain in the server\u2019s secret store.")}/>{!viewer?.isAdmin ? <div className="empty-state panel"><LockKeyhole size={30}/><h2>{t("Owner access required.")}</h2><p>{t("This console is restricted to the configured workspace administrator.")}</p><Link className="button button-outline" href="/workspace">{t("Back to research")}</Link></div> : error ? <p className="notice warn">{t(error)}</p> : !state ? <p className="loading-line">{t("Loading service status\u2026")}</p> : <><div className="metric-grid">{Object.entries(state.counts).map(([key, value]) => <div className="metric-card panel" key={key}><span>{t(key.replace(/([A-Z])/g, ' $1'))}</span><strong>{value.toLocaleString(locale)}</strong><small>{t("Workspace total")}</small></div>)}</div><section className="panel form-panel"><h2>{t("Connected services")}</h2>{Object.entries(state.services).map(([key, value]) => <div className="setting-row" key={key}><strong>{t(key.toUpperCase())}</strong><span className="pill">{t(String(value))}</span></div>)}<p className="form-note">{t("Server time:") + " "}{new Date(state.serverTime).toLocaleString(locale)}{t(". Standard account daily limit:") + " "}{state.limits.daily}{t("; simultaneous companies:") + " "}{state.limits.concurrent}.</p><div className="notice">{t("Mail and data services use hosting environment settings. AI keys and passes are managed below.")}</div></section><AdminAIAccess /></>}</div>; }

export function MethodologyPage() {
    const { t } = useI18n();
    return <div className="page">
        <SectionHeading eyebrow={t("SHOW THE WORK")} title={t("Trust begins with the method.")} description={t("What the data can tell us. What it cannot. And how this workspace keeps the distinction clear.")}/>
        <div className="methodology-layout">
            <article className="method-card panel">
                <span className="eyebrow">{t("01 / THE EVIDENCE")}</span><h2>{t("Start at the source.")}</h2>
                <p>{t("Financial reports use structured SEC filings, with original filing links and fiscal dates. Supported companies meet the required coverage and recency checks; additional providers may extend coverage. Published statements are periodic disclosures, not real-time market data.")}</p>
                <ul><li>{t("Fiscal periods are aligned by their actual dates.")}</li><li>{t("Missing values remain null; they are never backfilled with zero.")}</li><li>{t("Source dates, currencies and units travel with each report.")}</li><li>{t("Curated case studies are dated snapshots, separate from on-demand retrieval.")}</li></ul>
                <a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noopener noreferrer">{t("SEC data documentation ↗")}</a>
            </article>
            <article className="method-card panel">
                <span className="eyebrow">{t("02 / THE ANALYSIS")}</span><h2>{t("Useful ratios. Honest limitations.")}</h2>
                <p>{t("Revenue growth compares adjacent years. Free cash flow is operating cash flow less capital expenditure. Net margin is net income divided by revenue. Return on equity uses average opening and closing equity.")}</p>
                <p>{t("Debt-to-equity uses interest-bearing debt, not total liabilities. The cash coverage measure uses cash divided by total liabilities and is not the conventional current-liability cash ratio. Unsupported or unsuitable denominators produce no ratio.")}</p>
                <p>{t("Sector-specific underwriting remains essential, particularly for banks, insurers and asset managers.")}</p>
            </article>
            <article className="method-card panel">
                <span className="eyebrow">{t("03 / THE LONG VIEW")}</span><h2>{t("Think in assets and obligations.")}</h2>
                <p>{t("Institutional investors manage more than securities. The portfolio lab demonstrates how allocations, rate movements and liability duration interact. The liquidity lab models contributions, benefit payments and private-market commitments.")}</p>
                <p>{t("Stress scenarios are explicit user assumptions. Duration models are first-order approximations. They exclude convexity, basis risk and many real-world constraints. Liquidity shortfalls are not the same as insolvency.")}</p>
                <Link className="text-link" href="/allocation">{t("Explore the asset–liability lab")} <ArrowRight size={14}/></Link>
            </article>
            <article className="method-card panel">
                <span className="eyebrow">{t("04 / THE JUDGEMENT")}</span><h2>{t("AI assists. Evidence leads.")}</h2>
                <p>{t("Optional AI research combines company financials with current public sources. It is instructed to distinguish reported facts, analytical inference and forward-looking assumptions. Source links accompany its research.")}</p>
                <p>{t("No model can guarantee an outcome. Review the original source, identify contradictory evidence and record what would change your investment thesis. Synthetic examples never receive an AI investment brief.")}</p>
                <Link href="/ai-access">{t("AI access and usage ↗")}</Link>
            </article>
            <article className="method-card panel wide">
                <span className="eyebrow">{t("05 / THE WORKSPACE")}</span><h2>{t("Private by design. Transparent about readiness.")}</h2>
                <p>{t("Authenticated accounts own their watchlists, reports, scenario inputs and memos. Each server request checks ownership. Same-origin checks protect mutations, while durable quotas and concurrency limits protect research services. Verified email accounts and secure sessions establish identity. API keys are encrypted on the server and never returned to the browser.")}</p>
                <p>{t("On-demand data, AI research and scheduled jobs require their respective services to be configured. The interface shows their availability. No missing integration is simulated as a successful live request. This is a research and decision-support workspace, not a source of personalised investment advice.")}</p>
                <div className="source-list"><Link href="/liquidity">{t("Liquidity & commitments")} <ArrowUpRight size={13}/></Link><Link href="/diligence">{t("Manager due diligence")} <ArrowUpRight size={13}/></Link><Link href="/memos">{t("Investment committee memos")} <ArrowUpRight size={13}/></Link></div>
            </article>
        </div>
    </div>;
}
