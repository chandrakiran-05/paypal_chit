import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'Chit — money moves together', description: 'A shared treasury for community savings circles.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <header className="border-b border-[#e4e6dc] bg-[#f5f4ee]"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 lg:px-10">
      <Link href="/" aria-label="Chit home" className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e6846] text-xl font-black text-white">c</span><span className="text-2xl font-black tracking-[-.08em]">chit<span className="text-[#ddad41]">.</span></span></Link>
      <span className="hidden border-l border-[#d8dcd2] pl-5 text-xs font-bold uppercase tracking-[.14em] text-[#6f796f] sm:block">The circle moves together</span>
      <div className="flex items-center gap-2 rounded-full border border-[#dbe1d6] bg-white px-3 py-1.5 text-xs font-bold text-[#246145]"><span className="h-1.5 w-1.5 rounded-full bg-[#56b77c]"/>Sandbox workspace</div>
    </div></header>{children}<footer className="mx-auto flex max-w-[1440px] justify-between border-t border-[#e2e5dc] px-5 py-7 text-xs text-[#8a9389] lg:px-10"><span>CHIT / COMMUNITY TREASURY</span><span>Every contribution has a place.</span></footer>
  </body></html>;
}
