import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { exportRequestMetrics } from '@/lib/requestMetrics';
// Zugriff auf Prozess-Infos über globalThis.process (verhindert TS Konflikte beim direkten Import)

export const dynamic = 'force-dynamic'; // keine Cache Probleme

export async function GET() {
  const started = Date.now();
  const hasUri = !!process.env.MONGODB_URI;
  let dbOk = false; let dbErr: string | undefined; let pingMs: number | undefined;
  let readyState: number | undefined; let poolInfo: any = undefined;
  if (hasUri) {
    try {
      const conn = await dbConnect();
      try {
        // optionaler Ping
        // @ts-ignore
        if (conn?.db?.admin) { await conn.db.admin().ping(); }
      } catch {}
      dbOk = true;
      // Zusätzliche Infos
      // @ts-ignore
      readyState = conn?.readyState;
      // Mongoose 6: driver private, heuristisch keine echte Poolgröße; zeigen env Werte
      poolInfo = {
        maxPoolSize: process.env.MONGODB_POOL_SIZE || 'n/a',
        minPoolSize: process.env.MONGODB_MIN_POOL_SIZE || 'n/a'
      };
    } catch (e: any) {
      dbErr = e?.message || String(e);
    } finally {
      pingMs = Date.now() - started;
    }
  }
  // Duplicate Auth Detection
  let duplicateAuth = false;
  try {
    const root = (globalThis as any)?.process?.cwd?.() || '';
    const pagesAuth = path.join(root, 'src', 'pages', 'api', 'auth', '[...nextauth].ts');
    const appAuth = path.join(root, 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts');
    const pagesExists = fs.existsSync(pagesAuth);
    const appExists = fs.existsSync(appAuth);
    duplicateAuth = pagesExists && appExists; // sollte false sein
  } catch {}

  // Metriken einsammeln (falls vorhanden)
  const metrics = (globalThis as any).__DB_METRICS__ || undefined;
  const p: any = (globalThis as any).process;
  const proc = p ? {
    pid: p.pid,
    uptimeSec: typeof p.uptime === 'function' ? p.uptime() : undefined,
    memory: (()=>{ try { const m = p.memoryUsage(); return { rss: m.rss, heapUsed: m.heapUsed }; } catch { return undefined; } })()
  } : undefined;
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
  env: { hasMONGODB_URI: hasUri, nodeEnv: (globalThis as any).process?.env?.NODE_ENV },
    db: { ok: dbOk, error: dbErr, pingMs, readyState, pool: poolInfo, metrics },
    process: proc,
  requests: exportRequestMetrics(),
  warnings: duplicateAuth ? ['duplicate-auth-route'] : []
  }, { status: (dbOk || !hasUri) && !duplicateAuth ? 200 : 500 });
}
