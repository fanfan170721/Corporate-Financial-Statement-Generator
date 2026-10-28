"use client";
import { useI18n } from "@/components/i18n";
import './ai-settings.css';
import { AdminFreeAI, FreeAIOverview } from './free-ai';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, KeyRound, LockKeyhole, ShieldCheck, Sparkles, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, LoginGate, SectionHeading, useApp } from './shell';
type Status = {
    mode: 'personal' | 'sponsored' | 'locked' | 'admin';
    unlimited: boolean;
    canUse: boolean;
    storageReady: boolean;
    sponsorReady: boolean;
    personalKey: {
        suffix: string;
        updatedAt: string;
    } | null;
    passExpiresAt: string | null;
    limits: {
        tokens: number;
        requests: number;
    };
    usage: {
        tokens: number;
        requests: number;
    };
    reservation: number;
    resetsAt: string | null;
};
type Config = {
    dailyTokens: number;
    dailyRequests: number;
    globalDailyTokens: number;
    globalDailyRequests: number;
};
type Pass = {
    id: string;
    label: string;
    max_claims: number;
    claims: number;
    token_limit: number;
    request_limit: number;
    redeem_before: number;
    revoked: number;
};
type AdminState = {
    config: Config;
    passes: Pass[];
    sponsorReady: boolean;
    key: {
        suffix: string;
    } | null;
    environmentKey: boolean;
    code?: string;
};
export function AIAccessPage() {
const { t, locale } = useI18n();
const date = (value:string|number) => new Date(value).toLocaleString(locale,{dateStyle:"medium",timeStyle:"short"});
    const { viewer, refresh } = useApp();
    const [state, setState] = useState<Status | null>(null);
    const unlimited = state?.unlimited ?? viewer?.usage.unlimited ?? false;
    const [key, setKey] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { if (viewer?.user)
        api<Status>('/api/ai/settings').then(setState).catch(e => setError(e.message)); }, [viewer?.user?.id]);
    const action = async (kind: string) => { setBusy(kind); setError(''); try {
        const result = await api<Status>(kind === 'redeem' ? '/api/ai/redeem' : '/api/ai/settings', { method: kind === 'remove' ? 'DELETE' : kind === 'redeem' ? 'POST' : 'PUT', ...(kind !== 'remove' ? { body: JSON.stringify(kind === 'redeem' ? { code } : { apiKey: key }) } : {}) });
        setState(result);
        setKey('');
        setCode('');
        await refresh();
        toast.success(kind === 'redeem' ? t("Your 24-hour AI pass is active.") : kind === 'remove' ? t("API key removed.") : t("API key saved securely."));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy('');
    } };
    return <div className="page"><SectionHeading eyebrow={t("OPTIONAL INTELLIGENCE")} title={t("AI, on your terms.")} description={t(unlimited ? "Administrator access has no Finscope generation quota. Your provider connection is managed below." : "Use a 24-hour pass or connect a personal API key. Financial statements, charts, watchlists and planning tools remain available without AI.")}/>{!viewer?.user ? <LoginGate /> : <><FreeAIOverview/><div className="ai-summary panel"><span className="feature-icon pink"><Sparkles size={24}/></span><div><span className="eyebrow">{t("YOUR CONNECTION")}</span><h2>{!state ? t("Checking access\u2026") : unlimited ? t("Administrator access") : state.mode === 'personal' ? t("Your API. Your control.") : state.mode === 'sponsored' ? t("A day to explore.") : t("Ready when you are.")}</h2><p className="form-note">{unlimited ? t(state?.canUse ? "Your administrator account does not need an access pass. Site quotas do not apply; provider billing and rate limits still apply." : "Your administrator allowance is unlimited. Connect a provider key before requesting AI analysis.") : state?.mode === 'personal' ? t("Requests are billed to your OpenAI API account. Your personal key takes priority over a pass.") : state?.mode === 'sponsored' ? t("Your sponsored pass expires {value0}.", { value0: date(state.passExpiresAt!) }) : t("AI is optional. Choose a connection below to add source-backed analysis to your reports.")}</p></div><a href="/workspace" className="button button-outline">{t("Start planning") + " "}<ArrowRight size={16}/></a></div>{error && <div role="alert" className="notice warn">{t(error)}</div>}<div className="form-grid">{unlimited ? <section className="panel form-panel"><span className="feature-icon pink"><ShieldCheck size={23}/></span><h2>{t("Unlimited site allowance")}</h2><p className="form-note">{t("Use the site’s saved provider connection or your personal API key. No access code is required for your administrator account.")}</p><a href="/admin" className="button button-outline">{t("Owner controls")} <ArrowRight size={16}/></a></section> : <section className="panel form-panel"><span className="feature-icon pink"><Ticket size={23}/></span><h2>{t("Have an access code?")}</h2><p className="form-note">{t("Redeem a code from the site owner for 24 hours of sponsored AI. Your time starts when you redeem it. Each code can be used once per account.")}</p><form onSubmit={e => { e.preventDefault(); void action('redeem'); }}><label className="field"><span>{t("Access code")}</span><input name="access-code" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="FS-…" required maxLength={100}/></label><button className="button button-dark" disabled={Boolean(busy) || !state?.sponsorReady || Boolean(state?.passExpiresAt)}>{busy === 'redeem' ? t("Activating\u2026") : state?.passExpiresAt ? t("Pass active") : t("Activate my pass")}<ArrowRight size={16}/></button></form>{state && !state.sponsorReady && <p className="form-note">{t("Sponsored access is awaiting the owner\u2019s API connection. Codes will remain unused until it is ready.")}</p>}{state?.passExpiresAt && <p className="form-note">{t("Pass ends") + " "}{date(state.passExpiresAt)}{t(". Changing devices does not restart the timer.")}</p>}</section>}<section className="panel form-panel"><span className="feature-icon blue"><KeyRound size={23}/></span><h2>{t("Bring your own API key.")}</h2><p className="form-note">{t("Connect your OpenAI API account. Usage is billed separately by the provider.")}</p>{state?.personalKey && <div className="notice"><ShieldCheck size={16}/>{" " + t("Connected key ending in") + " "}<strong>{state.personalKey.suffix}</strong><button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => void action('remove')}>{t("Remove")}</button></div>}<form onSubmit={e => { e.preventDefault(); void action('save'); }}><label className="field"><span>{state?.personalKey ? t("Replace API key") : t("OpenAI API key")}</span><input type="password" name="api-key" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" required minLength={30} maxLength={512} spellCheck={false}/></label><button className="button button-outline" disabled={Boolean(busy) || !state?.storageReady}>{busy === 'save' ? t("Saving\u2026") : state?.personalKey ? t("Replace key") : t("Save API key")}<Check size={16}/></button></form><p className="form-note">{t("Encrypted on the server. Never stored in your browser or included in exports. Remove it here at any time. Your first AI request checks provider access and billing.")}</p>{state && !state.storageReady && <p className="notice warn">{t("The secure credential store is not ready. Keys cannot be saved yet.")}</p>}<a className="text-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">{t("Manage OpenAI API keys \u2197")}</a></section></div>{state && <section className="panel form-panel" style={{ marginTop: 24 }}><div className="row-between"><h2>{t(unlimited ? "AI usage today" : "Your AI allowance")}</h2><span className="pill">{unlimited ? t("Unlimited site allowance") : state.mode === 'personal' ? t("Daily \u00B7 UTC") : state.mode === 'sponsored' ? t("24-hour pass") : t("No connection")}</span></div><div className="ai-usage-grid"><div><span className="muted">{t("Metered tokens")}</span><strong>{state.usage.tokens.toLocaleString(locale)} {!unlimited && <small>/ {state.limits.tokens.toLocaleString(locale)}</small>}</strong></div><div><span className="muted">{t("Requests started")}</span><strong>{state.usage.requests.toLocaleString(locale)} {!unlimited && <small>/ {state.limits.requests.toLocaleString(locale)}</small>}</strong></div></div>{!unlimited && <progress className="ai-progress" max={state.limits.tokens} value={Math.min(state.usage.tokens, state.limits.tokens)} aria-label={t("AI token usage")}/>}<p className="form-note">{unlimited ? t("Usage is recorded for visibility, without a site request or token ceiling. Your provider’s available balance, billing and rate limits still apply.") : <>{t("Input and output tokens count towards your allowance. Each new request reserves") + " "}{state.reservation.toLocaleString(locale)}{" " + t("tokens, then settles to the provider\u2019s reported usage. Failed or interrupted requests retain their reservation. Web-search charges are separate from token usage; a final request can exceed its token reservation.")}</>}</p>{state.resetsAt && <p className="form-note">{state.mode === 'personal' ? t("Allowance resets") : t("Pass expires")} {date(state.resetsAt)}.</p>}</section>}</>}</div>;
}
export function AdminAIAccess() {
const { t, locale } = useI18n();
const date = (value:string|number) => new Date(value).toLocaleString(locale,{dateStyle:"medium",timeStyle:"short"});
    const [state, setState] = useState<AdminState | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [key, setKey] = useState('');
    const [label, setLabel] = useState(() => t('Guest pass'));
    const [maxClaims, setMaxClaims] = useState(1);
    const [days, setDays] = useState(7);
    const [freshCode, setFreshCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const load = async () => { const data = await api<AdminState>('/api/admin/ai'); setState(data); setConfig(data.config); };
    useEffect(() => { void load().catch(e => setError(e.message)); }, []);
    const run = async (path: string, method: string, payload?: unknown) => { setBusy(true); setError(''); try {
        const data = await api<AdminState>(path, { method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
        if (data.code)
            setFreshCode(data.code);
        setKey('');
        await load();
        toast.success(t("Saved."));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    return <><section className="panel form-panel" style={{ marginTop: 24 }}><div className="row-between"><div><span className="eyebrow">{t("OWNER CONTROLS")}</span><h2>{t("Sponsored AI & access passes")}</h2></div><LockKeyhole size={22}/></div><p className="form-note">{t("Visitors receive a limited pass, never your provider key. You can revoke a pass to stop new requests immediately.")}</p>{error && <p role="alert" className="notice warn">{t(error)}</p>}<div className="form-grid"><form onSubmit={e => { e.preventDefault(); void run('/api/admin/ai/key', 'PUT', { apiKey: key }); }}><label className="field"><span>{t("Sponsored OpenAI API key") + " "}{state?.key ? t(" \u00B7 ending {value0}", { value0: state.key.suffix }) : ''}</span><input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" minLength={30} maxLength={512} required/></label><div className="row"><button className="button button-outline" disabled={busy}>{t("Save sponsor key")}</button>{state?.key && <button type="button" className="text-link" disabled={busy} onClick={() => void run('/api/admin/ai/key', 'DELETE')}>{t("Remove saved key")}</button>}</div>{state?.environmentKey && <p className="form-note">{t("A hosting environment key is also configured. Remove it through hosting settings to disable that fallback.")}</p>}</form><form onSubmit={e => { e.preventDefault(); void run('/api/admin/ai', 'POST', { label, maxClaims, redeemDays: days }); }}><label className="field"><span>{t("Pass label")}</span><input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} required/></label><div className="ai-inline-fields"><label className="field"><span>{t("People who can claim it")}</span><input type="number" min={1} max={100} value={maxClaims} onChange={e => setMaxClaims(Number(e.target.value))}/></label><label className="field"><span>{t("Redeem within \u00B7 days")}</span><input type="number" min={1} max={90} value={days} onChange={e => setDays(Number(e.target.value))}/></label></div><button className="button button-dark" disabled={busy || !state?.sponsorReady}>{t("Create 24-hour pass") + " "}<Ticket size={16}/></button></form></div>{freshCode && <div className="ai-code-result"><strong>{t("Copy this code now. It is shown only once.")}</strong><code>{freshCode}</code><button className="button button-outline button-small" onClick={() => void navigator.clipboard.writeText(freshCode).then(() => toast.success(t("Code copied."))).catch(() => toast.error(t("Select and copy the code manually.")))}><Copy size={15}/>{t("Copy code")}</button></div>}{config && <form className="ai-limit-form" onSubmit={e => { e.preventDefault(); void run('/api/admin/ai', 'PATCH', config); }}><h3>{t("Standard account limits")}</h3><p className="form-note">{t("New passes inherit these limits. Existing passes keep the allowance issued to them. Personal keys use the daily account limit; site-wide limits apply only to sponsored requests.")}</p><p className="form-note">{t("These limits apply to standard accounts. Verified administrator usage is exempt and tracked separately.")}</p><div className="ai-limit-grid">{([['dailyTokens', 'Tokens per person', 20000, 1000000], ['dailyRequests', 'Requests per person', 1, 30], ['globalDailyTokens', 'Sponsored tokens per day', 20000, 5000000], ['globalDailyRequests', 'Sponsored requests per day', 1, 300]] as const).map(([field, title, min, max]) => <label className="field" key={field}><span>{t(title)}</span><input type="number" required min={min} max={max} value={config[field]} onChange={e => setConfig({ ...config, [field]: Number(e.target.value) })}/></label>)}</div><button className="button button-outline" disabled={busy}>{t("Save limits") + " "}<Check size={16}/></button><p className="form-note">{t("These application limits are not a currency spending cap. Provider usage settles after completion and can exceed a reservation. Set a separate project spending limit in OpenAI for cost control.")}</p></form>}<div className="ai-pass-list">{state?.passes.map(pass => <div className="setting-row" key={pass.id}><div><strong>{pass.label}</strong><p>{pass.claims.toLocaleString(locale)} / {pass.max_claims.toLocaleString(locale)}{" " + t("claimed \u00B7") + " "}{pass.token_limit.toLocaleString(locale)}{" " + t("tokens \u00B7") + " "}{pass.request_limit.toLocaleString(locale)}{" " + t("requests per person")}<br />{t("Claim by") + " "}{date(pass.redeem_before)}</p></div>{pass.revoked ? <span className="pill">{t("Revoked")}</span> : <button className="button button-outline button-small" disabled={busy} onClick={() => void run('/api/admin/ai', 'DELETE', { id: pass.id })}><Trash2 size={14}/>{t("Revoke")}</button>}</div>)}</div></section><AdminFreeAI/></>;
}
