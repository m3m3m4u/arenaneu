import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { leaveLobby } from '@/lib/fussball/lobbyStore';

export const runtime = 'nodejs';

export async function POST(_:Request, { params }:{ params:{ id:string }} ){
  const session: any = await getServerSession(authOptions as any);
  const userId = session?.user?.id || session?.user?._id;
  if(!userId) return NextResponse.json({ success:false, error:'UNAUTHENTICATED' }, { status:401 });
  const res = leaveLobby(params.id, String(userId));
  if('error' in res) return NextResponse.json({ success:false, error:res.error }, { status:400 });
  return NextResponse.json({ success:true, lobby: res.lobby, deleted: (res as any).deleted });
}