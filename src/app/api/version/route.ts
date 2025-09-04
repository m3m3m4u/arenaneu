import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(){
  // Liefert Build/Deployment Infos zum Debuggen ob aktueller Commit auf Vercel läuft
  return NextResponse.json({
    ok: true,
    vercel: process.env.VERCEL === '1',
    env: process.env.VERCEL_ENV || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    repo: process.env.VERCEL_GIT_REPO_SLUG || null,
    buildTime: process.env.BUILD_TIME || null,
    now: new Date().toISOString()
  });
}
