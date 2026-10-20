import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ValueBack — Don’t lose value you’ve already paid for', template: '%s · ValueBack' },
  description:
    'Track refunds, gift cards, store credits and prepaid benefits in one place. Know what needs your attention and act before the deadline passes.',
  applicationName: 'ValueBack',
  robots: { index: false, follow: false }, // local build; no public deployment
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme is resolved on the server from a cookie, so the first paint is right.
  const theme = (await cookies()).get('vb_theme')?.value;
  const attr = theme === 'light' || theme === 'dark' ? theme : undefined;
  return (
    <html lang="en" data-theme={attr} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
