import { createClient } from 'webdav';

export function getWebdav() {
  const baseURL = process.env.WEBDAV_BASEURL; // z.B. https://u328723-sub2.your-storagebox.de
  const username = process.env.WEBDAV_USERNAME;
  const password = process.env.WEBDAV_PASSWORD;
  if(!baseURL || !username || !password) return null;
  const url = baseURL.replace(/\/$/, '') + '/';
  return createClient(url, { username, password });
}

export function webdavPublicUrl(pathname: string){
  const cdn = process.env.WEBDAV_PUBLIC_BASEURL; // optional, wenn via CDN/Domain exponiert
  if(cdn) return `${cdn.replace(/\/$/,'')}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
  const base = (process.env.WEBDAV_BASEURL||'').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(pathname).replace(/%2F/g,'/')}`;
}
