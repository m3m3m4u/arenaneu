export const runtime = 'nodejs';

import dbConnect, { getDbMetrics } from '@/lib/db';

export async function GET(){
  const report: any = { ok: false, ts: Date.now() };
  try{
    await dbConnect();
    report.ok = true;
  } catch(e){
    report.error = String((e as any)?.message||e);
  }
  try{ report.metrics = getDbMetrics(); } catch{}
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
