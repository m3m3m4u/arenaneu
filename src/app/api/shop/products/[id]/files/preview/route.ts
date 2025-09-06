import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

// Diese Route wurde deaktiviert. Automatische Vorschau-Erzeugung ist entfernt.
export async function POST(){
  return NextResponse.json({ success:false, error:'Preview-Erzeugung deaktiviert' }, { status:410 });
}
