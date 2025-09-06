import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { applyAnswer, getLobby } from '@/lib/fussball/lobbyStore';

export const runtime = 'nodejs';

export async function POST(req:Request, { params }:{ params:{ id:string }} ){
  const session: any = await getServerSession(authOptions as any);
  const userId = session?.user?.id || session?.user?._id;
  if(!userId) return NextResponse.json({ success:false, error:'UNAUTHENTICATED' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const { correct } = body as { correct?: boolean };
  if(typeof correct !== 'boolean') return NextResponse.json({ success:false, error:'BAD_REQUEST' }, { status:400 });
  // Validierung: Nutzer muss in Lobby sein
  const lobby = await getLobby(params.id);
  if(!lobby) return NextResponse.json({ success:false, error:'NOT_FOUND' }, { status:404 });
  const inLobby = (lobby.players||[]).some((p:any)=> p.userId===String(userId));
  if(!inLobby) return NextResponse.json({ success:false, error:'NOT_IN_LOBBY' }, { status:403 });
  const res = await applyAnswer(params.id, correct, 'left');
  if('error' in res) return NextResponse.json({ success:false, error: res.error }, { status:400 });
  return NextResponse.json({ success:true, state: res.state });
}
