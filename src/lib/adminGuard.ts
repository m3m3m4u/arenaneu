import { getToken } from 'next-auth/jwt';

type RateBucket = {
  tokens: number;
  lastRefill: number; // epoch ms
};

declare global {
  // eslint-disable-next-line no-var
  var __rateLimits: Map<string, RateBucket> | undefined;
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return '127.0.0.1';
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  // API Key erlaubt Server-zu-Server ohne Session
  const apiKey = process.env.ADMIN_API_KEY?.trim();
  if (apiKey) {
    const headerKey = request.headers.get('x-api-key')?.trim();
    if (headerKey && headerKey === apiKey) return true;
  }
  // Direkt JWT token auswerten
  try {
    const token = await getToken({ req: request as any });
    if (!token || typeof token !== 'object') return false;
    const role = (token as any).role as string | undefined;
    if (role === 'admin') return true;
    const uname = String((token as any).username || '').toLowerCase();
    if (uname) {
      const list = (process.env.ADMIN_USERNAMES || '')
        .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      if (list.includes(uname)) return true;
    }
    return false;
  } catch { return false; }
}

export function rateLimit(request: Request, key: string): boolean {
  const points = Math.max(1, parseInt(process.env.ADMIN_RATE_LIMIT_POINTS || '60', 10));
  const windowMs = Math.max(1000, parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '60000', 10));
  const ip = getClientIp(request);
  const map = (global.__rateLimits ||= new Map<string, RateBucket>());
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const refillRate = points / windowMs; // tokens per ms
  const b = map.get(bucketKey) || { tokens: points, lastRefill: now };
  // refill
  const elapsed = now - b.lastRefill;
  if (elapsed > 0) {
    b.tokens = Math.min(points, b.tokens + elapsed * refillRate);
    b.lastRefill = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    map.set(bucketKey, b);
    return true;
  }
  map.set(bucketKey, b);
  return false;
}
