import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Nur Status anzeigen
export async function GET(request: Request){
  if(!(await isAdminRequest(request))) return new NextResponse('Forbidden', { status: 403 });
  const ok = rateLimit(request, 'kill-connections-get'); if(!ok) return new NextResponse('Rate limit', { status:429 });
  try{ await dbConnect().catch(()=>undefined); } catch{}
  const states = mongoose.connections.map((c,i)=>({ idx:i, readyState:c.readyState }));
  return NextResponse.json({ success:true, count: states.length, states });
}

// POST: Verbindungen schließen
export async function POST(request: Request){
  if(!(await isAdminRequest(request))) return new NextResponse('Forbidden', { status: 403 });
  const ok = rateLimit(request, 'kill-connections-post'); if(!ok) return new NextResponse('Rate limit', { status:429 });
  const url = new URL(request.url);
  const confirm = url.searchParams.get('confirm');
  if(confirm !== '1'){
    return NextResponse.json({ success:false, error:'Bestätige mit ?confirm=1', hint:'POST /api/admin/db/kill-connections?confirm=1' }, { status:400 });
  }
  // Ersten Status erfassen
  const before = mongoose.connections.map(c=>c.readyState);
  let killSessionsResult: any = null;
  // Alle Connections schließen (außer evtl. index 0 später neu aufgebaut)
  for(const c of mongoose.connections){
    try { if(c && c.readyState !== 0){ await c.close(false); } } catch {}
  }
  // Globale Cache zurücksetzen damit nächste Anfrage sauber neu verbindet
  try { if((global as any).mongoose){ (global as any).mongoose.conn = null; (global as any).mongoose.promise = null; } } catch{}
  // Optional killAllSessionsByPattern falls Credentials vorhanden
  try {
    const user = process.env.MONGODB_USERNAME; // nur falls gesetzt
    if(user){
      const authDb = process.env.MONGODB_AUTHDB || 'admin';
      // Temporäre Einzelverbindung für den Admin-Befehl (falls nicht geschlossen)
      const uri = process.env.MONGODB_URI;
      if(uri){
        // lightweight direct connect separate from mongoose caching to run command
        // Nutzen des bestehenden Treibers über mongoose.connection falls verfügbar
        await dbConnect().catch(()=>undefined);
        const admin = mongoose.connection?.db?.admin?.();
        if(admin){
          killSessionsResult = await admin.command({ killAllSessionsByPattern: [ { user, db: authDb } ] }).catch((e:any)=>({ error:String(e?.message||e) }));
        }
      }
    }
  } catch(e:any){ killSessionsResult = { error: String(e?.message||e) }; }
  const after = mongoose.connections.map(c=>c.readyState);
  return NextResponse.json({ success:true, before, after, killSessionsResult });
}
