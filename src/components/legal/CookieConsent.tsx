"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

// Einfache, konfigurierbare Cookie Consent Lösung (funktional, Statistik (optional), Marketing (optional)).
// Speicherung nur nach expliziter Zustimmung (Opt-In) für nicht notwendige Kategorien.

const CONSENT_KEY = "cookieConsent.v1"; // Version bump bei Schemaänderungen
const CONSENT_COOKIE_NAME = "la_consent"; // Cookie Name (kurz halten)

type ConsentState = {
  necessary: true; // immer true (wird nicht abschaltbar angezeigt)
  analytics: boolean;
  marketing: boolean;
  decided: boolean;
  timestamp?: number;
};

const defaultState: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  decided: false,
};

function parseConsentCookie(): Partial<ConsentState> | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split(/; */).find(c => c.startsWith(CONSENT_COOKIE_NAME + '='));
  if (!cookie) return null;
  try {
    const value = decodeURIComponent(cookie.split('=')[1]);
    // Format: v1|analytics=1&marketing=0
    const [, pairs] = value.split('|');
    const map: Record<string,string> = {};
    pairs?.split('&').forEach(p => { const [k,v] = p.split('='); if (k) map[k] = v; });
    return {
      analytics: map.analytics === '1',
      marketing: map.marketing === '1',
      decided: map.decided === '1'
    } as Partial<ConsentState>;
  } catch { return null; }
}

function loadState(): ConsentState {
  if (typeof window === "undefined") return defaultState;
  // 1) localStorage Quelle
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed, necessary: true };
    }
  } catch {}
  // 2) Fallback Cookie
  const fromCookie = parseConsentCookie();
  if (fromCookie) {
    return { ...defaultState, ...fromCookie, necessary: true };
  }
  return defaultState;
}

function writeConsentCookie(state: ConsentState) {
  // 180 Tage
  const maxAge = 60 * 60 * 24 * 180;
  const payload = `v1|analytics=${state.analytics ? '1':'0'}&marketing=${state.marketing ? '1':'0'}&decided=${state.decided ? '1':'0'}`;
  try {
    const secure = (typeof window !== 'undefined' && window.location.protocol === 'https:') || process.env.NODE_ENV === 'production';
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(payload)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
  } catch {}
}

function saveState(state: ConsentState) {
  try {
    const serializable = { ...state, necessary: true, timestamp: Date.now() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(serializable));
  } catch {}
  writeConsentCookie(state);
}

// Dummy Hooks für Scripts (hier nur Platzhalter; echte Integrationen würden z.B. gtag nachladen)
function useApplyConsent(consent: ConsentState) {
  const analyticsLoadedRef = useRef(false);
  useEffect(() => {
    if (!consent.decided) return;
    // Analytics Script dynamisch nachladen (generisch über ENV var)
    if (consent.analytics && !analyticsLoadedRef.current) {
      const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC; // z.B. https://plausible.io/js/script.js
      if (src) {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset['consent'] = 'analytics';
        document.head.appendChild(s);
        analyticsLoadedRef.current = true;
      }
    }
    if (consent.marketing) {
      // Hier könnten Marketing Tags analog geladen werden.
    }
  }, [consent]);
}

export default function CookieConsent() {
  const [state, setState] = useState<ConsentState>(defaultState);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInteractiveRef = useRef<HTMLButtonElement | null>(null);

  // Fokusfalle: Zyklisch innerhalb des Dialogs halten
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      // ESC nicht erlauben solange keine Entscheidung
      if (!state.decided) {
        e.preventDefault();
      }
    }
    if (e.key === "Tab" && dialogRef.current) {
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const list = Array.from(focusables).filter(el => !el.hasAttribute('disabled'));
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [open, state.decided]);

  useEffect(() => {
    const s = loadState();
    setState(s);
    if (!s.decided) {
      setOpen(true);
    }
  const handler = () => setOpen(true);
  window.addEventListener('open-cookie-consent', handler as any);
  return () => window.removeEventListener('open-cookie-consent', handler as any);
  }, []);

  // Scroll-Lock wenn offen
  useEffect(() => {
    if (open) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return () => { document.documentElement.style.overflow = prev; };
    }
  }, [open]);

  // Keydown Listener für Fokusfalle / ESC
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Initialen Fokus setzen
  useEffect(() => {
    if (open && dialogRef.current) {
      // Versuche ersten Button zu fokussieren
      const btn = firstInteractiveRef.current || dialogRef.current.querySelector('button');
      btn?.focus();
    }
  }, [open]);

  useApplyConsent(state);

  function acceptAll() {
    const next: ConsentState = { ...state, analytics: true, marketing: true, decided: true };
    setState(next);
    saveState(next);
    setOpen(false);
  }
  function rejectAll() {
    const next: ConsentState = { ...state, analytics: false, marketing: false, decided: true };
    setState(next);
    saveState(next);
    setOpen(false);
  }
  function savePartial() {
    const next: ConsentState = { ...state, decided: true };
    setState(next);
    saveState(next);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4" aria-modal="true" role="dialog" aria-labelledby="cookie-dialog-title">
      <div ref={dialogRef} className="w-full max-w-lg bg-white rounded-lg shadow-lg border border-gray-200 animate-fadeIn flex flex-col max-h-full outline-none" tabIndex={-1}>
        <div className="p-5 overflow-auto">
          <h2 id="cookie-dialog-title" className="text-lg font-semibold mb-2">Cookie Einstellungen</h2>
          <p className="text-sm text-gray-700 mb-4">
            Wir verwenden notwendige Cookies für den Betrieb der Seite. Optional kannst du der
            Nutzung für Statistik (anonymisierte Auswertung) und Marketing zustimmen. Du kannst
            deine Auswahl jederzeit ändern.
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked disabled className="mt-1" />
              <div>
                <p className="font-medium text-sm">Notwendig</p>
                <p className="text-xs text-gray-600">Erforderlich für Login, Session und Sicherheit.</p>
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.analytics}
                onChange={(e) => setState(s => ({ ...s, analytics: e.target.checked }))}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">Statistik</p>
                <p className="text-xs text-gray-600">Hilft uns, die Plattform zu verbessern (anonymisiert).</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.marketing}
                onChange={(e) => setState(s => ({ ...s, marketing: e.target.checked }))}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">Marketing</p>
                <p className="text-xs text-gray-600">Optionale Inhalte / Einbettungen von Drittanbietern.</p>
              </div>
            </label>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <button ref={firstInteractiveRef} onClick={acceptAll} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded">
              Alle akzeptieren
            </button>
            <button onClick={rejectAll} className="flex-1 bg-gray-200 hover:bg-gray-300 text-sm font-medium px-4 py-2 rounded">
              Nur notwendig
            </button>
            <button onClick={savePartial} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded">
              Auswahl speichern
            </button>
          </div>
          <div className="mt-4 text-[11px] leading-snug text-gray-500 space-y-1">
            <p>
              Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) für optionale Kategorien; notwendige Cookies auf Basis
              berechtigter Interessen / Vertragserfüllung (Art. 6 Abs. 1 lit. b,f DSGVO).
            </p>
            <p>
              Detail-Infos findest du in <a href="/datenschutz" className="underline">Datenschutz</a> und <a href="/impressum" className="underline">Impressum</a>.
            </p>
          </div>
        </div>
        {state.decided && (
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
            aria-label="Schließen"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
