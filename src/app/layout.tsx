import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Low Carbon Materials Hub',
  description:
    'Compare concrete products by embodied carbon across the full EN 15804 life cycle. Every figure traces back to its source EPD.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">LCM Hub</span>
              <span className="hidden text-sm text-stone-500 sm:inline">
                Low Carbon Materials Hub
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-stone-600">
                Products
              </Link>
              <Link href="/compare" className="hover:text-stone-600">
                Compare
              </Link>
              <Link href="/about" className="hover:text-stone-600">
                About the data
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-stone-500 sm:px-6">
            Every figure links to its source EPD page. A not-declared life-cycle stage is{' '}
            <span className="font-medium">not</span> a zero — see the “Not declared” badges.
          </div>
        </footer>
      </body>
    </html>
  );
}
