'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import Link from './app-link';
import { useApp } from './shell';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
type AuthConfig = { emailDeliveryAvailable: boolean; deliveryMode?: 'local-test' | 'provider' | 'unavailable'; password: { minLength: number; maxLength: number }; codeLength: number; expiresIn: number };
type AuthResponse = { message?: string; challengeId?: string; expiresIn?: number; redirectTo?: string };
type AuthError = Error & { retryAfter?: number };

function safeDestination(value: string | null | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/workspace';
  try {
    const url = new URL(value, 'https://finscope.local');
    if (url.origin !== 'https://finscope.local' || /^\/(login|api|signin-with-chatgpt|signout-with-chatgpt|callback)(\/|$)/.test(url.pathname)) return '/workspace';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/workspace'; }
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const response = await fetch(`/api/auth/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as AuthResponse & { error?: string; retryAfter?: number };
  if (!response.ok) {
    const error: AuthError = new Error(result.error || 'We could not complete that request. Please try again.');
    error.retryAfter = result.retryAfter || Number(response.headers.get('Retry-After')) || undefined;
    throw error;
  }
  return result;
}

export default function EmailAuth() {
  const params = useSearchParams();
  const { viewer } = useApp();
  const requested = params.get('mode');
  const [mode, setMode] = useState<Mode>(requested === 'register' ? 'register' : requested === 'forgot' ? 'forgot' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const destination = safeDestination(params.get('return_to'));

  useEffect(() => {
    const controller = new AbortController();
    setConfigError(false);
    fetch('/api/auth/config', { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<AuthConfig>; })
      .then(result => { if (typeof result.emailDeliveryAvailable !== 'boolean' || !result.password) throw new Error(); setConfig(result); }).catch(error => { if (error.name !== 'AbortError') setConfigError(true); });
    return () => controller.abort();
  }, [configAttempt]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function changeMode(next: Mode) {
    setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmPassword(''); setCode(''); setShowPassword(false);
  }
  function handleError(value: unknown) {
    const failure = value as AuthError;
    setError(failure.message || 'Connection interrupted. Please try again.');
    if (failure.retryAfter) setCooldown(Math.min(3600, Math.ceil(failure.retryAfter)));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    if ((mode === 'register' || mode === 'reset') && password !== confirmPassword) { setError('The passwords do not match. Please check both fields.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await authRequest('login', { email: email.trim(), password, rememberMe, returnTo: destination });
        setPassword(''); window.location.assign(safeDestination(result.redirectTo)); return;
      }
      if (mode === 'register' || mode === 'forgot') {
        const result = await authRequest(mode === 'register' ? 'register' : 'forgot-password', mode === 'register' ? { name: name.trim(), email: email.trim(), password } : { email: email.trim() });
        if (!result.challengeId) throw new Error('The verification request could not be started. Please try again.');
        setChallengeId(result.challengeId); setPassword(''); setConfirmPassword(''); setCode(''); setCooldown(60);
        setMode(mode === 'register' ? 'verify' : 'reset'); setMessage(config?.deliveryMode === 'local-test' ? 'Local test only: no email was sent. Use the code from the development inbox.' : result.message || 'Check your email for a six-digit code.'); return;
      }
      if (mode === 'verify') {
        const result = await authRequest('verify-email', { email: email.trim(), challengeId, code, returnTo: destination });
        window.location.assign(safeDestination(result.redirectTo)); return;
      }
      const result = await authRequest('reset-password', { email: email.trim(), challengeId, code, password });
      changeMode('login'); setMessage(result.message || 'Password updated. Sign in with your new password.');
    } catch (error) { handleError(error); } finally { setBusy(false); }
  }
  async function resend() {
    if (cooldown || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await authRequest(mode === 'verify' ? 'resend-verification' : 'forgot-password', { email: email.trim(), challengeId });
      if (!result.challengeId) throw new Error('The code could not be resent. Please try again.');
      setChallengeId(result.challengeId); setCode(''); setCooldown(60); setMessage(config?.deliveryMode === 'local-test' ? 'A new code is available in the development inbox. No email was sent.' : result.message || 'A new code is on its way. Use the most recent email.');
    } catch (error) { handleError(error); } finally { setBusy(false); }
  }

  if (viewer?.user) return <div className="entry-copy auth-copy"><span className="auth-badge"><CheckCircle2 size={17}/> Signed in</span><h1>Welcome<br/><span>back.</span></h1><p>Continue with your saved companies and financial plans.</p><div className="entry-actions"><Link href={destination} className="button button-dark button-large">Start planning <ArrowRight size={18}/></Link></div></div>;
  const titles: Record<Mode, string> = { login: 'Welcome back.', register: 'Make room for your plans.', verify: 'Check your inbox.', forgot: 'A fresh start.', reset: 'Choose a new password.' };
  const subtitles: Record<Mode, string> = { login: 'Sign in to keep your companies, reports and plans in one place.', register: 'Create your account. We’ll send a code to verify your email.', verify: `Enter the six-digit code sent to ${email}.`, forgot: 'Enter your email to request a password reset code.', reset: `Enter the code sent to ${email} and set your new password.` };
  const needsMail = mode === 'register' || mode === 'forgot';
  const mailUnavailable = config?.emailDeliveryAvailable === false;
  const passwordField = mode === 'login' || mode === 'register' || mode === 'reset';
  const codeField = mode === 'verify' || mode === 'reset';
  return <div className="entry-copy auth-copy">
    <Link href="/" className="auth-back"><ArrowLeft size={14}/> Back to Finscope</Link>
    <h1>{titles[mode]}</h1><p>{config?.deliveryMode === 'local-test' && codeField ? `Enter the development verification code for ${email}.` : subtitles[mode]}</p>
    {config?.deliveryMode === 'local-test' && <div className="auth-notice" role="status">Development email test mode. No email is sent.</div>}
    {mode === 'login' || mode === 'register' ? <div className="auth-tabs" aria-label="Account access"><button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')} disabled={busy}>Sign in</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')} disabled={busy}>Create account</button></div> : null}
    {configError && <div className="auth-notice" role="status">Account availability could not be checked. <button type="button" onClick={() => setConfigAttempt(value => value + 1)}>Try again</button></div>}
    {!config && !configError && needsMail && <p className="auth-loading" role="status">Checking account services…</p>}
    {mailUnavailable && needsMail && <div className="auth-notice" role="status"><Mail size={17}/><span>Email delivery is being set up. New accounts and password resets are temporarily unavailable. <Link href="/workspace">Explore the company tools</Link> while we connect it.</span></div>}
    <form className="auth-form" onSubmit={submit}>
      {mode === 'register' && <label className="auth-field" htmlFor="auth-name"><span>Your name</span><input id="auth-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="How should we address you?" disabled={busy}/></label>}
      {!codeField && <label className="auth-field" htmlFor="auth-email"><span>Email address</span><input id="auth-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" disabled={busy}/></label>}
      {codeField && <label className="auth-field" htmlFor="auth-code"><span>Verification code</span><input id="auth-code" className="auth-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} placeholder="000000" aria-describedby="auth-code-note" disabled={busy}/><small id="auth-code-note">Codes expire after 10 minutes. Check your spam folder, too.</small></label>}
      {passwordField && <label className="auth-field" htmlFor="auth-password"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><div className="auth-password"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'login' ? undefined : config?.password.minLength || 12} maxLength={config?.password.maxLength || 128} placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'} disabled={busy}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>}
      {(mode === 'register' || mode === 'reset') && <label className="auth-field" htmlFor="auth-confirm"><span>Confirm password</span><input id="auth-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required maxLength={128} placeholder="Enter your password again" disabled={busy}/></label>}
      {mode === 'login' && <div className="auth-options"><label><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)}/> Remember this device</label><button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button></div>}
      {error && <div className="auth-feedback error" role="alert">{error}</div>}
      {message && <div className="auth-feedback success" role="status"><CheckCircle2 size={16}/><span>{message}</span></div>}
      <div className="entry-actions"><button type="submit" className="button button-dark button-large" disabled={busy || (needsMail && (!config || mailUnavailable))}>{busy ? <><LoaderCircle size={18} className="auth-spin"/> Please wait…</> : <>{mode === 'login' ? 'Start planning' : mode === 'register' ? 'Create account' : mode === 'verify' ? 'Verify and continue' : mode === 'forgot' ? 'Send reset code' : 'Update password'}<ArrowRight size={18}/></>}</button></div>
      {codeField && <div className="auth-code-actions"><button type="button" disabled={busy || cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</button><button type="button" disabled={busy} onClick={() => changeMode(mode === 'verify' ? 'register' : 'forgot')}>Use a different email</button></div>}
      {(mode === 'forgot' || mode === 'reset') && <button className="auth-return" type="button" onClick={() => changeMode('login')} disabled={busy}><ArrowLeft size={14}/> Back to sign in</button>}
    </form>
    <p className="entry-security"><ShieldCheck size={14}/>Your reports and plans are private to your account.</p>
  </div>;
}
