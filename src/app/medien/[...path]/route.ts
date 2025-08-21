import { NextRequest, NextResponse } from 'next/server';

// Proxy für WebDAV-Dateien ohne Browser-Auth: /medien/<key>
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function conf(){
  const baseURL = process.env.WEBDAV_BASEURL;
  const username = process.env.WEBDAV_USERNAME;
  const password = process.env.WEBDAV_PASSWORD;
  if(!baseURL || !username || !password) return null;
  const url = baseURL.replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  return { url, auth };
}

export async function GET(req: any, ctx: { params: { path: string[] } }){
  const c = conf(); if(!c) return new NextResponse('WebDAV nicht konfiguriert', { status: 500 });
  const pathParts = ctx.params?.path || [];
  const key = pathParts.join('/');
  const url = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const upstream = await fetch(url, { headers: { Authorization: c.auth } });
  if(!upstream.ok){
    return new NextResponse(`Fehler ${upstream.status}`, { status: upstream.status });
  }
  const body = upstream.body;
  const headers = new Headers();
  const ct = upstream.headers.get('content-type'); if(ct) headers.set('Content-Type', ct);
  const cd = upstream.headers.get('content-disposition'); if(cd) headers.set('Content-Disposition', cd);
  const cl = upstream.headers.get('content-length'); if(cl) headers.set('Content-Length', cl);
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  return new NextResponse(body, { status: 200, headers });
}
