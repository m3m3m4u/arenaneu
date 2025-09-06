import { NextResponse } from 'next/server';
import { getState } from '@/lib/fussball/teamLobbyStore';

export const runtime = 'nodejs';

export async function GET(_:Request, { params }:{ params:{ id:string }} ){
  const res = await getState(params.id);
  if('error' in res) return NextResponse.json({ success:false, error: res.error }, { status:404 });
  return NextResponse.json({ success:true, state: res.state });
}
