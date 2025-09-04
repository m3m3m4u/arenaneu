import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { updateReady } from '@/lib/fussball/lobbyStore';

export const runtime = 'nodejs';

export async function POST(req:Request, { params }:{ params:{ id:string }} ){
  const session: any = await getServerSession(authOptions as any);
  const userId = session?.user?.id || session?.user?._id;
  if(!userId) return NextResponse.json({ success:false, error:'UNAUTHENTICATED' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const ready = !!body.ready;
  const res = updateReady(params.id, String(userId), ready);
  if('error' in res) return NextResponse.json({ success:false, error:res.error }, { status:400 });
  return NextResponse.json({ success:true, lobby: { ...res.lobby, lessonId: (res.lobby as any).lessonId } });
}