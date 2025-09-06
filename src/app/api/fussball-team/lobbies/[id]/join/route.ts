import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { joinLobby, getLobby } from '@/lib/fussball/teamLobbyStore';

export const runtime = 'nodejs';

export async function POST(_:Request, { params }:{ params:{ id:string }} ){
  const session: any = await getServerSession(authOptions as any);
  const userId = session?.user?.id || session?.user?._id;
  const username = session?.user?.username || session?.user?.name || 'Spieler';
  if(!userId) return NextResponse.json({ success:false, error:'UNAUTHENTICATED' }, { status:401 });
  const { id } = params;
  const res = await joinLobby(id, String(userId), String(username));
  if('error' in res) return NextResponse.json({ success:false, error:res.error }, { status:400 });
  return NextResponse.json({ success:true, lobby: { ...res.lobby, lessonId: (res.lobby as any).lessonId } });
}

export async function GET(_:Request, { params }:{ params:{ id:string }} ){
  const lobby = await getLobby(params.id);
  if(!lobby) return NextResponse.json({ success:false, error:'NOT_FOUND' }, { status:404 });
  return NextResponse.json({ success:true, lobby });
}
