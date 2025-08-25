"use client";
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export default function GlobalFooter(){
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [unread,setUnread]= useState<number>(0);
  const canUseMessages = !!role && role !== 'guest';
  useEffect(()=>{
    let timer: any;
    async function load(){
      if(!canUseMessages) return;
      try {
        const res = await fetch('/api/messages/unread');
        const d = await res.json();
        if(res.ok && d.success) setUnread(d.count||0); else setUnread(0);
      } catch { /* ignore */ }
    }
    if(canUseMessages){
      void load();
      timer = setInterval(load, 120000);
    }
    return ()=>{ if(timer) clearInterval(timer); };
  },[canUseMessages]);
  const [showSupport,setShowSupport]=useState(false);
  const [supportBody,setSupportBody]=useState('');
  const [supportBusy,setSupportBusy]=useState(false);
  const [supportDone,setSupportDone]=useState(false);
  async function submitSupport(e:React.FormEvent){
    e.preventDefault(); if(!supportBody.trim()) return;
    setSupportBusy(true); setSupportDone(false);
    try {
      // Admin-Empfänger ermitteln (einfach: API fragt Admin später ab) -> wir senden an uns selbst falls Admin (fällt sonst raus)
      // Vereinfachung: Betreff fix "Support" und Body mit Text + optional Rolle/User
      const subject='Support';
      const body = `[role=${role||'unknown'}] ${supportBody}`;
      const res = await fetch('/api/messages',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subject, body })});
      if(res.ok){ setSupportDone(true); setSupportBody(''); }
    } finally { setSupportBusy(false); }
  }
  return (
    <footer className="mt-16 border-t bg-gray-50 text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <Link href="/impressum" className="hover:text-gray-900">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-gray-900">Datenschutz</Link>
          <Link href="/about" className="hover:text-gray-900">Über LernArena</Link>
          {canUseMessages && <Link href="/messages" className="relative hover:text-gray-900 inline-flex items-center gap-1">
            <span>Nachrichten</span>
            <span className={`inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${unread>0? 'bg-red-600 text-white':'bg-gray-300 text-gray-700'}`}>{unread>99? '99+': unread}</span>
          </Link>}
          <button type="button" onClick={()=>setShowSupport(s=>!s)} className="hover:text-gray-900">Support</button>
          {role==='admin' && <Link href="/admin/db" className="hover:text-gray-900">DB Monitor</Link>}
          <button
            type="button"
            onClick={() => {
              try { window.dispatchEvent(new Event('open-cookie-consent')); } catch {}
            }}
            className="hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
            aria-label="Cookie-Einstellungen öffnen"
          >Cookies</button>
        </nav>
        <span className="text-[10px] text-gray-400">© {new Date().getFullYear()} LernArena.org</span>
      </div>
      {showSupport && (
        <div className="border-t bg-white/70 backdrop-blur px-4 py-4">
          <form onSubmit={submitSupport} className="max-w-3xl mx-auto flex flex-col gap-2">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Problem melden</label>
            <textarea value={supportBody} onChange={e=>setSupportBody(e.target.value)} placeholder="Was ist passiert?" rows={3} className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="flex items-center gap-3">
              <button disabled={supportBusy || !supportBody.trim()} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">{supportBusy? 'Sende…':'Absenden'}</button>
              {supportDone && <span className="text-xs text-green-600">Gesendet</span>}
              <button type="button" onClick={()=>setShowSupport(false)} className="text-xs text-gray-500 hover:underline">Schließen</button>
            </div>
            <p className="text-[10px] text-gray-400">Es wird eine interne Nachricht mit dem Betreff "Support" erzeugt.</p>
          </form>
        </div>
      )}
    </footer>
  );
}