"use client";
import React from 'react';
import { usePathname } from 'next/navigation';

const links: Array<{ href:string; label:string }> = [
  { href:'/admin/users', label:'Nutzer' },
  { href:'/admin/db', label:'DB Monitoring' },
];

export default function AdminNav(){
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 mb-4">
      {links.map(l=>{ const active = pathname?.startsWith(l.href); return <a key={l.href} href={l.href} className={`text-xs px-3 py-1.5 rounded border transition-colors ${active? 'bg-blue-600 border-blue-600 text-white':'bg-white border-gray-300 hover:bg-gray-50'}`}>{l.label}</a>; })}
    </nav>
  );
}
