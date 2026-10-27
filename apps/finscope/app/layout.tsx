import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from '@/components/shell';

export const metadata: Metadata = {
  title: { default: 'Finscope — Investment research, built for the long view', template: '%s · Finscope' },
  description: 'An institutional investment research workspace. Connect company fundamentals, asset–liability management, liquidity and independent judgement.',
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-CA" suppressHydrationWarning>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
