'use client';
import { createContext, useContext, useEffect, useState, useCallback, useId, useRef } from 'react';
import { useI18n, LanguageSwitch } from '@/components/i18n';
import Link from '@/components/app-link';
import { usePathname } from 'next/navigation';
import { Moon, Sun, ArrowUpRight, Search, X, Menu, ArrowRight, ShieldCheck } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { TranslationValues } from '@/lib/i18n';
import type { Company, Viewer } from '@/lib/types';
import CompanyMark from './company-mark';
import { canGenerateCompany } from '@/lib/report-scope';
import { loadCompanyDirectory } from '@/lib/company-directory-request';
import './guest-access.css';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(result.error || 'We could not complete that request. Please try again.');
  return result;
}
const AppContext = createContext<{viewer: Viewer | null; accountError: string; refresh: () => Promise<void>; toggleFavorite: (symbol:string) => Promise<void>}>({viewer:null,accountError:'',refresh:async()=>{},toggleFavorite:async()=>{}});
export const useApp = () => useContext(AppContext);
export function Brand() {const {t}=useI18n();return <Link href="/" className="brand" aria-label={t("Finscope home")}><span className="brand-symbol"><svg viewBox="0 0 32 32" fill="none"><path d="M5 18C10 4 21 4 27 14M5 25C10 11 21 11 27 21" stroke="currentColor" strokeWidth="3.7" strokeLinecap="round"/><circle cx="26" cy="5" r="2.2" fill="var(--pink-strong)"/></svg></span><strong>Finscope<span>{t("FINANCIAL PLANNING")}</span></strong></Link>}
export function coverageLabel(company:Company,t:(source:string,values?:TranslationValues)=>string=(source,values)=>source.replace(/\{(\w+)\}/g,(_,key)=>String(values?.[key]??''))) {
  if(company.discoveryOnly) return t('Coverage checked when you generate');
  if(company.coverage?.status==='available') return t('{percent}% core data · {years} years',{percent:Math.round(company.coverage.completeness),years:company.coverage.periods});
  if(canGenerateCompany(company)) return t(company.coverage?.reportLevel==='basic'?'Basic company report available':'Partial financial report available');
  return t('Not available');
}
export function CompanySearch({onSelect,placeholder='Search a company or ticker, e.g. Apple or AAPL',autoFocus=false}:{onSelect:(c:Company)=>void;placeholder?:string;autoFocus?:boolean}) {
 const {t}=useI18n();
  const resultsId=useId();
  const blurTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const showResults=()=>{if(blurTimer.current)clearTimeout(blurTimer.current);setFocused(true);};
  useEffect(()=>()=>{if(blurTimer.current)clearTimeout(blurTimer.current);},[]);
  const [query,setQuery]=useState(''); const [focused,setFocused]=useState(false); const [items,setItems]=useState<Company[]>([]); const [busy,setBusy]=useState(false); const [index,setIndex]=useState(0); const [error,setError]=useState(''); const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!focused)return;
    const controller=new AbortController();setIndex(0);setItems([]);setError('');setBusy(true);
    const timer=setTimeout(()=>{
      loadCompanyDirectory(`/api/companies?q=${encodeURIComponent(query.trim())}`,controller.signal)
        .then(data=>{if(!controller.signal.aborted)setItems(data.companies.slice(0,8));})
        .catch(failure=>{if(!controller.signal.aborted)setError((failure as Error).message);})
        .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    },query.trim()?300:0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,focused,retry]);
  const choose=(company:Company)=>{if(!canGenerateCompany(company))return;onSelect(company);setQuery('');setFocused(false);};
  return <div className="company-search">
    <div className={`search-field ${focused?'focused':''}`}><Search size={21}/><input aria-label={t("Search companies")} role="combobox" aria-expanded={focused} aria-controls={resultsId} aria-autocomplete="list" autoFocus={autoFocus} value={query} placeholder={t(placeholder)} onFocus={showResults} onClick={showResults} onBlur={()=>{blurTimer.current=setTimeout(()=>setFocused(false),160);}} onChange={e=>{setQuery(e.target.value);showResults();}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.min(items.length-1,i+1));}if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}if(e.key==='Enter'&&items[index]){e.preventDefault();choose(items[index]);}if(e.key==='Escape')setFocused(false);}}/>{query?<button className="icon-button" aria-label={t("Clear search")} onClick={()=>setQuery('')}><X size={16}/></button>:<kbd>⌘ K</kbd>}</div>
    {focused&&<div className="search-results" id={resultsId}><div className="search-results-label" role="status">{t(busy?'Loading company directory…':query?'Company directory':'Companies to explore')}</div>
      {error?<div className="search-feedback" role="alert"><p>{t(error)}</p><button className="text-link" onMouseDown={e=>e.preventDefault()} onClick={()=>setRetry(value=>value+1)}>{t("Try again")}</button></div>:busy?<p className="muted empty-small">{t("Loading company names and ticker symbols.")}</p>:items.length?items.map((company,i)=><div className="search-result-container" key={`${company.exchange}:${company.symbol}`}><button className={`search-result ${i===index?'highlight':''}`} disabled={!canGenerateCompany(company)} title={company.coverage?.reason?t(company.coverage.reason):undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(company)}><CompanyMark symbol={company.symbol} size={33} color={company.color} mark={company.mark}/><span><strong>{company.name}</strong><small>{company.exchange} · {coverageLabel(company,t)}</small>{!canGenerateCompany(company)&&company.coverage?.reason&&<small className="search-coverage-reason">{t(company.coverage.reason)}</small>}</span><span className="mono">{company.symbol}</span><ArrowUpRight size={16}/></button>{!canGenerateCompany(company)&&company.cik&&<a className="search-source-link" href={'https://www.sec.gov/edgar/browse/?CIK='+encodeURIComponent(company.cik)+'&owner=exclude'} target="_blank" rel="noopener noreferrer" onMouseDown={e=>e.preventDefault()}>{t("View original company filings")} <ArrowUpRight size={12}/></a>}</div>):<p className="muted empty-small">{t("No matching companies. Try the company’s full name or exchange ticker.")}</p>}
      <div className="search-institution">{t("Select up to three companies. Financial data loads when you generate a report.")}</div>
    </div>}
  </div>;
}
export function AppShell({children,initialViewer=null,initialTheme='light'}:{children:React.ReactNode;initialViewer?:Viewer|null;initialTheme?:'light'|'dark'}){
 const {t,setAccountConnected}=useI18n();
 const pathname=usePathname(); const [viewer,setViewer]=useState<Viewer|null>(initialViewer);const [accountError,setAccountError]=useState(''); const [theme,setTheme]=useState(initialTheme);const [search,setSearch]=useState(false);const [menu,setMenu]=useState(false);
 const refresh=useCallback(async()=>{try{const v=await api<Viewer>('/api/me',{signal:AbortSignal.timeout(12000)});setViewer(v);setAccountConnected(Boolean(v.user));setAccountError(''); if(v.user){const nextTheme=v.preferences.theme==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v.preferences.theme;setTheme(nextTheme);document.documentElement.dataset.theme=nextTheme;document.documentElement.dataset.reducedMotion=String(v.preferences.reducedMotion);}}catch{setAccountError('Account services could not be reached. Your saved work is unchanged.');}},[setAccountConnected]);
 useEffect(()=>{const storedTheme=document.documentElement.dataset.theme==='dark'?'dark':'light';setTheme(storedTheme);document.documentElement.dataset.theme=storedTheme;void refresh();const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setSearch(s=>!s);}if(e.key==='Escape'){setSearch(false);setMenu(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[refresh]);
 useEffect(()=>{setMenu(false);setSearch(false);},[pathname]);
 const guestExpiresAt=viewer?.guest?.expiresAt;
 useEffect(()=>{if(!guestExpiresAt)return;const delay=Math.max(0,new Date(guestExpiresAt).getTime()-Date.now());const timer=setTimeout(()=>void refresh(),delay+100);return()=>clearTimeout(timer);},[guestExpiresAt,refresh]);
 const toggleTheme=async()=>{const nextTheme=theme==='light'?'dark':'light';setTheme(nextTheme);document.documentElement.dataset.theme=nextTheme;localStorage.setItem('finscope-theme',nextTheme);document.cookie=`finscope-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;if(viewer?.user)try{await api('/api/preferences',{method:'PATCH',body:JSON.stringify({theme:nextTheme})});await refresh();}catch(e){toast.error(t((e as Error).message));}};
 const toggleFavorite=async(symbol:string)=>{if(!viewer?.user){toast(t('Sign in to keep your watchlist in sync across devices.'),{action:{label:t('Sign in'),onClick:()=>{window.location.href='/login?return_to='+encodeURIComponent(window.location.pathname+window.location.search);}}});return;}try{const exists=viewer.favorites.includes(symbol);await api('/api/favorites',{method:exists?'DELETE':'POST',body:JSON.stringify({symbol})});await refresh();toast.success(t(exists?'Removed from your watchlist':'Added to your watchlist'));}catch(e){toast.error(t((e as Error).message));}};
 const isEntry=pathname==='/'||pathname==='/login';
 const nav=[['/workspace','Companies'],['/allocation','Planning'],['/favorites','Watchlist'],['/reports','Reports'],['/memos','Notes'],['/ai-access','AI access']];
 return <AppContext.Provider value={{viewer,accountError,refresh,toggleFavorite}}><header className={`site-header ${isEntry?'entry-header':'workspace-header'}`}><div className="header-inner"><Brand/>{!isEntry&&<nav className={menu?'main-nav open':'main-nav'} aria-label={t("Main navigation")}>{nav.filter(([href])=>!viewer?.guest||href!=='/ai-access').map(([href,label])=><Link key={href} href={href} className={pathname.startsWith(href)?'active':''}>{t(label)}</Link>)}</nav>}<div className="header-actions"><LanguageSwitch/>{!isEntry&&<button className="icon-button header-company-search" onClick={()=>setSearch(true)} aria-label={t("Find a company")}><Search size={19}/></button>}<button className="icon-button" onClick={toggleTheme} aria-label={t(theme==='light'?'Switch to dark mode':'Switch to light mode')}>{theme==='light'?<Moon size={19}/>:<Sun size={19}/>}</button>{!isEntry&&viewer?.guest&&<Link className="guest-header-badge" href="/reports" title={t("Guest reports are available in this browser for 24 hours")}>{t("Guest")} <span>{t("24h")}</span></Link>}{!isEntry&&(viewer?.user?<Link className="avatar" href="/settings" title={viewer.user.name}>{viewer.user.name.slice(0,1).toUpperCase()}</Link>:<Link className="button button-small button-dark" href="/login">{t("Sign in")} <ArrowUpRight size={14}/></Link>)}{!isEntry&&<button className="icon-button mobile-menu" onClick={()=>setMenu(!menu)} aria-label={t("Open navigation")}><Menu size={20}/></button>}</div></div></header><main key={pathname} className="page-transition">{children}</main>{!isEntry&&<footer className="site-footer"><div><Brand/><span>{t("A clearer view of your financial future.")}</span></div><div><Link href="/methodology">{t("Methodology")}</Link>{!viewer?.guest&&<Link href="/schedule">{t("Morning brief")}</Link>}{viewer?.isAdmin&&<Link href="/admin">{t("Admin")}</Link>}<span className="footer-note">{t("Financial tools. Not personalized advice.")}</span></div></footer>}{search&&<div className="modal-backdrop" onClick={()=>setSearch(false)}><section className="search-modal" onClick={e=>e.stopPropagation()}><div className="row-between"><span className="eyebrow">{t("FIND A COMPANY")}</span><button className="icon-button" aria-label={t("Close search")} onClick={()=>setSearch(false)}><X size={20}/></button></div><h2>{t("Which company is on your mind?")}</h2><CompanySearch autoFocus onSelect={c=>{setSearch(false);window.location.href=`/workspace?add=${encodeURIComponent(c.symbol)}`;}}/><p className="muted">{t("Search by company name, ticker or a familiar alias.")}</p></section></div>}<Toaster position="bottom-center" theme={theme==='dark'?'dark':'light'} richColors/></AppContext.Provider>;
}
export function LoginGate({title='Your plans, wherever you are.',description='Keep your watchlist, financial reports and notes in one private account.'}:{title?:string;description?:string}){const {t}=useI18n();const pathname=usePathname();return <div className="login-gate panel"><div className="feature-icon blue"><ShieldCheck size={25}/></div><h2>{t(title)}</h2><p className="muted">{t(description)}</p><Link className="button button-dark" href={`/login?return_to=${encodeURIComponent(pathname)}`}>{t("Sign in to continue")} <ArrowRight size={17}/></Link><Link href="/research/case-MSFT" className="text-link">{t("View a published financial report")}</Link></div>}
export function SectionHeading({eyebrow,title,description,children}:{eyebrow:string;title:string;description?:string;children?:React.ReactNode}){const {t}=useI18n();return <div className="section-heading"><div><div className="eyebrow">{t(eyebrow)}</div><h1>{t(title)}</h1>{description&&<p>{t(description)}</p>}</div>{children}</div>}

export function GuestAccessButton({destination='/workspace',className='button button-outline',disabled=false}:{destination?:string;className?:string;disabled?:boolean}) {
 const {t}=useI18n();
 const {viewer,refresh}=useApp();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const enter=async()=>{setBusy(true);setError('');try{if(!viewer?.user&&!viewer?.guest)await api('/api/guest/session',{method:'POST',body:'{}'});await refresh();window.location.assign(destination);}catch(failure){setError((failure as Error).message);setBusy(false);}};
 return <div className="guest-entry"><button type="button" className={className} onClick={()=>void enter()} disabled={busy||disabled} aria-busy={busy}>{busy?t('Opening your guest workspace…'):t(viewer?.guest?'Resume guest session':'Continue as guest')}<ArrowRight size={16}/></button>{error&&<p className="guest-entry-error" role="alert">{t(error)}</p>}</div>;
}
export function GuestSessionNotice({compact=false}:{compact?:boolean}) {
 const {t,locale}=useI18n();
 const {viewer}=useApp();if(!viewer?.guest)return null;
 const remaining=Math.max(0,viewer.usage.limit-viewer.usage.used);
 return <aside className={'guest-session-notice '+(compact?'compact':'')} aria-label={t("Guest session")}><div><span className="eyebrow">{t("GUEST WORKSPACE · THIS BROWSER")}</span><strong>{t('{remaining} of {limit} report credits remaining',{remaining,limit:viewer.usage.limit})}</strong><p>{t('Available until {date}. Export any reports you want to keep.',{date:new Date(viewer.guest.expiresAt).toLocaleString(locale,{timeZone:viewer.schedule.timezone||'America/Toronto',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})})}{!compact&&<> {t('Started requests use a credit, including failed retrievals. Guest reports do not transfer automatically to an account.')}</>}</p></div><div className="guest-session-actions"><Link className="text-link" href="/reports">{t("Guest reports")} <ArrowUpRight size={14}/></Link><Link className="button button-outline button-small" href="/login?mode=register">{t("Create an account")} <ArrowRight size={14}/></Link></div></aside>;
}
