import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// Debug-Endpunkt: /api/debug/auth
// Aktiv nur wenn ENV ADMIN_DEBUG=1 gesetzt ist.
// Liefert Infos über gefundene Cookies, Token und Session-Rolle.
// Keine sensiblen Secrets.
export async function GET(request: Request) {
  if (process.env.ADMIN_DEBUG !== '1') {
    return NextResponse.json({ success: false, error: 'disabled' }, { status: 404 });
  }
  let token: any = null;
  let session: any = null;
  let tokenError: string | undefined;
  try { token = await getToken({ req: request as any }); } catch (e: any) { tokenError = e?.message || String(e); }
  try { session = await getServerSession(authOptions as any); } catch {/* ignore */}
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieNames = cookieHeader.split(/;\s*/).filter(Boolean).map(c=>c.split('=')[0]);
  return NextResponse.json({
    success: true,
    cookies: cookieNames,
    tokenPresent: !!token,
    tokenRole: token?.role,
    tokenUsername: token?.username,
    tokenError: tokenError || null,
    sessionPresent: !!session,
    sessionRole: session?.user?.role,
    sessionUser: session?.user?.username || session?.user?.name || null,
    note: 'Falls tokenRole leer ist: NEXTAUTH_SECRET oder Cookie Problem / neu einloggen.'
  });
}
