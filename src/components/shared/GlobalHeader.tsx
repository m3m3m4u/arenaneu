"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';

export default function GlobalHeader(){
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isGuest, setIsGuest] = useState(false);

  // Gastmodus ableiten: URL-Parameter ?guest=1 oder localStorage guest:active
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const flag = p.get('guest') === '1' || localStorage.getItem('guest:active') === '1';
      setIsGuest(!!flag);
    } catch {
      setIsGuest(false);
    }
  }, [pathname]);

  const username: string = isGuest ? 'Gast' : (session?.user?.username || session?.user?.name || session?.user?.email || 'Gast');
  const role: string = isGuest ? 'guest' : (session?.user?.role || 'anon');

  // Links kontextabhängig
  const leftLinks = [
    { href: '/dashboard', label: 'Startseite' },
  { href: '/arena', label: 'Arena' },
    { href: '/lernen', label: 'Kurse' },
    { href: '/ueben', label: 'Übungen' },
  ];
  const teacherExtras = [
    { href: '/teacher', label: 'Klassenverwaltung' },
  { href: '/teacher/kurse', label: 'Kurse erstellen/zuordnen' },
    { href: '/teacher/statistik', label: 'Statistik' },
  ];
  const authorExtras = [ { href: '/autor', label: 'Autor' } ];
  const adminExtras = [ { href: '/admin/users', label: 'Admin' } ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-4 text-sm">
          {[...leftLinks,
            ...(role==='teacher' ? teacherExtras: []),
            ...(role==='author' || role==='admin' ? authorExtras: []),
            ...(role==='admin' ? adminExtras: []),
          ].map(l=> {
            const isRootGroup = l.href === '/teacher';
            const active = (()=>{
              if(!pathname) return false;
              if(isRootGroup){
                // Nur exakt /teacher als aktiv markieren
                return pathname === '/teacher';
              }
              return pathname === l.href || pathname.startsWith(l.href + '/');
            })();
            return (
              <Link key={l.href} href={l.href} className={`px-2 py-1 rounded hover:bg-gray-100 ${active? 'font-semibold text-blue-700':''}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">Eingeloggt als</span>
          <span className="px-2 py-1 bg-gray-100 rounded font-mono">{String(username)}</span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded uppercase text-xs tracking-wide">{String(role)}</span>
          {isGuest && (
            <>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs" title="Gastmodus: Daten werden nur lokal gespeichert">Nur lokal</span>
              <button
                onClick={() => {
                  try { localStorage.removeItem('guest:active'); } catch {}
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('guest');
                    const q = url.searchParams.toString();
                    const newUrl = url.pathname + (q ? `?${q}` : '') + url.hash;
                    window.history.replaceState({}, '', newUrl);
                  } catch {}
                  if (window.location.pathname.startsWith('/guest')) {
                    window.location.href = '/dashboard';
                    return;
                  }
                  setIsGuest(false);
                }}
                className="ml-2 px-2 py-1 border rounded hover:bg-gray-50"
                title="Gastmodus beenden und URL bereinigen"
              >
                Gastmodus beenden
              </button>
            </>
          )}
          {session ? (
            <button onClick={()=>signOut({ callbackUrl: '/login', redirect: true })} className="ml-2 px-2 py-1 border rounded hover:bg-gray-50">Logout</button>
          ) : (
            <Link href="/login" className="ml-2 px-2 py-1 border rounded hover:bg-gray-50">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
}
