// This module is server-only
export const runtime = 'nodejs';
// Dynamischer Import vermeidet statische Auflösung beim Build
async function importWebdav(){
  const importer: any = Function('m', 'return import(m)');
  return importer('webdav');
}

export async function getWebdav() {
  const baseURL = process.env.WEBDAV_BASEURL; // z.B. https://u328723-sub2.your-storagebox.de
  const username = process.env.WEBDAV_USERNAME;
  const password = process.env.WEBDAV_PASSWORD;
  if(!baseURL || !username || !password) return null;
  const url = baseURL.replace(/\/$/, '') + '/';
  const mod = await importWebdav();
  const client = mod.createClient(url, { username, password });
  return client;
}

export function webdavPublicUrl(pathname: string){
  const cdn = process.env.WEBDAV_PUBLIC_BASEURL; // optional, wenn via CDN/Domain exponiert
  if(cdn) return `${cdn.replace(/\/$/,'')}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
  const base = (process.env.WEBDAV_BASEURL||'').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
}
