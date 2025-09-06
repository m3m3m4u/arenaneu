import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

// Deaktiviert: automatische/halb-automatische Thumbnail-Speicherung wurde entfernt.
export async function POST(){
  return NextResponse.json({ success:false, error:'Produkt-Thumbnail Generierung deaktiviert' }, { status:410 });
}
