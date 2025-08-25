import { NextResponse } from 'next/server';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request){
  if(!(await isAdminRequest(request))) return new NextResponse('Forbidden', { status:403 });
  if(!rateLimit(request,'db-watchdog')) return new NextResponse('Too Many', { status:429 });
  const params = new URL(request.url).searchParams;
  const heal = params.get('heal') === '1';
  await dbConnect().catch(()=>undefined);
  const active = mongoose.connections.filter(c=>c && c.readyState === 1).length;
  const all = mongoose.connections.length;
  const threshold = parseInt(process.env.DB_CONN_WARN_THRESHOLD || '5', 10);
  const hard = parseInt(process.env.DB_CONN_HARD_LIMIT || '15', 10);
  let action: string | undefined;
  if(heal && active > threshold){
    // Soft-Heal: schließe zusätzliche Conns
    for(let i=1;i<mongoose.connections.length;i++){
      const c = mongoose.connections[i];
      if(c.readyState === 1){
        try{ await c.close(); }catch{}
      }
    }
    action = 'healed';
  }
  const g: any = global as any;
  const metrics = g.__DB_METRICS__ || {};
  return NextResponse.json({ success:true, active, all, threshold, hard, action, metrics });
}
