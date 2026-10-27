import { LockKeyhole } from 'lucide-react';
import AppLink from '@/components/app-link';
import OwnerSetup from '@/components/owner-setup';
import { getOwnerSetupAccess } from '@/lib/owner-setup';
import '@/components/owner-setup.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner setup · Finscope', robots: { index: false, follow: false } };

export default async function OwnerSetupPage() {
  if (!await getOwnerSetupAccess()) {
    return <div className="page owner-setup-page"><section className="panel owner-setup-gate"><span className="feature-icon blue"><LockKeyhole size={24} aria-hidden="true"/></span><h1>Owner access required.</h1><p>This setup page is available only to the site owner. Open it using the account that manages this site.</p><AppLink href="/" className="button button-dark">Back to Finscope</AppLink></section></div>;
  }
  return <OwnerSetup/>;
}
