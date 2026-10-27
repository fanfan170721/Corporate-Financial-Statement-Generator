import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from '@/components/shell';

export const metadata: Metadata = {
  title: { default: 'Finscope — Company analysis & financial planning', template: '%s · Finscope' },
  description: 'Understand companies, compare financial performance and plan ahead. Keep financial reports, watchlists, cash-flow scenarios and your own notes together.',
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
