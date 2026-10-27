'use client';
import Link from '@/components/app-link';
import { ArrowRight, Compass } from 'lucide-react';
import { useI18n } from '@/components/i18n';
export default function NotFound(){const{t}=useI18n();return <div className="page"><div className="empty-state panel"><Compass size={38}/><span className="eyebrow">{t('A DIFFERENT DIRECTION')}</span><h1>{t('This page is outside our coverage.')}</h1><p>{t('The report may have moved, or the address may be incomplete. Your next research question is still a good place to start.')}</p><Link className="button button-dark" href="/workspace">{t('Back to research')} <ArrowRight size={16}/></Link></div></div>}
