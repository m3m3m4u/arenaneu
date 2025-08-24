import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Debug: Session & role prüfen. Geschützt durch ADMIN_API_KEY Header.
// Aufrufen: fetch('/api/debug/session', { headers: { 'x-api-key': ADMIN_API_KEY } })
// Entfernen, sobald Problem gelöst.
export async function GET(request: Request){
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if(adminKey){
    const hdr = request.headers.get('x-api-key')?.trim();
    if(hdr !== adminKey){
      return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
    }
  }
  try {
    const session = await getServerSession(authOptions);
    return NextResponse.json({ success:true, session: session ? {
      user: {
        username: (session as any).user?.username,
        role: (session as any).user?.role,
        name: (session as any).user?.name
      }
    } : null, env: {
      hasDefaultAdmins: !!process.env.DEFAULT_ADMINS,
      defaultAdmins: (process.env.DEFAULT_ADMINS||'').split(',').map(s=>s.split('#')[0].trim()).filter(Boolean),
      nodeEnv: process.env.NODE_ENV,
      hasSecret: !!process.env.NEXTAUTH_SECRET
    }});
  } catch(e:any){
    return NextResponse.json({ success:false, error: String(e?.message||e) }, { status:500 });
  }
}