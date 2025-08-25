"use client";
import React from 'react';
import { usePathname } from 'next/navigation';

const links: Array<{ href:string; label:string }> = [
  { href:'/admin', label:'Übersicht' },
  { href:'/admin/users', label:'Nutzer' },
  { href:'/admin/db', label:'DB Monitoring' },
  { href:'/messages', label:'Nachrichten' },
];

export default function AdminNav(){
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 mb-4 items-center">
      {links.map(l=>{ 
        const active = l.href === '/admin' 
          ? (pathname === '/admin' || pathname === '/admin/') 
          : pathname?.startsWith(l.href);
        return <a key={l.href} href={l.href} className={`text-xs px-3 py-1.5 rounded border transition-colors ${active? 'bg-blue-600 border-blue-600 text-white':'bg-white border-gray-300 hover:bg-gray-50'}`}>{l.label}</a>; 
      })}
      <MessagesBadge />
    </nav>
  );
}

function MessagesBadge(){
  const [count,setCount]=React.useState(0);
  React.useEffect(()=>{ let t:any; async function load(){ try{ const r=await fetch('/api/messages/unread'); const d=await r.json(); if(r.ok&&d.success) setCount(d.count||0); } catch{} }
    load(); t=setInterval(load, 120000); return ()=>{ if(t) clearInterval(t); };
  },[]);
  return <a href="/messages" className="text-[10px] px-2 py-1 rounded border bg-white hover:bg-gray-50 flex items-center gap-1">
    <span>Ungelesen</span>
    <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full font-semibold ${count>0? 'bg-red-600 text-white':'bg-gray-300 text-gray-700'}`}>{count>99?'99+':count}</span>
  </a>;
}
