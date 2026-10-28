import { Welcome } from '@/components/workspace';
import { selectFishCompanies } from '@/lib/fish-companies';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const firstVisit = (await cookies()).get('finscope-intro-seen')?.value !== '1';
  return <Welcome fishCompanies={selectFishCompanies()} firstVisit={firstVisit} />;
}
