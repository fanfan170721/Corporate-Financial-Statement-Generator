'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n';
import Link from './app-link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Sparkles, Plus, X, Check, Bookmark, Waves, Layers3, Clock3, ScanLine, FileText, ShieldCheck, SlidersHorizontal, ChevronRight, CircleHelp } from 'lucide-react';
import { toast } from 'sonner';
import FishSchool from './fish-school';
import CompanyMark from './company-mark';
import { CompanySearch, useApp, SectionHeading, LoginGate, GuestAccessButton, GuestSessionNotice, api, coverageLabel } from './shell';
import { getCompany } from '@/lib/companies';
import type { Company, Report } from '@/lib/types';
import EmailAuth from './email-auth';

function EntryScene() {
 const {t}=useI18n();
  const { viewer } = useApp();
  const signedIn = Boolean(viewer?.user);
  const guest = Boolean(viewer?.guest);
  return (
    <div className="page entry-page">
      <section className="entry-layout">
        <div className="entry-copy">
          <h1>{signedIn ? <>{t("Welcome")}<br/><span>{t("back.")}</span></> : <>{t("A clearer view.")}<br/><span>{t("A longer horizon.")}</span></>}</h1>
          <p>{t(signedIn ? 'Your companies, your plans. Pick up where you left off.' : 'Understand companies. Plan with confidence.')}</p>
          <div className="entry-actions">
            <Link href={signedIn ? '/workspace' : '/login'} className="button button-dark button-large">{t(signedIn ? 'Start planning' : 'Sign in')} <ArrowRight size={18}/></Link>
          </div>
          {!signedIn && <div className="entry-guest-action"><GuestAccessButton/><small>{t("3 report credits · 24 hours in this browser.")}</small></div>}
          {!signedIn && <p className="entry-account-link">{t("New here?")} <Link href="/login?mode=register">{t("Create an account")}</Link></p>}
          {guest && <p className="entry-security">{t("Guest workspace · available for 24 hours in this browser.")}</p>}
          {!signedIn && !guest && <p className="entry-security"><ShieldCheck size={14}/>{t("Your saved work stays with your account.")}</p>}
        </div>
        <div className="entry-ocean" aria-label={t("Interactive company fish pond")}><FishSchool/></div>
      </section>
    </div>
  );
}

export function Welcome() { return <EntryScene/>; }

export function LoginPage() {
 const {t}=useI18n();
  return <div className="page entry-page auth-page"><section className="entry-layout"><EmailAuth/><div className="entry-ocean" aria-label={t("Interactive company fish pond")}><FishSchool/></div></section></div>;
}

function reportDestination(symbol:string,signedIn:boolean){const destination='/analyze?symbols='+encodeURIComponent(symbol)+'&mode=live';return signedIn?destination:'/login?return_to='+encodeURIComponent(destination);}
function selectable(company:Company){return company.coverage?.status==='available';}

export function CompanyCard({company,selected,onSelect}:{company:Company;selected?:boolean;onSelect:(company:Company)=>void;index?:number}) {
 const {t,locale}=useI18n();
 const {viewer,toggleFavorite}=useApp();const ready=selectable(company);
 return <article className={'company-card '+(selected?'is-selected ':'')+(ready?'':'company-unavailable')}>
  <div className="row-between"><CompanyMark symbol={company.symbol} color={company.color} mark={company.mark} size={42}/><button className={'icon-button bookmark '+(viewer?.favorites.includes(company.symbol)?'bookmarked':'')} aria-label={t('Watch {company}',{company:company.name})} onClick={()=>toggleFavorite(company.symbol)}><Bookmark size={17} fill={viewer?.favorites.includes(company.symbol)?'currentColor':'none'}/></button></div>
  <div className="company-name"><h3>{company.name}</h3><span className="mono">{company.symbol}</span></div>
  <div className="company-sector"><span>{t(company.sector)}</span><span>{company.exchange}</span></div>
  <div className={'coverage-indicator '+(ready?'available':'unavailable')} title={company.coverage?.checkedAt?t('Coverage checked {date}',{date:new Date(company.coverage.checkedAt).toLocaleString(locale)}):undefined}><span className="status-dot"/>{coverageLabel(company,t)}</div>
  {ready&&company.coverage?.dataAsOf?<p className="company-period">{t('Latest fiscal year ending {date}',{date:new Date(company.coverage.dataAsOf+'T12:00:00Z').toLocaleDateString(locale,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})})}</p>:<p className="company-period">{t(company.coverage?.reason||'Report coverage has not been verified.')}</p>}
  <div className="company-card-bottom">{ready?<Link href={reportDestination(company.symbol,Boolean(viewer?.user||viewer?.guest))} className="text-link">{t("Generate report")} <ArrowUpRight size={14}/></Link>:<span className="muted">{t("Report not available")}</span>}<button className={'add-button '+(selected?'selected':'')} disabled={!ready&&!selected} onClick={()=>onSelect(company)} aria-label={t(selected?'Remove {company}':'Select {company}',{company:company.name})}>{selected?<Check size={18}/>:<Plus size={18}/>}</button></div>
 </article>;
}

