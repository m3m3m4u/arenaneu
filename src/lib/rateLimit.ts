// Simple in-memory rate limiter (per process). For multi-instance deploy, replace with Redis.
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

interface Options { capacity: number; refillPerSec: number; }

export function rateLimit(key: string, { capacity, refillPerSec }: Options): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if(!b){ b = { tokens: capacity, updated: now }; buckets.set(key,b); }
  const delta = (now - b.updated)/1000;
  if(delta>0){
    b.tokens = Math.min(capacity, b.tokens + delta*refillPerSec);
    b.updated = now;
  }
  if(b.tokens >= 1){ b.tokens -= 1; return true; }
  return false;
}

export function rateRemaining(key: string){ const b = buckets.get(key); return b? b.tokens : 0; }
