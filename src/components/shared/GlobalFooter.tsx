"use client";
import Link from 'next/link';
import React from 'react';

export default function GlobalFooter(){
  return (
    <footer className="mt-16 border-t bg-gray-50 text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <Link href="/impressum" className="hover:text-gray-900">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-gray-900">Datenschutz</Link>
          <Link href="/about" className="hover:text-gray-900">Über LernArena</Link>
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
    </footer>
  );
}