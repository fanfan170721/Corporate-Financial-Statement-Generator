import { Suspense } from 'react';
import { CompareView } from '@/components/research';
import { getDemoReport } from '@/lib/market';
import { getCompany } from '@/lib/companies';
export default async function Page({searchParams}:{searchParams:Promise<{symbols?:string;ids?:string}>}){const query=await searchParams;const symbols=(query.symbols||'').split(',').filter(s=>getCompany(s)).slice(0,3);const reports=query.ids?[]:symbols.map(s=>getDemoReport(s));return <Suspense fallback={<div className="page loading-line">Loading the comparison…</div>}><CompareView initialReports={reports}/></Suspense>}
