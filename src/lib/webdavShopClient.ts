// Shop-spezifischer WebDAV Client (separate Credentials). Fällt auf generischen Client zurück falls SHOP_* nicht gesetzt.
// Dieses Modul ist server-only
export const runtime = 'nodejs';

import { davPut as basePut, davDelete as baseDelete, webdavPublicUrl as basePublicUrl, isWebdavEnabled as baseEnabled } from './webdavClient';

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

export function isShopWebdavEnabled(){ return !!conf(); }

export function shopWebdavPublicUrl(pathname: string){
  const cdn = process.env.SHOP_WEBDAV_PUBLIC_BASEURL;
  if(cdn) return `${cdn.replace(/\/$/, '')}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
  // Wenn kein eigener CDN Host dann generischer Mechanismus aus Basisklient
  return basePublicUrl(pathname);
}

// Minimal eigene PUT/DELETE Implementierung nur falls separate Creds aktiv sind. Sonst Basismethoden verwenden.
export async function shopDavPut(key: string, body: Uint8Array | ArrayBuffer | Blob, contentType?: string){
  const c = conf();
  if(!c){
    // Rückfall: generischer Client
    return basePut(key, body as any, contentType);
  }
  const blobBody = body instanceof Blob ? body : new Blob([body as any], { type: contentType || 'application/octet-stream' });
  // Elternordner sicherstellen (einfache rekursive Anlage)
  await ensureParentDir(key, c.url, c.auth);
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  let res: Response | null = null;
  try {
    res = await fetch(target, { method:'PUT', headers: { Authorization: c.auth, ...(contentType? { 'Content-Type': contentType }: {}) }, body: blobBody });
  } catch(e:any){
    console.warn('[shopDavPut] Netzwerk/Fetch Fehler', { target, err: e?.message });
    throw new Error('SHOP WebDAV PUT failed: fetch-error');
  }
  if(!res.ok){
    let snippet = '';
    try { snippet = (await res.text()).slice(0,300); } catch {}
    console.warn('[shopDavPut] PUT nicht ok', { status: res.status, target, snippet });
    // Fallback: falls 401 aber generischer WebDAV konfiguriert -> einmal versuchen
    if(res.status === 401 && baseEnabled()){
      console.warn('[shopDavPut] 401 – versuche generischen WebDAV Fallback');
      return basePut(key, body as any, contentType);
    }
    throw new Error('SHOP WebDAV PUT failed: '+res.status + (snippet? ' body:"'+snippet.replace(/"/g,'\"')+'"':'') );
  }
  return { url: shopWebdavPublicUrl(key), key };
}

export async function shopDavDelete(key: string){
  const c = conf();
  if(!c){
    return baseDelete(key);
  }
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const res = await fetch(target, { method:'DELETE', headers: { Authorization: c.auth } });
  if(!res.ok && res.status !== 404){
    throw new Error('SHOP WebDAV DELETE failed: '+res.status);
  }
}

export async function shopDavMove(oldKey: string, newKey: string){
  const c = conf();
  if(!c){
    // Fallback: generischer Client falls vorhanden
    return null; // Caller kann dann generische davMove versuchen
  }
  // Ziel-Verzeichnis anlegen
  await ensureParentDir(newKey, c.url, c.auth);
  const src = `${c.url}/${encodeURIComponent(oldKey).replace(/%2F/g,'/')}`;
  const dst = `${c.url}/${encodeURIComponent(newKey).replace(/%2F/g,'/')}`;
  let res: Response | null = null;
  try {
    res = await fetch(src, { method:'MOVE', headers: { Authorization: c.auth, Destination: dst, Overwrite: 'F' } });
  } catch {}
  if(res && (res.status === 201 || res.status === 204)){
    return { url: shopWebdavPublicUrl(newKey), key: newKey };
  }
  // Fallback: GET + PUT + DELETE
  const getRes = await fetch(src, { headers: { Authorization: c.auth } });
  if(!getRes.ok){
    throw new Error('SHOP MOVE fallback GET failed: '+getRes.status);
  }
  const buf = new Uint8Array(await getRes.arrayBuffer());
  await shopDavPut(newKey, buf, getRes.headers.get('content-type') || undefined);
  await shopDavDelete(oldKey).catch(()=>undefined);
  return { url: shopWebdavPublicUrl(newKey), key: newKey };
}

// Datei direkt mit SHOP WebDAV laden (serverseitig, mit Auth)
export async function shopDavGet(key: string): Promise<Uint8Array | null> {
  const c = conf();
  if(!c){
    return null;
  }
  const target = `${c.url}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  let res: Response | null = null;
  try {
    res = await fetch(target, { headers: { Authorization: c.auth } });
  } catch(e:any){
    console.warn('[shopDavGet] Fetch Fehler', { target, err: e?.message });
    return null;
  }
  if(!res.ok){
    console.warn('[shopDavGet] nicht ok', { status: res.status, target });
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureParentDir(key: string, baseUrl: string, auth: string){
  const idx = key.lastIndexOf('/');
  if(idx <= 0) return;
  const dirPath = key.substring(0, idx);
  const parts = dirPath.split('/').filter(Boolean);
  let acc = '';
  for(const part of parts){
    acc += (acc?'/':'') + part;
    const uri = `${baseUrl}/${encodeURIComponent(acc).replace(/%2F/g,'/')}`;
    let pf: Response | null = null;
    try { pf = await fetch(uri, { method:'PROPFIND', headers: { Authorization: auth, Depth: '0' } }); } catch(e:any){ console.warn('[shopDav ensureParentDir] PROPFIND Fehler', { uri, err:e?.message }); }
    if(!pf || !pf.ok){
      const mk = await fetch(uri, { method:'MKCOL', headers: { Authorization: auth } }).catch(e=>{ console.warn('[shopDav ensureParentDir] MKCOL Fehler', { uri, err:e?.message }); return null; });
      if(mk && !mk.ok && mk.status !== 405){ // 405 = already exists
        console.warn('[shopDav ensureParentDir] MKCOL nicht ok', { uri, status: mk.status });
      }
    }
  }
}

// Hilfsfunktion für Routen: gesamter Shop-WebDAV aktiv ODER generischer.
export function anyShopWebdavEnabled(){ return isShopWebdavEnabled() || baseEnabled(); }
