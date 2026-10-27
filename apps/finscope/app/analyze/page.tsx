import { Suspense } from 'react';
import { AnalyzePage } from '@/components/research';
export default function Page(){return <Suspense fallback={<div className="page loading-line">Preparing your research…</div>}><AnalyzePage/></Suspense>}
