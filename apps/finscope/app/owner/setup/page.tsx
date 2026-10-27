import { notFound } from 'next/navigation';
import OwnerSetup from '@/components/owner-setup';
import { getOwnerSetupAccess } from '@/lib/owner-setup';
import '@/components/owner-setup.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner setup · Finscope', robots: { index: false, follow: false } };

export default async function OwnerSetupPage() {
  if (!await getOwnerSetupAccess()) notFound();
  return <OwnerSetup/>;
}
