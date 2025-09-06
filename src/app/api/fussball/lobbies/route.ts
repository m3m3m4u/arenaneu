import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { createLobby, listOpenLobbies } from '@/lib/fussball/lobbyStore';

export const runtime = 'nodejs';

export async function GET(){
  const lobbies = await listOpenLobbies();
  return NextResponse.json({ success:true, lobbies });
}

export async function POST(req: Request){
  const session: any = await getServerSession(authOptions as any);
  const userId = session?.user?.id || session?.user?._id;
  const username = session?.user?.username || session?.user?.name || 'Spieler';
  if(!userId){ return NextResponse.json({ success:false, error:'UNAUTHENTICATED' }, { status:401 }); }
  const body = await req.json().catch(()=>({}));
  const title = typeof body.title==='string'? body.title.slice(0,60): 'Fußball Match';
  const lessonId = typeof body.lessonId==='string' && body.lessonId ? String(body.lessonId) : '';
  if(!lessonId){ return NextResponse.json({ success:false, error:'LESSON_REQUIRED' }, { status:400 }); }
  const lobby = await createLobby(String(userId), String(username), title, lessonId);
  return NextResponse.json({ success:true, lobby:{ id: lobby.id, title: lobby.title, lessonId: lobby.lessonId, players: lobby.players, status: lobby.status } });
}