import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET(){
  const info: any = { hasUri: !!process.env.MONGODB_URI };
  try {
    const conn = await dbConnect();
    info.readyState = conn.readyState; // 1 = connected
    info.connectionCount = mongoose.connections.length;
    info.activeConnections = mongoose.connections.map((c,i)=>({ idx:i, rs:c.readyState }));
    // @ts-ignore interne API
    const client: any = conn.getClient?.();
    const topology = client?.topology;
    if (topology) {
      // Sessions (nicht identisch mit physischer Socket-Anzahl)
      const sessPool: any = topology.s?.sessionPool;
      if (sessPool) {
        info.sessions = { size: sessPool.sessions?.size, borrowed: sessPool.sessionPool?.length };
      }
      // Server / Pool Info (MongoDB Node Treiber intern, kann sich ändern)
      const servers: any = topology.s?.description?.servers;
      if (servers) {
        const arr: any[] = [];
        for (const [addr, desc] of servers) {
          const pool: any = desc?.pool;
          arr.push({ address: addr, maxPool: pool?.options?.maxPoolSize, generation: pool?.generation, backlog: pool?.queue?.length });
        }
        info.serverPools = arr;
      }
    }
    // Globale Metriken aus db.ts falls vorhanden
    const g: any = global as any;
    if (g.__DB_METRICS__) info.metrics = g.__DB_METRICS__;
  } catch(e:any){ info.error = e?.message || String(e); }
  return NextResponse.json({ success:true, db: info });
}