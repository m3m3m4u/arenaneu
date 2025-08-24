import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { recordRequest } from '@/lib/requestMetrics';

// In-Memory Rate Limiter (pro Lambda-Instance / nicht global konsistent)
// Konfiguration per ENV: ADMIN_RATE_LIMIT_POINTS (Standard 60), ADMIN_RATE_LIMIT_WINDOW_MS (Standard 60000)
interface Bucket { tokens: number; updated: number; }
const getStore = () => {
  const g = globalThis as any;
  if (!g.__adminRateLimiter) g.__adminRateLimiter = new Map<string, Bucket>();
  return g.__adminRateLimiter as Map<string, Bucket>;
};
function rateLimit(key: string) {
  const store = getStore();
  const now = Date.now();
  const limit = Number(process.env.ADMIN_RATE_LIMIT_POINTS || '60');
  const windowMs = Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '60000');
  let b = store.get(key);
  if (!b) { b = { tokens: limit, updated: now }; store.set(key, b); }
  // Refill
  const elapsed = now - b.updated;
  if (elapsed > 0) {
    const refill = (elapsed / windowMs) * limit;
    b.tokens = Math.min(limit, b.tokens + refill);
    b.updated = now;
  }
  if (b.tokens < 1) {
    const retry = Math.ceil(windowMs - (now - b.updated));
    return { allowed: false, retryAfter: Math.max(1, Math.floor(retry / 1000)) };
  }
  b.tokens -= 1;
  return { allowed: true };
}

export async function middleware(req: any) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    // Globale API Request Metrik (leichtgewichtig)
    recordRequest(pathname, req.method || 'GET');
    // Last-Online Tracking (throttled) – auf separate Node-Route ausgelagert (kein mongoose im Edge Middleware Bundle)
    try {
      const token = await getToken({ req });
      const username = token && typeof token === 'object' ? (token as any).username : undefined;
      if (username) {
        const g: any = globalThis as any;
        if (!g.__lastOnlineCache) g.__lastOnlineCache = new Map<string, number>();
        const cache: Map<string, number> = g.__lastOnlineCache;
        const now = Date.now();
        const last = cache.get(username) || 0;
        const THROTTLE_MS = 5 * 60 * 1000; // alle 5 Minuten
        if (now - last > THROTTLE_MS) {
          cache.set(username, now);
          // Fire-and-forget Request an interne API (läuft im Node Runtime, kann mongoose nutzen)
          const origin = req.nextUrl.origin;
          const url = `${origin}/api/internal/last-online?u=${encodeURIComponent(username)}`;
          const headerKey = process.env.ADMIN_API_KEY || '';
          // Kein await – Fehler stillschweigend ignorieren
          fetch(url, { headers: { 'x-internal-lastonline': headerKey } }).catch(() => {});
        }
      }
    } catch { /* ignore tracking errors */ }
  }
  // Admin-Auth nicht mehr in Middleware (Edge) – stattdessen nur im Route-Handler (Node) prüfen.
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
