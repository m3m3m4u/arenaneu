import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import fs from 'fs';
import path from 'path';
import process from 'node:process';

export const dynamic = 'force-dynamic'; // keine Cache Probleme

export async function GET() {
  const started = Date.now();
  const hasUri = !!process.env.MONGODB_URI;
  let dbOk = false; let dbErr: string | undefined; let pingMs: number | undefined;
  if (hasUri) {
    try {
      const conn = await dbConnect();
      try {
        // optionaler Ping
        // @ts-ignore
        if (conn?.db?.admin) { await conn.db.admin().ping(); }
      } catch {}
      dbOk = true;
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
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    env: { hasMONGODB_URI: hasUri, nodeEnv: process.env.NODE_ENV },
    db: { ok: dbOk, error: dbErr, pingMs, metrics },
    warnings: duplicateAuth ? ['duplicate-auth-route'] : []
  }, { status: (dbOk || !hasUri) && !duplicateAuth ? 200 : 500 });
}
