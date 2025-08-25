import { NextResponse } from 'next/server';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';
import dbConnect from '@/lib/db';
import DbConnEvent from '@/models/DbConnEvent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request){
  if(!(await isAdminRequest(request))) return new NextResponse('Forbidden', { status:403 });
  if(!rateLimit(request,'db-events')) return new NextResponse('Too Many', { status:429 });
  await dbConnect();
  const url = new URL(request.url);
  const hours = Math.min(48, Math.max(1, parseInt(url.searchParams.get('hours')||'24',10)));
  const since = new Date(Date.now() - hours*60*60*1000);
  const events = await DbConnEvent.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(1000).lean();
  return NextResponse.json({ success:true, hours, count: events.length, events });
}
