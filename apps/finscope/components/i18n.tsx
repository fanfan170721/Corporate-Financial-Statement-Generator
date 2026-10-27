'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LOCALE_COOKIE, resolveLocale, tr, type Locale, type TranslationValues } from '@/lib/i18n';
import './language.css';

type LanguageContext = { locale: Locale; setLocale: (locale: Locale) => void; setAccountConnected: (connected:boolean)=>void; t: (source: string, values?: TranslationValues) => string };
const Context = createContext<LanguageContext>({ locale:'en-CA',setLocale:()=>{},setAccountConnected:()=>{},t:(source,values)=>tr('en-CA',source,values) });
export function I18nProvider({ initialLocale, signedIn=false, children }: { initialLocale: Locale; signedIn?: boolean; children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const [accountConnected,setAccountConnected]=useState(signedIn);
  const pendingSave=useRef<Promise<void>>(Promise.resolve());
  const setLocale = useCallback((next: Locale) => {
    const selected=resolveLocale(next);
    document.cookie=`${LOCALE_COOKIE}=${selected}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
    updateLocale(selected);
    if(accountConnected) pendingSave.current=pendingSave.current.then(async()=>{
      const response=await fetch('/api/preferences',{method:'PATCH',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:selected})});
      if(!response.ok)throw new Error('Preference unavailable');
    }).catch(()=>toast.error(tr(selected,'Language preference could not be saved to your account. It is still saved in this browser.'))).then(()=>{});
  },[accountConnected]);
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  const value=useMemo(()=>({locale,setLocale,setAccountConnected,t:(source:string,values?:TranslationValues)=>tr(locale,source,values)}),[locale,setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
export function LanguageSwitch(){
  const {locale,setLocale,t}=useI18n();
  return <div className="language-switch" role="group" aria-label={t('Choose your language')}>
    <button type="button" lang="en-CA" aria-label="English (Canada)" aria-pressed={locale==='en-CA'} onClick={()=>setLocale('en-CA')}>EN</button>
    <button type="button" lang="fr-CA" aria-label="Français (Canada)" aria-pressed={locale==='fr-CA'} onClick={()=>setLocale('fr-CA')}>FR</button>
  </div>;
}
