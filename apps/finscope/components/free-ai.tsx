'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import Link from '@/components/app-link';
import { useI18n } from '@/components/i18n';
import { api, useApp } from './shell';
import { getReportScope } from '@/lib/report-scope';
import type { Report } from '@/lib/types';
import './free-ai.css';

type FreeProvider = 'gemini' | 'groq';
const providerLabels = { gemini: 'Gemini', groq: 'Groq' } as const;
type FreeStatus = {
  configured: boolean; canUse: boolean; unlimited: boolean; provider: string; providerId: FreeProvider; model: string;
  limits: { dailyRequests: number; globalDailyRequests: number; cooldownSeconds: number };
  usage: { requests: number; globalRequests: number }; retryAt: string | null; regionEligible?: boolean; regionReason?: string | null;
  regionNeedsConfirmation?: boolean; canUseWithRegionConfirmation?: boolean;
};
type AdminFreeStatus = {
  configured: boolean; enabled: boolean; storageReady: boolean; provider: string; providerId: FreeProvider; model: string;
  key: { suffix: string; updatedAt: string } | null;
};

export function FreeAIOverview() {
  const { t } = useI18n();
  return <section className="free-ai panel"><div className="free-ai-heading"><span className="feature-icon blue"><Sparkles size={23}/></span><div><span className="eyebrow">{t('NO ACCESS PASS REQUIRED')}</span><h2>{t('Free AI analysis')}</h2><p>{t('Open a saved financial report and choose Free AI analysis. Availability depends on the site’s selected provider, your region and remaining free capacity.')}</p></div><Link href="/reports" className="button button-outline">{t('Open my reports')} <ArrowRight size={15}/></Link></div><p className="form-note">{t('This option analyses the figures already in your report. Your OpenAI connection below remains available for research with web sources.')}</p></section>;
}

