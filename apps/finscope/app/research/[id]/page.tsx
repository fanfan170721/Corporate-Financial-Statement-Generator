import { ReportView } from '@/components/research';
import { getDemoReport } from '@/lib/market';
import { notFound } from 'next/navigation';
import { getCompany } from '@/lib/companies';
import { getCaseStudy } from '@/lib/case-studies';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id.startsWith('case-')){const report=getCaseStudy(id.slice(5));if(!report)notFound();return <ReportView id={id} initialReport={report}/>;}if(id.startsWith('demo-')){const symbol=id.slice(5);if(!getCompany(symbol))notFound();return <ReportView id={id} initialReport={getDemoReport(symbol)}/>;}return <ReportView id={id}/>}
