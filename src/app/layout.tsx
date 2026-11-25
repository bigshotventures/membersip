import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { APP_NAME, APP_URL } from '@/lib/utils';
import { CookieNotice } from '@/components/layout/CookieNotice';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Memberships, courses, live sessions and community — all in one place.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#7c3aed', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