export function FreeAIAnalysis({ report, onUpdated, saved }: { report: Report; onUpdated: (report: Report) => void; saved: boolean }) {
  const { t, locale } = useI18n();
  const { viewer } = useApp();
  const [status, setStatus] = useState<FreeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const [country, setCountry] = useState<'' | 'CA' | 'US'>('');
  const userId = viewer?.user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    setChecking(true);
    try { setStatus(await api<FreeStatus>('/api/ai/free')); }
    catch (failure) { setError((failure as Error).message); }
    finally { setChecking(false); }
  }, [userId]);
  useEffect(() => { setStatus(null); setError(''); if (userId) void load(); }, [userId, load]);
  useEffect(() => { setCountry(''); }, [userId, report.id]);
  const retryTime = status?.retryAt ? Date.parse(status.retryAt) : 0;
  useEffect(() => {
    if (!retryTime || retryTime <= Date.now()) return;
    const timer = window.setInterval(() => {
      setClock(Date.now());
      if (Date.now() >= retryTime) { window.clearInterval(timer); void load(); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryTime, load]);
  const remaining = Math.max(0, Math.ceil((retryTime - (clock || Date.now())) / 1000));
  const basic = getReportScope(report).level === 'basic';
  const needsRegionConfirmation = status?.providerId === 'gemini' && status.regionNeedsConfirmation === true;
  const declaredRegionAllowed = needsRegionConfirmation && country !== '';
  const capacityAvailable = status?.canUse || (needsRegionConfirmation && status?.canUseWithRegionConfirmation);
  const regionAllowed = needsRegionConfirmation ? declaredRegionAllowed : status?.regionEligible !== false;
  const enabled = Boolean(userId && !viewer?.guest && saved && !basic && status?.configured && capacityAvailable && regionAllowed && remaining === 0 && !busy && !checking);
  const generate = async () => {
    if (!enabled) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ report: Report }>(`/api/reports/${encodeURIComponent(report.id)}/free-ai`, { method: 'POST', body: JSON.stringify({ locale, ...(declaredRegionAllowed ? { country } : {}) }) });
      onUpdated(result.report);
    } catch (failure) { setError((failure as Error).message); }
    finally { setCountry(''); setBusy(false); await load(); }
  };
  return <section className="free-ai panel" aria-labelledby="free-ai-heading">
    <div className="free-ai-heading"><span className="feature-icon blue"><Sparkles size={23}/></span><div><span className="eyebrow">{t('A SECOND PERSPECTIVE')}</span><h2 id="free-ai-heading">{t('Free AI analysis')}</h2><p>{status ? t('Powered by {provider} · Analyses this saved report. Does not search the web.', { provider: status.provider }) : t('Analyses this saved report. Does not search the web.')}</p></div><span className="pill blue">{t('No personal API key')}</span></div>
    <p className="free-ai-intro">{t('Explore growth, cash generation, financial resilience and the questions worth investigating next. Your existing AI connection remains available separately.')}</p>
    {!userId || viewer?.guest ? <div className="free-ai-action"><p>{t('Sign in and generate an account report to use free AI analysis. An access pass is not required.')}</p><Link href="/login?return_to=%2Fworkspace" className="button button-outline">{t('Sign in')} <ArrowRight size={15}/></Link></div>
      : basic ? <p className="notice">{t('This report has no comparable financial figures. Free financial AI analysis is unavailable until those figures can be retrieved.')}</p>
      : !saved ? <p className="notice">{t('Save a report with published financial evidence to your account before requesting free AI analysis.')}</p>
      : <><div className="free-ai-action"><div>{!status ? <p role="status">{checking ? t('Checking free AI availability…') : t('Free AI availability could not be checked.')}</p>
        : !status.configured ? <p>{t('Free AI is awaiting the site owner’s provider connection. Your reports and existing AI options remain available.')}</p>
        : status.regionEligible === false && !needsRegionConfirmation ? <p role="status">{t(status.regionReason || 'Free AI is not available in your region. Existing AI options remain available.')}</p>
        : <>{needsRegionConfirmation && <div className="free-ai-region"><label className="field"><span>{t('Your current country')}</span><select value={country} disabled={busy || checking} onChange={event => { setCountry(event.target.value as '' | 'CA' | 'US'); setError(''); }} aria-describedby="free-ai-region-note"><option value="">{t('Choose your current country')}</option><option value="CA">{t('Canada')}</option><option value="US">{t('United States')}</option></select></label><p id="free-ai-region-note" className="form-note">{t('Confirm where you are currently using Finscope. This location is self-declared; this fallback currently supports Canada and the United States.')}</p><p className="form-note">{t('Your choice applies only to this analysis request and is not saved.')}</p></div>}<p>{status.unlimited ? t('No individual daily site allowance applies. Shared capacity and provider limits still apply.') : t('{used} of {limit} free requests started today · UTC', { used: status.usage.requests, limit: status.limits.dailyRequests })}</p>{remaining > 0 ? <p role="status">{t('Available again in {seconds} seconds.', { seconds: remaining })}</p> : !capacityAvailable && <p>{t('Free capacity is currently unavailable. Check again later; no paid request will be started.')}</p>}</>}</div>
        <div className="free-ai-buttons"><button type="button" className="button button-dark" disabled={!enabled} onClick={() => void generate()}><Sparkles size={16}/>{busy ? t('Analysing the saved report…') : report.freeAi?.status === 'ready' ? t('Refresh free AI analysis') : t('Generate free AI analysis')}</button><button type="button" className="button button-outline button-small" disabled={checking || busy} onClick={() => { setError(''); void load(); }} aria-label={t('Check free AI availability')}><RefreshCw size={15}/><span>{t('Check availability')}</span></button></div></div>
        {status && <p className="form-note"><ShieldCheck size={14}/> {t('When you generate, public company figures and source references from this report are sent to {provider}. Account details, private notes and API keys are not included in the analysis prompt.', { provider: status.providerId === 'gemini' ? 'Google' : status.provider })}</p>}{status?.providerId === 'gemini' && <p className="form-note">{t('Google may use free-tier inputs and outputs to improve its products. Only the report’s public company evidence is included.')} <a className="text-link" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">{t('Google data-use terms')} <ArrowUpRight size={12}/></a></p>}</>}
    {error && <p role="alert" className="notice warn">{t(error)}</p>}
    {busy && <p className="free-ai-progress" role="status">{t('Preparing a source-linked analysis. This usually takes a little time; you can keep this page open.')}</p>}
    {report.freeAi && <div className="free-ai-result" aria-live="polite"><div className="row-between"><h3>{t('Your saved free AI analysis')}</h3>{report.freeAi.generatedAt && <span className="muted">{t('Prepared {date}', { date: new Date(report.freeAi.generatedAt).toLocaleString(locale) })}</span>}</div><p>{report.freeAi.summary}</p>
      {report.freeAi.status === 'ready' && <><div className="insight-grid">{report.freeAi.insights.map((insight, index) => <article key={index} className={`insight-card panel ${insight.stance}`}><span>{t('AI ANALYSIS')} · {String(index + 1).padStart(2, '0')}</span><h3>{insight.title}</h3><p>{insight.summary}</p>{insight.detail && <p>{insight.detail}</p>}</article>)}</div><div className="source-list">{report.freeAi.sources.map((source, index) => <a href={source.url} key={source.url + index} target="_blank" rel="noopener noreferrer">[{index + 1}] {source.label}<ArrowUpRight size={13}/></a>)}</div><p className="form-note">{report.freeAi.model} · {t('Based on this report’s dated evidence. Check the figures and assumptions before using any conclusion.')}</p></>}
    </div>}
  </section>;
}

export function AdminFreeAI() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<AdminFreeStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<FreeProvider>('gemini');
  const [key, setKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = async () => { const result = await api<AdminFreeStatus>('/api/admin/ai/free'); setState(result); setSelectedProvider(result.providerId); };
  useEffect(() => { void load().catch(failure => setError((failure as Error).message)); }, []);
  const action = async (kind: 'save' | 'toggle' | 'remove') => {
    setBusy(kind); setError(''); setSuccess('');
    try {
      const method = kind === 'save' ? 'PUT' : kind === 'toggle' ? 'PATCH' : 'DELETE';
      const payload = kind === 'save' ? { provider: selectedProvider, apiKey: key, confirmedFreePlan: confirmed } : kind === 'toggle' ? { enabled: !state?.enabled } : undefined;
      setState(await api<AdminFreeStatus>('/api/admin/ai/free', { method, ...(payload ? { body: JSON.stringify(payload) } : {}) }));
      setSuccess(kind === 'save' ? 'Free AI connection saved securely.' : kind === 'remove' ? 'The active free AI key was removed. Existing OpenAI connections are unchanged.' : 'Free AI availability updated.');
    } catch (failure) { setError((failure as Error).message); }
    finally { setKey(''); setConfirmed(false); setBusy(''); }
  };
  return <section className="panel form-panel free-ai-admin"><div className="row-between"><div><span className="eyebrow">{t('OWNER CONTROLS')}</span><h2>{t('Free AI connection')}</h2></div><KeyRound size={23}/></div>
    <p className="form-note">{t('Choose a free-tier provider for signed-in visitors. This connection is separate from sponsored OpenAI access and personal keys.')}</p>
    {state && <div className="free-ai-connection"><strong>{t('Saved provider: {provider}', { provider: state.provider })}</strong><span className={`pill ${state.configured && state.enabled ? 'blue' : ''}`}>{!state.enabled && state.key ? t('Paused') : state.configured ? t('Connected') : state.key ? t('Connection needs attention') : t('Not connected')}</span><span>{state.model}</span>{state.key && <span>{t('Key ending in {suffix}', { suffix: state.key.suffix })} · {new Date(state.key.updatedAt).toLocaleDateString(locale)}</span>}</div>}
    {error && <p className="notice warn" role="alert">{t(error)}</p>}{success && <p className="notice" role="status"><Check size={16}/> {t(success)}</p>}
    <form onSubmit={event => { event.preventDefault(); if (confirmed) void action('save'); }}>
      <label className="field"><span>{t('Provider for this connection')}</span><select value={selectedProvider} disabled={Boolean(busy) || !state} onChange={event => { setSelectedProvider(event.target.value as FreeProvider); setKey(''); setConfirmed(false); setError(''); setSuccess(''); }}><option value="gemini">Google Gemini</option><option value="groq">Groq</option></select></label>
      <label className="field"><span>{t('{provider} API key', { provider: providerLabels[selectedProvider] })}</span><input type="password" name="free-provider-api-key" autoComplete="off" spellCheck={false} value={key} onChange={event => setKey(event.target.value)} placeholder={selectedProvider === 'gemini' ? 'AQ.… / AIza…' : 'gsk_…'} required minLength={20} maxLength={256} disabled={Boolean(busy) || !state}/></label>
      {state?.key && selectedProvider !== state.providerId && <p className="form-note">{t('Saving will switch the active free AI provider from {current} to {next}. Nothing changes until you save.', { current: state.provider, next: providerLabels[selectedProvider] })}</p>}
      <label className="free-ai-confirm"><input type="checkbox" required checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)}/><span>{t('I am using the {provider} free tier with paid billing disabled.', { provider: providerLabels[selectedProvider] })}</span></label>
      <div className="free-ai-buttons"><button className="button button-outline" disabled={Boolean(busy) || !state?.storageReady || !confirmed}>{busy === 'save' ? t('Checking and saving…') : t('Save {provider} connection', { provider: providerLabels[selectedProvider] })}<Check size={15}/></button><a href={selectedProvider === 'gemini' ? 'https://aistudio.google.com/api-keys' : 'https://console.groq.com/keys'} target="_blank" rel="noopener noreferrer" className="text-link">{t('Create or manage a {provider} API key', { provider: providerLabels[selectedProvider] })} <ArrowUpRight size={14}/></a></div>
    </form>
    {state?.key && <div className="free-ai-active-controls"><p className="form-note">{t('These controls apply to the saved {provider} connection.', { provider: state.provider })}</p><div className="free-ai-buttons"><button type="button" className="button button-outline" disabled={Boolean(busy)} onClick={() => void action('toggle')}>{t(state.enabled ? 'Pause {provider}' : 'Enable {provider}', { provider: state.provider })}</button><button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => void action('remove')}>{t('Remove {provider} key', { provider: state.provider })}</button></div></div>}
    <p className="form-note">{t('Finscope does not enable paid upgrades or switch to a paid connection when free capacity runs out. The provider controls its plan, billing and rate limits; keep paid billing disabled.')}</p>
    {selectedProvider === 'gemini' && <p className="form-note">{t('Google may use free-tier inputs and outputs to improve its products. Only the report’s public company evidence is included.')} <a className="text-link" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">{t('Google data-use terms')} <ArrowUpRight size={12}/></a></p>}
    <p className="form-note">{t('The key is encrypted on the server, never returned in full, and never stored in browser storage. Saving checks provider access without generating an analysis.')}</p>
    {state && !state.storageReady && <p className="notice warn">{t('The secure credential store is not ready. Keys cannot be saved yet.')}</p>}
  </section>;
}
