// This module is server-only
export const runtime = 'nodejs';

function b64(str: string){
  try {
    const g: any = globalThis as any;
    if (g.Buffer && typeof g.Buffer.from === 'function') return g.Buffer.from(str).toString('base64');
    if (typeof g.btoa === 'function') return g.btoa(unescape(encodeURIComponent(str)));
  } catch {}
  return str;
}

function conf(){
  const baseURL = process.env.WEBDAV_BASEURL;
  const username = process.env.WEBDAV_USERNAME;
  const password = process.env.WEBDAV_PASSWORD;
  if(!baseURL || !username || !password) return null;
  const url = baseURL.replace(/\/$/, '');
  const auth = 'Basic ' + b64(`${username}:${password}`);
  return { url, auth };
}

export function isWebdavEnabled(){ return !!conf(); }

export async function davList(prefix: string){
  const c = conf(); if(!c) return [] as Array<{ name: string; url: string; size: number; mtime: number; key: string }>;
  const encoded = encodeURIComponent(prefix).replace(/%2F/g,'/');
  const target = `${c.url}/${encoded.endsWith('/') ? encoded : encoded + '/'}`;
  const res = await fetch(target, { method:'PROPFIND', headers: { Authorization: c.auth, Depth: '1' } });
  if(!res.ok) return [];
  const xml = await res.text();
  const items: Array<{ name: string; url: string; size: number; mtime: number; key: string }> = [];
  // Determine base path from base URL to compute keys relative to it
  let basePath = '/';
  try { const u = new URL(c.url); basePath = u.pathname || '/'; } catch {}
  basePath = basePath.replace(/\/$/, '');
  const normPrefix = prefix.replace(/^\/+/, '');
  const prefixPath = `${basePath}/${normPrefix}`.replace(/\/+/, '/');
  // Split on both D:response and d:response
  const responses = xml.split(/<[^>]*:response/).slice(1);
  for(const seg of responses){
    const hrefMatch = seg.match(/<[^>]*:href>([\s\S]*?)<\/[a-zA-Z0-9_:-]*href>/);
    if(!hrefMatch) continue;
    let href = hrefMatch[1].trim();
    // Normalize to pathname only
    try { if(/^https?:\/\//i.test(href)) href = new URL(href).pathname; } catch{}
    href = decodeURIComponent(href);
    if(href.endsWith('/')) continue; // Ordner überspringen
    // Ensure file is under the requested prefixPath
    if(!href.startsWith(prefixPath)) continue;
    let rel = href.substring(prefixPath.length);
    rel = rel.replace(/^\/+/, '');
    if(!rel || /\/$/.test(rel)) continue;
    const name = rel.split('/').pop() || rel;
    const key = `${normPrefix}${normPrefix.endsWith('/')?'':'/'}${rel}`;
    const sizeMatch = seg.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/) || seg.match(/<getcontentlength>(\d+)<\/getcontentlength>/);
    const dateMatch = seg.match(/<d:getlastmodified>([\s\S]*?)<\/d:getlastmodified>/) || seg.match(/<getlastmodified>([\s\S]*?)<\/getlastmodified>/);
    const size = sizeMatch ? Number(sizeMatch[1]) : 0;
    const mtime = dateMatch ? new Date(dateMatch[1]).getTime() : Date.now();
    items.push({ name, url: webdavPublicUrl(key), size, mtime, key });
  }
  items.sort((a,b)=> b.mtime - a.mtime);
  return items;
}

export async function davPut(key: string, body: Uint8Array | ArrayBuffer | Blob, contentType?: string){
  const c = conf(); if(!c) return null;
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const blobBody = body instanceof Blob ? body : new Blob([body as any], { type: contentType || 'application/octet-stream' });
  // Ensure parent directories exist (MKCOL), in case server returns 409 for missing collections
  await ensureParentDir(key, c.url, c.auth);
  let res = await fetch(target, { method:'PUT', headers: { Authorization: c.auth, ...(contentType? { 'Content-Type': contentType }: {}) }, body: blobBody });
  if(res.status === 409){
    // Try once more after ensuring parent again
    await ensureParentDir(key, c.url, c.auth, true);
    res = await fetch(target, { method:'PUT', headers: { Authorization: c.auth, ...(contentType? { 'Content-Type': contentType }: {}) }, body: blobBody });
  }
  if(!res.ok){
    // If conflict because it exists, surface as 409
    const exists = await davExists(key).catch(()=>false);
    if(exists) throw new Error('PUT failed: 409');
    throw new Error('PUT failed: ' + res.status);
  }
  return { url: webdavPublicUrl(key), key };
}

async function ensureParentDir(key: string, baseUrl: string, auth: string, force?: boolean){
  const idx = key.lastIndexOf('/');
  if(idx <= 0) return;
  const dirPath = key.substring(0, idx);
  const parts = dirPath.split('/').filter(Boolean);
  let acc = '';
  for(const part of parts){
    acc += (acc ? '/' : '') + part;
    const uri = `${baseUrl}/${encodeURIComponent(acc).replace(/%2F/g,'/')}`;
    // Check if collection exists
    const pf = await fetch(uri, { method:'PROPFIND', headers: { Authorization: auth, Depth: '0' } });
    if(force || !pf.ok){
      // Try to create collection
      await fetch(uri, { method:'MKCOL', headers: { Authorization: auth } }).catch(()=>undefined);
    }
  }
}

export async function davDelete(key: string){
  const c = conf(); if(!c) return;
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const res = await fetch(target, { method:'DELETE', headers: { Authorization: c.auth } });
  if(!res.ok && res.status !== 404) throw new Error('DELETE failed: ' + res.status);
}

export async function davMove(oldKey: string, newKey: string){
  const c = conf(); if(!c) return null;
  const src = `${c.url}/${encodeURIComponent(oldKey).replace(/%2F/g,'/')}`;
  const dst = `${c.url}/${encodeURIComponent(newKey).replace(/%2F/g,'/')}`;
  const res = await fetch(src, { method:'MOVE', headers: { Authorization: c.auth, Destination: dst, Overwrite: 'F' } });
  if(res.status===201 || res.status===204) return { url: webdavPublicUrl(newKey), key: newKey };
  // Fallback: GET + PUT + DELETE
  const getRes = await fetch(src, { headers: { Authorization: c.auth } });
  if(!getRes.ok) throw new Error('MOVE fallback GET failed');
  const buf = new Uint8Array(await getRes.arrayBuffer());
  await davPut(newKey, buf, getRes.headers.get('content-type') || undefined);
  await davDelete(oldKey);
  return { url: webdavPublicUrl(newKey), key: newKey };
}

export async function davExists(key: string){
  const c = conf(); if(!c) return false;
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const head = await fetch(target, { method:'HEAD', headers: { Authorization: c.auth } });
  if(head.status === 200) return true;
  // Some servers may not support HEAD properly; try PROPFIND Depth:0
  const pf = await fetch(target, { method:'PROPFIND', headers: { Authorization: c.auth, Depth: '0' } });
  return pf.ok;
}

export function webdavPublicUrl(pathname: string){
  const cdn = process.env.WEBDAV_PUBLIC_BASEURL; // optional, wenn via CDN/Domain exponiert
  if(cdn) return `${cdn.replace(/\/$/,'')}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
  const base = (process.env.WEBDAV_BASEURL||'').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
}
