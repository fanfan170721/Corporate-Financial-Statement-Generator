"use client";
import { useI18n } from "@/components/i18n";
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronRight, KeyRound, LoaderCircle, LockKeyhole, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import AppLink from './app-link';
import './owner-setup.css';
type ServiceSource = 'vault' | 'environment' | 'missing';
type SetupStatus = {
    storageReady: boolean;
    ownerEmail?: string;
    ai: {
        configured: boolean;
        source: ServiceSource;
        suffix?: string;
    };
    email: {
        configured: boolean;
        source: ServiceSource;
        sender?: string;
    };
};
type Service = 'ai' | 'email';
async function setupRequest(init?: RequestInit): Promise<SetupStatus> {
    const response = await fetch('/api/owner/setup', {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
    });
    const result = await response.json().catch(() => null) as (SetupStatus & {
        error?: string;
    }) | null;
    if (!response.ok) {
        throw new Error(result?.error || (response.status === 403
            ? 'This page is only available to the site owner. Reopen it with your owner account.'
            : 'The connection could not be saved. Please try again.'));
    }
    if (!result || typeof result.storageReady !== 'boolean' || !result.ai || !result.email) {
        throw new Error('Setup status is temporarily unavailable. Please refresh and try again.');
    }
    return result;
}
function ConnectionStatus({ configured, loaded }: {
    configured?: boolean;
    loaded: boolean;
}) {
const { t } = useI18n();
    return <span className={`owner-setup-status${configured ? ' is-saved' : ''}`}>
    {configured ? <Check size={13} aria-hidden="true"/> : <span aria-hidden="true"/>}
    {!loaded ? t("Checking\u2026") : configured ? t("Configured") : t("Not connected")}
  </span>;
}
export default function OwnerSetup() {
const { t } = useI18n();
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [aiKey, setAiKey] = useState('');
    const [emailKey, setEmailKey] = useState('');
    const [sender, setSender] = useState('');
    const [busy, setBusy] = useState<Service | null>(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState<Service | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setupRequest({ signal: controller.signal })
            .then(result => {
            setStatus(result);
            setSender(current => current || result.email.sender || '');
        })
            .catch(failure => {
            if (!controller.signal.aborted)
                setError(failure instanceof Error ? failure.message : 'Setup status could not be loaded.');
        })
            .finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [attempt]);
    async function save(event: FormEvent<HTMLFormElement>, service: Service) {
        event.preventDefault();
        if (busy || !status?.storageReady)
            return;
        setBusy(service);
        setError('');
        setSaved(null);
        try {
            const result = await setupRequest({
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(service === 'ai'
                    ? { service, apiKey: aiKey.trim() }
                    : { service, apiKey: emailKey.trim(), from: sender.trim() }),
            });
            if (service === 'ai')
                setAiKey('');
            else
                setEmailKey('');
            setStatus(result);
            setSaved(service);
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : 'The connection could not be saved. Please try again.');
        }
        finally {
            setBusy(null);
        }
    }
    const disabled = loading || Boolean(busy) || !status?.storageReady;
    return <div className="page owner-setup-page">
    <header className="owner-setup-heading">
      <span className="eyebrow"><LockKeyhole size={13} aria-hidden="true"/>{" " + t("OWNER SETUP")}</span>
      <h1>{t("Connect your services.")}</h1>
      <p>{t("Add the keys that power AI analysis and account emails. This page is available only through your site-owner access.")}</p>
    </header>

    <div className="owner-setup-security"><ShieldCheck size={18} aria-hidden="true"/><p>{t("Keys are encrypted on the server and are never shown again. Keep this page private; enter keys directly here, never in chat.")}</p></div>

    <div aria-live="polite" aria-atomic="true">
      {error && <div className="owner-setup-feedback is-error" role="alert"><p>{t(error)}</p>{!status && <button type="button" className="text-link" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/>{" " + t("Try again")}</button>}</div>}
      {status && !status.storageReady && <div className="owner-setup-feedback is-error"><p>{t("The secure credential store is not ready. Ask your site administrator to complete hosting configuration before entering keys.")}</p></div>}
    </div>

    <div className="owner-setup-grid">
      <section className="panel owner-setup-card" aria-labelledby="owner-ai-title">
        <div className="owner-setup-card-top"><span className="feature-icon pink"><KeyRound size={23} aria-hidden="true"/></span><ConnectionStatus loaded={!loading} configured={status?.ai.configured}/></div>
        <span className="owner-setup-step">{t("01 / AI ANALYSIS")}</span>
        <h2 id="owner-ai-title">{t("Connect OpenAI.")}</h2>
        <p className="owner-setup-description">{t("Power the AI reports you sponsor for your users. API usage is billed separately from a ChatGPT subscription.")}</p>
        {status?.ai.configured && <div className="owner-setup-current"><Check size={15} aria-hidden="true"/><span>{status.ai.source === 'environment' ? t("Hosting environment key is configured.") : t("Encrypted key is saved{value0}.", { value0: status.ai.suffix ? t(" · ending in {suffix}", {suffix:status.ai.suffix}) : '' })}</span></div>}
        <form onSubmit={event => void save(event, 'ai')} autoComplete="off">
          <label className="owner-setup-field" htmlFor="owner-openai-key"><span>{status?.ai.configured ? t("Replacement OpenAI API key") : t("OpenAI API key")}</span><input id="owner-openai-key" name="owner-openai-secret" type="password" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" value={aiKey} onChange={event => setAiKey(event.target.value)} placeholder="sk-…" minLength={30} maxLength={512} required disabled={disabled} aria-describedby="owner-ai-note"/></label>
          <button className="button owner-setup-save" type="submit" disabled={disabled || !aiKey.trim()}>{busy === 'ai' ? <LoaderCircle size={16} className="owner-setup-spinner" aria-hidden="true"/> : <LockKeyhole size={15} aria-hidden="true"/>}{busy === 'ai' ? t("Saving\u2026") : status?.ai.configured ? t("Replace AI key") : t("Save AI key")}</button>
          {saved === 'ai' && <p className="owner-setup-success" role="status"><Check size={15} aria-hidden="true"/>{t("Saved securely. The key field has been cleared.")}</p>}
        </form>
        <p id="owner-ai-note" className="owner-setup-note">{t("Saving stores the key only. It does not make an AI request or verify provider access, credits or billing.")}</p>
        <a className="owner-setup-provider-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">{t("Open OpenAI API keys") + " "}<ChevronRight size={14} aria-hidden="true"/></a>
      </section>

      <section className="panel owner-setup-card" aria-labelledby="owner-email-title">
        <div className="owner-setup-card-top"><span className="feature-icon blue"><Mail size={23} aria-hidden="true"/></span><ConnectionStatus loaded={!loading} configured={status?.email.configured}/></div>
        <span className="owner-setup-step">{t("02 / ACCOUNT EMAILS")}</span>
        <h2 id="owner-email-title">{t("Connect email delivery.")}</h2>
        <p className="owner-setup-description">{t("Send verification codes and password resets through Resend. Your sending domain must be verified in Resend first.")}</p>
        {status?.email.configured && <div className="owner-setup-current"><Check size={15} aria-hidden="true"/><span>{status.email.source === 'environment' ? t("Email is configured in hosting.") : t("Encrypted email credentials are saved.")}{status.email.sender && <> <strong>{status.email.sender}</strong></>}</span></div>}
        <form onSubmit={event => void save(event, 'email')} autoComplete="off">
          <label className="owner-setup-field" htmlFor="owner-resend-key"><span>{status?.email.configured ? t("Replacement Resend API key") : t("Resend API key")}</span><input id="owner-resend-key" name="owner-email-secret" type="password" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" value={emailKey} onChange={event => setEmailKey(event.target.value)} placeholder="re_…" minLength={20} maxLength={512} required disabled={disabled}/></label>
          <label className="owner-setup-field" htmlFor="owner-sender"><span>{t("From address")}</span><input id="owner-sender" name="owner-sender" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={sender} onChange={event => setSender(event.target.value)} placeholder={t("Finscope <hello@yourdomain.com>")} maxLength={320} required disabled={disabled} aria-describedby="owner-email-note"/><small>{t("Use an address on your verified sending domain.")}</small></label>
          <button className="button owner-setup-save" type="submit" disabled={disabled || !emailKey.trim() || !sender.trim()}>{busy === 'email' ? <LoaderCircle size={16} className="owner-setup-spinner" aria-hidden="true"/> : <LockKeyhole size={15} aria-hidden="true"/>}{busy === 'email' ? t("Saving\u2026") : status?.email.configured ? t("Replace email connection") : t("Save email connection")}</button>
          {saved === 'email' && <p className="owner-setup-success" role="status"><Check size={15} aria-hidden="true"/>{t("Saved securely. The key field has been cleared.")}</p>}
        </form>
        <p id="owner-email-note" className="owner-setup-note">{t("Saving does not send an email or verify delivery. Resend must accept your key, sender and domain before verification emails can be delivered.")}</p>
        <a className="owner-setup-provider-link" href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">{t("Open Resend domains") + " "}<ChevronRight size={14} aria-hidden="true"/></a>
      </section>
    </div>

    <section className="panel owner-setup-next" aria-labelledby="owner-next-title">
      <span className="owner-setup-next-number" aria-hidden="true">03</span>
      <div><span className="owner-setup-step">{t("YOUR FINSCOPE ACCOUNT")}</span><h2 id="owner-next-title">{t("Finish with your owner account.")}</h2><p>{t("Once email delivery is ready, register using the configured owner email and verify the code in your inbox. Saving service keys does not create an account or sign you in.")}</p>{status?.ownerEmail && <p className="owner-setup-owner-email">{t("Owner email") + " "}<strong>{status.ownerEmail}</strong></p>}</div>
      <div className="owner-setup-next-actions"><AppLink href="/login?mode=register&amp;return_to=%2Fadmin" className="button button-dark">{t("Create owner account") + " "}<ArrowRight size={15} aria-hidden="true"/></AppLink><AppLink href="/login?return_to=%2Fadmin" className="text-link">{t("Already registered? Sign in")}</AppLink></div>
    </section>
    <div className="owner-setup-bottom"><AppLink href="/">{t("Back to Finscope") + " "}<ArrowRight size={13} aria-hidden="true"/></AppLink><span>{t("Configuration is private. Provider connection is checked when used.")}</span></div>
  </div>;
}
