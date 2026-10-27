import type { Metadata } from "next";
import AllocationLab from "@/components/allocation-lab";
import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> { return (await cookies()).get(LOCALE_COOKIE)?.value==='fr-CA' ? {
  title:'Simulation actif-passif',
  description:'Explorez la répartition de l’actif, la duration et la capitalisation à l’aide de scénarios transparents et modifiables.',
} : {
  title: "Asset–liability lab",
  description: "Explore allocation, duration exposure and funded status through transparent, editable institutional investment scenarios.",
}; }

export default function AllocationPage() {
  return <AllocationLab />;
}
