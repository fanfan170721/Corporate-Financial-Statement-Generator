import { Suspense } from 'react';
import { CompareView } from '@/components/research';
export default function Page(){return <Suspense fallback={<div className="page loading-line">Loading the comparison…</div>}><CompareView/></Suspense>}
