import type { Metadata } from "next";
import LiquidityLab from "@/components/liquidity-lab";
import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/i18n';
export async function generateMetadata(): Promise<Metadata> { return (await cookies()).get(LOCALE_COOKIE)?.value==='fr-CA' ? {title:'Liquidités et engagements',description:'Évaluez les prestations, les cotisations et les appels de capitaux sur 24 mois dans un scénario de liquidité sous tension.'} : { title: "Liquidity & commitments", description: "Reconcile pension benefits, contributions and private-market calls across a 24-month liquidity stress scenario." }; }
export default function LiquidityPage() { return <LiquidityLab />; }
