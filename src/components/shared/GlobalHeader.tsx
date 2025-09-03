"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import { MobileDrawer } from './MobileDrawer';

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
    { href: '/arena', label: 'Arena' },
    { href: '/lernen', label: 'Kurse' },
    { href: '/ueben', label: 'Übungen' },
  ];
  const teacherExtras = [
    { href: '/teacher', label: 'Klassenverwaltung' },
  { href: '/teacher/kurse', label: 'Kurse erstellen/zuordnen' },
    { href: '/teacher/statistik', label: 'Statistik' },
  { href: '/teacher/shop', label: 'Material-Shop' },
  ];
  const authorExtras = [ { href: '/autor', label: 'Autor' } ];
  const adminExtras = [ { href: '/admin/users', label: 'Admin' } ];

  const primaryLinks = [...leftLinks];
  const teacherLinks = role==='teacher' ? teacherExtras : undefined;
  const authorLinks = (role==='author' || role==='admin') ? authorExtras : undefined;
  const adminLinks = role==='admin' ? adminExtras : undefined;
  const miscLinks = [
    { href: '/impressum', label: 'Impressum' },
    { href: '/datenschutz', label: 'Datenschutz' },
    { href: '/about', label: 'Über' },
    ...(role!=='guest'? [{ href: '/messages', label: 'Nachrichten' }]: [])
  ];

  const [mobileOpen,setMobileOpen]=useState(false);
  const [showFab,setShowFab]=useState(false);
  // Scroll-gestütztes Ein-/Ausblenden des Floating-Menü-Buttons (nur Mobile)
  useEffect(()=>{
    const onScroll=()=>{
      if(window.innerWidth >= 768){ if(showFab) setShowFab(false); return; }
      const y = window.scrollY;
      setShowFab(y > 280); // erst nach etwas Scroll
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
    const onResize=()=>{ if(window.innerWidth >= 768 && showFab) setShowFab(false); };
    window.addEventListener('resize', onResize);
    return ()=>{ window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  },[showFab]);
  const endGuest = ()=>{
    try { localStorage.removeItem('guest:active'); } catch {}
    setIsGuest(false);
  };

  return (
  <header className={`fixed top-0 left-0 right-0 z-40 border-b shadow-sm transition-colors ${mobileOpen ? 'bg-white' : 'bg-white/90 backdrop-blur'}`}> 
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-panel"
            className="md:hidden p-2 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors"
            onClick={()=>setMobileOpen(o=>!o)}
          >
            {!mobileOpen && (
              <span className="block w-5 h-5 relative" aria-hidden="true">
                <span className="absolute inset-x-0 top-1 h-0.5 bg-current rounded transition-all" />
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-current rounded transition-all" />
                <span className="absolute inset-x-0 bottom-1 h-0.5 bg-current rounded transition-all" />
              </span>
            )}
            {mobileOpen && (
              <span className="block w-5 h-5 relative" aria-hidden="true">
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-current rounded rotate-45" />
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-current rounded -rotate-45" />
              </span>
            )}
          </button>
          <Link href="/" className="font-semibold text-sm sm:text-base select-none hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">LernArena</Link>
          <nav className="hidden md:flex items-center gap-3 sm:gap-4 text-[13px] sm:text-sm">
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
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-sm flex-shrink-0">
          <span className="hidden md:inline text-gray-600">Eingeloggt als</span>
          <span className="px-1.5 py-0.5 bg-gray-100 rounded font-mono max-w-[120px] truncate" title={String(username)}>{String(username)}</span>
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded uppercase text-[10px] sm:text-xs tracking-wide">{String(role)}</span>
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
                className="ml-1 sm:ml-2 px-2 py-1 border rounded hover:bg-gray-50 text-[11px] sm:text-xs"
                title="Gastmodus beenden und URL bereinigen"
              >
                Gastmodus beenden
              </button>
            </>
          )}
          {session ? (
            <button onClick={()=>signOut({ callbackUrl: '/login', redirect: true })} className="ml-1 sm:ml-2 px-2 py-1 border rounded hover:bg-gray-50 text-[11px] sm:text-xs">Logout</button>
          ) : (
            <Link href="/login" className="ml-1 sm:ml-2 px-2 py-1 border rounded hover:bg-gray-50 text-[11px] sm:text-xs">Login</Link>
          )}
        </div>
        <MobileDrawer
          open={mobileOpen}
          onClose={()=>setMobileOpen(false)}
          primary={primaryLinks}
          teacher={teacherLinks}
            author={authorLinks}
            admin={adminLinks}
            misc={miscLinks}
            username={username}
            role={role}
            isGuest={isGuest}
            onLogout={session? ()=> signOut({ callbackUrl: '/login', redirect: true }) : undefined}
            onEndGuest={endGuest}
        />
        {/* Floating Hamburger Button (nur Mobile, weiter unten auf der Seite) */}
        {showFab && !mobileOpen && (
          <button
            type="button"
            aria-label="Menü öffnen"
            onClick={()=>setMobileOpen(true)}
            className="md:hidden fixed bottom-5 right-5 z-40 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg rounded-full w-12 h-12 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            <span className="sr-only">Menü öffnen</span>
            <svg width="26" height="26" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        )}
      </div>
    </header>
  );
}
