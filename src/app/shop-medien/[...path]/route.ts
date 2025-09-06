import { NextResponse } from 'next/server';

// Proxy für Shop-WebDAV-Dateien ohne Browser-Auth: /shop-medien/<key>
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function b64(str: string){
  try {
    const g: any = globalThis as any;
    if (g.Buffer && typeof g.Buffer.from === 'function') return g.Buffer.from(str).toString('base64');
    if (typeof g.btoa === 'function') return g.btoa(unescape(encodeURIComponent(str)));
  } catch {}
  return str;
}

function conf(){
  const baseURL = process.env.SHOP_WEBDAV_BASEURL;
  const username = process.env.SHOP_WEBDAV_USERNAME;
  const password = process.env.SHOP_WEBDAV_PASSWORD;
  if(!baseURL || !username || !password) return null;
  const url = baseURL.replace(/\/$/, '');
  const auth = 'Basic ' + b64(`${username}:${password}`);
  return { url, auth };
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }){
  const { path: pathParts = [] } = await (ctx.params as any).catch?.(()=>({ path: [] as string[] })) ?? (ctx as any).params;
  const key = pathParts.join('/');
  const c = conf();
  if(!c){
    return new NextResponse('SHOP WebDAV nicht konfiguriert', { status: 503 });
  }
  const url = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const upstream = await fetch(url, { headers: { Authorization: c.auth } });
  if(!upstream.ok){
    return new NextResponse(`Fehler ${upstream.status}`, { status: upstream.status });
  }
  const body = upstream.body;
  const headers = new Headers();
  const ct = upstream.headers.get('content-type'); if(ct) headers.set('Content-Type', ct);
  const cd = upstream.headers.get('content-disposition'); if(cd) headers.set('Content-Disposition', cd);
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  return new NextResponse(body, { status: 200, headers });
}

export async function HEAD(req: Request, ctx: { params: Promise<{ path: string[] }> }){
  const { path: pathParts = [] } = await (ctx.params as any).catch?.(()=>({ path: [] as string[] })) ?? (ctx as any).params;
  const key = pathParts.join('/');
  const c = conf();
  if(!c){
    return new NextResponse(null, { status: 503 });
  }
  const url = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const upstream = await fetch(url, { method: 'HEAD', headers: { Authorization: c.auth } });
  const headers = new Headers();
  const ct = upstream.headers.get('content-type'); if(ct) headers.set('Content-Type', ct);
  const cl = upstream.headers.get('content-length'); if(cl) headers.set('Content-Length', cl);
  return new NextResponse(null, { status: upstream.status, headers });
}
