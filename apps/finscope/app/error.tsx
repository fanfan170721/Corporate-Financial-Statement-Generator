'use client';
import Link from '@/components/app-link';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '@/components/i18n';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){const{t}=useI18n();return <div className="page"><div className="empty-state panel"><RefreshCw size={32}/><h1>{t('A pause in the research.')}</h1><p>{t('We could not load this page. Your saved work remains in your account.')}</p><button className="button button-dark" onClick={reset}>{t('Try again')} <RefreshCw size={15}/></button><Link className="text-link" href="/workspace">{t('Return to the workspace')}</Link></div></div>}
