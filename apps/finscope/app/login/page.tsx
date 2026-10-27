import { LoginPage } from '@/components/workspace';
import { selectFishCompanies } from '@/lib/fish-companies';
export const dynamic = 'force-dynamic';
export default function Page(){return <LoginPage fishCompanies={selectFishCompanies()}/>}
