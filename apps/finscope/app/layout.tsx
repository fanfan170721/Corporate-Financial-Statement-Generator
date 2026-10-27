import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from '@/components/shell';
import { cookies } from 'next/headers';
import { getViewer } from '@/lib/server';
import { I18nProvider } from '@/components/i18n';
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n';
import type { Viewer } from '@/lib/types';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale=resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
  title: { default: 'Finscope — Company analysis & financial planning', template: '%s · Finscope' },
  description: locale==='fr-CA' ? 'Analysez les entreprises, comparez leur performance financière et préparez vos projets. Retrouvez vos rapports, vos listes de suivi, vos scénarios de trésorerie et vos notes au même endroit.' : 'Understand companies, compare financial performance and plan ahead. Keep financial reports, watchlists, cash-flow scenarios and your own notes together.',
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  ...(locale==='fr-CA'?{title:{default:'Finscope — Analyse d’entreprises et planification financière',template:'%s · Finscope'}}:{})
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let viewer: Viewer|null=null;
  try { viewer=await getViewer(); } catch { /* The shell provides an explicit retry state if account storage is down. */ }
  const jar=await cookies();
  const locale=resolveLocale(jar.get(LOCALE_COOKIE)?.value,viewer?.preferences.locale);
  const cookieTheme=jar.get('finscope-theme')?.value;
  const preference=viewer?.user ? viewer.preferences.theme : cookieTheme==='dark'||cookieTheme==='system'?cookieTheme:'light';
  const theme=preference==='dark'?'dark':'light';
  // Values embedded here are validated enums/booleans, never user text or secrets.
  const themeBoot=`(()=>{let p=${JSON.stringify(preference)};try{if(${!viewer?.user&&!cookieTheme}){const s=localStorage.getItem('finscope-theme');if(['light','dark','system'].includes(s))p=s;}}catch{}document.documentElement.dataset.theme=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';})();`;
  return (
    <html lang={locale} data-theme={theme} data-reduced-motion={String(viewer?.preferences.reducedMotion??false)} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:themeBoot}}/></head>
      <body><I18nProvider initialLocale={locale} signedIn={Boolean(viewer?.user)}><AppShell initialViewer={viewer} initialTheme={theme}>{children}</AppShell></I18nProvider></body>
    </html>
  );
}
