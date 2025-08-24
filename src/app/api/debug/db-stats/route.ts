import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(){
  const info: any = { hasUri: !!process.env.MONGODB_URI };
  try {
    const conn = await dbConnect();
    info.readyState = conn.readyState; // 1 = connected
    // Treiber interne Pool Stats sind nicht öffentlich; wir approximieren:
    // @ts-ignore
    const client: any = conn.getClient?.();
    const topology = client?.topology;
    if (topology && typeof topology.s?.sessionPool === 'object') {
      info.sessions = {
        // heuristisch (interne Struktur kann sich ändern)
        poolSize: topology.s?.sessionPool?.sessions?.size,
      };
    }
  } catch(e:any){
    info.error = e?.message || String(e);
  }
  return NextResponse.json({ success:true, db: info });
}