export function Workspace(){
 const {t}=useI18n();
 const {viewer}=useApp();const params=useSearchParams();const [selected,setSelected]=useState<Company[]>([]);const [sector,setSector]=useState('All ideas');const [showAll,setShowAll]=useState(false);const [companies,setCompanies]=useState<Company[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const addSymbol=params.get('add');
 useEffect(()=>{
  if(!addSymbol)return;const controller=new AbortController();
  api<{companies:Company[]}>('/api/companies?q='+encodeURIComponent(addSymbol),{signal:controller.signal}).then(result=>{
   if(controller.signal.aborted)return;const company=result.companies.find(item=>item.symbol.toUpperCase()===addSymbol.toUpperCase());
   if(!company||!selectable(company)){toast.error(t(company?.coverage?.reason||'This company does not currently have verified report coverage.'));return;}
   setSelected(previous=>previous.some(item=>item.symbol===company.symbol)?previous:[...previous.slice(0,2),company]);
  }).catch(failure=>{if(!controller.signal.aborted)toast.error(t((failure as Error).message));});
  return()=>controller.abort();
 },[addSymbol]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setCompanies([]);
  const suffix=sector==='All ideas'?'':'&sector='+encodeURIComponent(sector);
  api<{companies:Company[]}>('/api/companies?q='+suffix,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setCompanies(result.companies.filter(selectable));}).catch(failure=>{if(!controller.signal.aborted)setError((failure as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[sector,retry,viewer?.favorites.join(',')||'']);
 const choose=(company:Company)=>setSelected(previous=>{
  if(previous.some(item=>item.symbol===company.symbol))return previous.filter(item=>item.symbol!==company.symbol);
  if(!selectable(company)){toast.error(t(company.coverage?.reason||'This company is not ready for report generation.'));return previous;}
  if(previous.length>=3){toast(t('Choose up to three companies for a focused comparison.'));return previous;}return [...previous,company];
 });
 const start=()=>{
  if(!selected.length)return;
  if(selected.some(company=>!selectable(company))){toast.error(t('Choose companies with verified report coverage.'));return;}
  if(viewer?.guest&&selected.length>Math.max(0,viewer.usage.limit-viewer.usage.used)){toast.error(t('Choose fewer companies or sign in: this selection exceeds your remaining guest credits.'));return;}
  const destination='/analyze?symbols='+selected.map(company=>encodeURIComponent(company.symbol)).join(',')+'&mode=live';
  window.location.assign(viewer?.user||viewer?.guest?destination:'/login?return_to='+encodeURIComponent(destination));
 };
 const sectors=['All ideas','Technology','Consumer & health','Financials','Energy & industrials'];
 return <div className="page workspace"><GuestSessionNotice/>
  {viewer&&!viewer.user&&!viewer.guest&&<section className="guest-start-prompt"><div><strong>{t("Explore company financials without an account.")}</strong><p>{t("3 report credits, available for 24 hours in this browser. No AI or daily schedules.")}</p></div><GuestAccessButton/></section>}
  <div className="workspace-top"><div><div className="eyebrow"><span className="status-dot"/> {t("YOUR FINANCIAL PICTURE")}</div><h1>{t(viewer?.user?'Welcome back. ':'Good questions. ')}<span>{t("Better decisions.")}</span></h1><p>{t("Find a business. Follow the evidence. See what changes over time.")}</p></div>{!viewer?.guest&&<Link href="/schedule" className="button button-outline"><Clock3 size={16}/> {t("Morning brief")} <ChevronRight size={15}/></Link>}</div>
  <section className="research-hero"><div className="research-hero-copy"><span className="pill"><Sparkles size={13}/> {t("Company fundamentals, clearly explained")}</span><h2>{t("The numbers tell a story.")}<br/><span>{t("See the bigger picture.")}</span></h2><p>{t("Understand what drives the business, where the cash goes, and where the risks could be. Compare up to three companies.")}</p><div className="hero-mini-facts"><span><ScanLine size={15}/> {t("Traceable sources")}</span><span><Layers3 size={15}/> {t("Side-by-side comparison")}</span>{!viewer?.guest&&<span><Sparkles size={15}/> {t("AI-assisted analysis")}</span>}</div></div><div className="hero-graphic"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="graphic-dot dot-pink"/><div className="graphic-dot dot-blue"/><div className="floating-stat stat-one"><div><span className="mini-square blue"/> {t("FINANCIAL OVERVIEW")}</div><strong>{t("Evidence into insight")} <ArrowUpRight size={19}/></strong><svg viewBox="0 0 230 64"><path d="M0 56L25 45L50 49L75 27L100 36L125 18L150 28L175 10L200 17L230 1" fill="none" stroke="var(--blue)" strokeWidth="2.6"/><path d="M0 60L30 52L60 55L90 42L120 47L150 35L180 39L210 29L230 33" fill="none" stroke="var(--pink-strong)" strokeWidth="2" strokeDasharray="4 4"/></svg></div><div className="floating-stat stat-two"><div className="stat-icon"><Layers3 size={24}/></div><div><strong>{t("PLAN BEYOND TODAY.")}</strong><span>{t("Think beyond the next quarter.")}</span></div></div><span className="graphic-caption">{t("UNDERSTAND → COMPARE → PLAN")}</span></div></section>
  <section className="selection-panel panel"><div className="search-and-action"><CompanySearch onSelect={choose}/><button onClick={start} disabled={!selected.length} className="button button-dark">{t("Generate reports")} <ArrowRight size={17}/></button></div><div className="selection-details"><div className="selected-list">{selected.length?selected.map(company=><span className="selected-chip" key={company.symbol}><CompanyMark symbol={company.symbol} color={company.color} mark={company.mark} size={22}/>{company.name}<button aria-label={t('Remove {company}',{company:company.name})} onClick={()=>choose(company)}><X size={12}/></button></span>):<span className="muted">{t("Search by name or ticker, or choose a verified company below.")}</span>}</div><div className="mode-control"><span className="mono">{selected.length} / 3</span><span className="selection-source-label"><ShieldCheck size={13}/> {t("Published financial data")}</span></div></div></section>
  <section className="coverage-promise"><ShieldCheck size={18}/><p>{t("Report coverage is checked before you select a company. Each report shows its reporting periods, source links and any missing data.")}</p></section>
  <section className="discover-section"><div className="row-between section-title"><div><h2>{t("Companies to explore")} <span className="small-pill">{t("VERIFIED DATA")}</span></h2><p>{t(viewer?.favorites.length?'Explore companies related to the businesses you follow.':'A starting point for your next question. Search to explore the wider directory.')}</p></div>{companies.length>6&&<button className="text-link" onClick={()=>setShowAll(!showAll)}>{t(showAll?'Show less':'More companies')} <ArrowRight size={16}/></button>}</div><div className="filter-tabs">{sectors.map(item=><button key={item} className={sector===item?'active':''} onClick={()=>{setSector(item);setShowAll(false);}}>{t(item)}</button>)}<span>{t("Company information, not buy recommendations")}</span></div>
   {error?<div className="directory-feedback panel" role="alert"><CircleHelp size={28}/><h3>{t("Company data could not be checked.")}</h3><p>{t(error)}</p><button className="button button-outline" onClick={()=>setRetry(value=>value+1)}>{t("Try again")}</button></div>:loading?<div className="company-grid" aria-label={t("Checking financial data")} aria-busy="true">{Array.from({length:6},(_,index)=><div className="company-card company-skeleton" key={index}><span/><span/><span/><span/></div>)}</div>:companies.length?<div className="company-grid">{companies.slice(0,showAll?24:6).map(company=><CompanyCard key={company.symbol} company={company} selected={selected.some(item=>item.symbol===company.symbol)} onSelect={choose}/>)}</div>:<div className="directory-feedback panel"><h3>{t("No verified reports in this view yet.")}</h3><p>{t("Search a company directly or try another sector. Unverified companies are never presented as ready to generate.")}</p></div>}
  </section>
  <section className="tool-grid"><Link href="/allocation" className="tool-card tool-blue"><div className="feature-icon"><SlidersHorizontal size={24}/></div><div><span className="eyebrow">{t("THE BIGGER PICTURE")}</span><h3>{t("Build a portfolio view")}</h3><p>{t("Explore asset allocation, rate shocks and funding resilience.")}</p></div><ArrowUpRight size={22}/></Link><Link href="/memos" className="tool-card tool-pink"><div className="feature-icon"><FileText size={24}/></div><div><span className="eyebrow">{t("KEEP YOUR THINKING TOGETHER")}</span><h3>{t("Keep your own financial notes")}</h3><p>{t("Keep track of your assumptions, opportunities, risks and next steps.")}</p></div><ArrowUpRight size={22}/></Link><Link href="/liquidity" className="tool-card tool-pink"><div className="feature-icon"><Waves size={24}/></div><div><span className="eyebrow">{t("WHEN CAPITAL IS CALLED")}</span><h3>{t("Pressure-test the cash runway")}</h3><p>{t("Model liquidity buffers, private commitments and stressed outflows.")}</p></div><ArrowUpRight size={22}/></Link><Link href="/diligence" className="tool-card tool-blue"><div className="feature-icon"><ShieldCheck size={24}/></div><div><span className="eyebrow">{t("BEYOND THE TRACK RECORD")}</span><h3>{t("Evaluate a fund manager")}</h3><p>{t("Assess process, alignment, operations and risk in a structured scorecard.")}</p></div><ArrowUpRight size={22}/></Link></section><div className="research-principle"><ShieldCheck size={17}/><span>{t("A conclusion is only as good as the work behind it.")}</span><Link href="/methodology">{t("Sources, methods and limitations")} <ArrowUpRight size={14}/></Link></div>
 </div>;
}

export function FavoritesPage(){
 const {t}=useI18n();
 const {viewer}=useApp();const [selected,setSelected]=useState<string[]>([]);const [companies,setCompanies]=useState<Company[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [retry,setRetry]=useState(0);const favoriteKey=viewer?.favorites.join(',')||'';
 useEffect(()=>{
  if(!viewer?.user)return;const controller=new AbortController();setLoading(true);setError('');
  const symbols=viewer.favorites;
  Promise.all(symbols.map(async symbol=>{
   const result=await api<{companies:Company[]}>('/api/companies?q='+encodeURIComponent(symbol),{signal:controller.signal});
   return result.companies.find(company=>company.symbol===symbol)||{...(getCompany(symbol)||{symbol,name:symbol,nameEn:'',exchange:'',sector:'Saved company',color:'#78b8d2',mark:symbol.slice(0,2)}),coverage:{status:'unavailable' as const,completeness:0,periods:0,dataAsOf:'',checkedAt:new Date().toISOString(),missing:[],reason:'Current report coverage could not be verified.'}};
  })).then(result=>{if(!controller.signal.aborted){setCompanies(result);setSelected(previous=>previous.filter(symbol=>result.some(company=>company.symbol===symbol&&selectable(company))));}}).catch(failure=>{if(!controller.signal.aborted){setCompanies([]);setError((failure as Error).message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[viewer?.user?.id,favoriteKey,retry]);
 if(!viewer?.user)return <div className="page"><SectionHeading eyebrow={t("YOUR WATCHLIST")} title={t("Follow the businesses. Refine the view.")}/><LoginGate/></div>;
 return <div className="page"><SectionHeading eyebrow={t("YOUR WATCHLIST")} title={t("Your watchlist")} description={t("Track the businesses that matter. Select up to three verified companies for fresh reports.")}><Link href="/schedule" className="button button-outline"><Clock3 size={16}/> {t("Set up a morning brief")}</Link></SectionHeading>
  {viewer.favorites.length?<><div className="action-strip"><span>{t('{count} of 3 selected',{count:selected.length})}</span><button className="button button-dark" disabled={!selected.length||loading||!!error} onClick={()=>window.location.assign('/analyze?symbols='+selected.map(encodeURIComponent).join(',')+'&mode=live')}>{t("Generate and compare")} <ArrowRight size={16}/></button></div>{loading?<p className="loading-line" role="status">{t("Checking your watchlist against published financial data…")}</p>:error?<div className="notice" role="alert">{t(error)} <button className="text-link" onClick={()=>setRetry(value=>value+1)}>{t("Try again")}</button></div>:<div className="company-grid">{companies.map(company=><CompanyCard key={company.symbol} company={company} selected={selected.includes(company.symbol)} onSelect={()=>setSelected(previous=>previous.includes(company.symbol)?previous.filter(symbol=>symbol!==company.symbol):previous.length<3?[...previous,company.symbol]:previous)}/>)}</div>}</>:<div className="empty-state panel"><Bookmark size={32}/><h2>{t("Keep the businesses that matter in view.")}</h2><p>{t("Bookmark a company in the workspace to start your watchlist.")}</p><Link href="/workspace" className="button button-dark">{t("Explore companies")} <ArrowRight size={16}/></Link></div>}
 </div>;
}

export function ReportsPage(){
 const {t,locale}=useI18n();const {viewer,accountError,refresh}=useApp();const [reports,setReports]=useState<Report[]>([]);const [error,setError]=useState('');const [next,setNext]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [filter,setFilter]=useState('all');const load=async(cursor?:string)=>{setLoading(true);try{const data=await api<{reports:Report[];nextCursor:string|null}>(`/api/reports${cursor?`?before=${encodeURIComponent(cursor)}`:''}`);setReports(p=>cursor?[...p,...data.reports]:data.reports);setNext(data.nextCursor);}catch(e){setError((e as Error).message);}finally{setLoading(false);}};useEffect(()=>{if(viewer?.user||viewer?.guest)void load();},[viewer?.user?.id,viewer?.guest?.id]);return <div className="page"><SectionHeading eyebrow={viewer?.guest?"YOUR GUEST REPORTS":"YOUR SAVED REPORTS"} title={t("Your financial reports.")} description={viewer?.guest?"Reopen reports from this browser while your guest session is active. Export a CSV or PDF to keep a copy.":"Each report preserves a dated financial snapshot. Revisit the evidence behind your decisions."}><div className="row report-archive-actions"><Link href="/compare" className="button button-outline"><Layers3 size={16}/> {t("Compare saved reports")}</Link><Link href="/workspace" className="button button-dark"><Plus size={17}/> {t("New analysis")}</Link></div></SectionHeading>{!viewer?(accountError?<div role="alert" className="notice">{t(accountError)} <button className="text-link" onClick={()=>void refresh()}>{t("Try again")}</button></div>:<p className="loading-line">{t("Opening your report workspace…")}</p>):!viewer.user&&!viewer.guest?<><LoginGate/><div className="guest-archive-option"><GuestAccessButton/><p>{t("Guest reports stay available for 24 hours in this browser.")}</p></div></>:<><GuestSessionNotice/><div className="filter-tabs">{[['all','All reports'],['live','Public filings'],['demo','Demo reports']].map(([v,label])=><button className={filter===v?'active':''} key={v} onClick={()=>setFilter(v)}>{t(label)}</button>)}<span>{t('{count} reports loaded',{count:reports.length})}</span></div>{error&&<p className="notice">{t(error)}</p>}<div className="report-list">{reports.filter(r=>filter==='all'||r.mode===filter).map(r=><Link key={r.id} href={`/research/${encodeURIComponent(r.id)}`} className="report-list-item panel"><CompanyMark symbol={r.symbol} color={r.company.color} mark={r.company.mark} size={44}/><div><h3>{r.company.name} <span>{r.symbol}</span></h3><p>{r.mode==='demo'?t('Synthetic demo · not for investment decisions'):t('Public filings · as of {date}',{date:new Date(r.dataAsOf+'T12:00:00Z').toLocaleDateString(locale,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})})} · {t('{count} annual reporting periods',{count:r.periods.length})}</p></div><span className={`pill ${r.mode==='live'?'blue':''}`}>{t(r.mode==='live'?'Public filings':'Demo')}</span><time>{new Date(r.generatedAt).toLocaleString(locale)}</time><ArrowUpRight size={20}/></Link>)}</div>{!reports.length&&!loading&&<div className="empty-state panel"><FileText size={32}/><h2>{t("Your report collection starts here.")}</h2><p>{t(viewer?.guest?'Generate a report, then export a copy before your guest session expires.':'Reports you generate are saved to your private archive.')}</p><Link href="/workspace" className="button button-dark">{t("Open workspace")} <ArrowRight size={16}/></Link></div>}{loading&&<div className="loading-line">{t("Loading your financial reports…")}</div>}{next&&<button className="button button-outline" onClick={()=>load(next)} disabled={loading}>{t("Load earlier reports")}</button>}</>}</div>}


