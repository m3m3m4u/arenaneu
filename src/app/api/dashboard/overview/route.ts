import dbConnect from '@/lib/db';
import User from '@/models/User';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { NextResponse } from 'next/server';

// Einfacher In-Memory Cache: username => { expires, etag, payload }
type OverviewCacheEntry = { expires: number; etag: string; body: any };
const g: any = global;
if(!g.__DASH_OVERVIEW_CACHE__) g.__DASH_OVERVIEW_CACHE__ = new Map<string, OverviewCacheEntry>();
const OVERVIEW_CACHE: Map<string, OverviewCacheEntry> = g.__DASH_OVERVIEW_CACHE__;

// Liefert kombinierte Dashboard-Daten in einem Request
// { user, unreadCount }
export async function GET(request: any){
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if(!session?.user?.username){
      return NextResponse.json({ success:false, error:'Nicht authentifiziert' }, { status:401 });
    }
    const username = (session.user as any).username;
    const cacheTtl = parseInt(process.env.DASHBOARD_OVERVIEW_CACHE_MS || '15000',10);
    const allowCache = cacheTtl > 0 && !request.nextUrl?.searchParams?.get('nocache');
    if (allowCache){
      const hit = OVERVIEW_CACHE.get(username);
      if (hit && hit.expires > Date.now()) {
        const inm = request.headers.get('if-none-match');
        if (inm && inm === hit.etag) {
          return new Response(null, { status: 304, headers: { 'ETag': hit.etag, 'Cache-Control': 'private, max-age=15' } });
        }
        return NextResponse.json(hit.body, { headers: { 'ETag': hit.etag, 'Cache-Control': 'private, max-age=15' } });
      }
    }
    const userDoc = await User.findOne({ username }).lean();
    if(!userDoc){
      return NextResponse.json({ success:false, error:'User nicht gefunden' }, { status:404 });
    }
    // Ungelesene Nachrichten (nur falls Rolle relevant)
    let unreadCount = 0;
    const role = (session.user as any).role;
    if (role === 'teacher' || role === 'learner') {
      unreadCount = await Message.countDocuments({ receiver: username, read: { $ne: true } });
    }
    const updatedAt = (userDoc as any).updatedAt ? new Date((userDoc as any).updatedAt).getTime() : Date.now();
    const etag = 'W/"ov:'+username+':'+updatedAt+':'+unreadCount+'"';
    const payload = { success:true, user: userDoc, unreadCount };
    if (allowCache){
      OVERVIEW_CACHE.set(username, { expires: Date.now()+cacheTtl, etag, body: payload });
    }
    const inm = request.headers.get('if-none-match');
    if (inm && inm === etag) {
      return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': 'private, max-age=15' } });
    }
    return NextResponse.json(payload, { headers: { 'ETag': etag, 'Cache-Control': 'private, max-age=15' } });
  } catch(e:any){
    return NextResponse.json({ success:false, error:'Fehler', details: e?.message }, { status:500 });
  }
}