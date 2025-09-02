"use client";
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

export interface DrawerLink { href: string; label: string; }

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  primary: DrawerLink[];
  teacher?: DrawerLink[];
  author?: DrawerLink[];
  admin?: DrawerLink[];
  misc?: DrawerLink[];
  username: string;
  role: string;
  isGuest: boolean;
  onLogout?: () => void;
  onEndGuest?: () => void;
}

export function MobileDrawer({ open, onClose, primary, teacher, author, admin, misc, username, role, isGuest, onLogout, onEndGuest }: MobileDrawerProps){
  const dialogRef = useRef<HTMLDivElement|null>(null);
  // Focus trap + ESC
  useEffect(()=>{
    if(!open) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, a');
    firstFocusable?.focus();
    const handleKey = (e:KeyboardEvent)=>{
      if(e.key==='Escape'){ onClose(); }
      if(e.key==='Tab'){
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('a,button');
        if(!focusables || focusables.length===0) return;
        const list = Array.from(focusables).filter(el=>!el.hasAttribute('disabled'));
        const idx = list.indexOf(document.activeElement as HTMLElement);
        if(e.shiftKey){
          if(idx<=0){ e.preventDefault(); list[list.length-1].focus(); }
        } else {
          if(idx===list.length-1){ e.preventDefault(); list[0].focus(); }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return ()=>{ document.documentElement.style.overflow = prevOverflow; document.removeEventListener('keydown', handleKey); };
  },[open,onClose]);

  if(!open) return null;
  const Section = ({ title, links }: { title: string; links?: DrawerLink[] }) => {
    if(!links || !links.length) return null;
    return (
      <div>
        <h3 className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase mb-2">{title}</h3>
        <ul className="space-y-1 mb-4">
          {links.map(l=> (
            <li key={l.href}>
              <Link href={l.href} className="block px-3 py-2 rounded bg-white/60 hover:bg-white text-sm font-medium" onClick={onClose}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog" aria-labelledby="mobile-drawer-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 animate-fade-in" onClick={onClose} />
      <div ref={dialogRef} className="absolute top-0 left-0 h-full w-[84%] max-w-[340px] bg-gradient-to-b from-white to-gray-50 shadow-xl border-r flex flex-col overflow-y-auto p-5 animate-slide-in outline-none" data-test-id="mobile-drawer">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col leading-tight">
            <span id="mobile-drawer-title" className="text-sm font-semibold truncate max-w-[180px]" title={username}>{username}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded uppercase tracking-wide w-fit">{role}</span>
          </div>
          <button onClick={onClose} aria-label="Menü schließen" className="p-2 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <nav className="flex-1">
          <Section title="Navigation" links={primary} />
          {teacher && <Section title="Lehrer" links={teacher} />}
          {author && <Section title="Autor" links={author} />}
          {admin && <Section title="Admin" links={admin} />}
          {misc && <Section title="Mehr" links={misc} />}
        </nav>
        <div className="mt-auto pt-4 border-t space-y-2">
          {isGuest && (
            <button onClick={onEndGuest} className="w-full text-left px-3 py-2 rounded bg-yellow-100 hover:bg-yellow-200 text-xs font-medium">Gastmodus beenden</button>
          )}
          {onLogout && (
            <button onClick={onLogout} className="w-full text-left px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 text-xs font-medium">Logout</button>
          )}
          {!onLogout && (
            <Link href="/login" onClick={onClose} className="block px-3 py-2 rounded bg-blue-600 text-white text-xs font-medium text-center hover:bg-blue-700">Login</Link>
          )}
          <p className="text-[10px] text-gray-400 text-center mt-2">© {new Date().getFullYear()} LernArena</p>
        </div>
      </div>
      <style jsx global>{`
        @keyframes slide-in { from { transform: translateX(-100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
        @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
        .animate-slide-in { animation: slide-in .25s ease-out; }
        .animate-fade-in { animation: fade-in .25s ease-out forwards; }
      `}</style>
    </div>
  );
}
