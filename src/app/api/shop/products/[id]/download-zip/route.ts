import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import JSZip from 'jszip';
import { isShopWebdavEnabled, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { isWebdavEnabled, webdavPublicUrl } from '@/lib/webdavClient';
import { isS3Enabled, s3PublicUrl } from '@/lib/storage';

export const runtime = 'nodejs';

async function fetchArrayBuffer(url: string){
  const r = await fetch(url);
  if(!r.ok) throw new Error('Download fehlgeschlagen '+r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export async function GET(req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || !['teacher','admin','author'].includes(role)){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const prod = await ShopProduct.findById(ctx.params.id).lean();
    if(!prod){ return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 }); }
    const files = Array.isArray((prod as any).files) ? (prod as any).files.filter((f: any)=> f && f.key && !String(f.key).startsWith('placeholder:')) : [];
    if(!files.length){
      return NextResponse.json({ success:false, error:'Keine Dateien' }, { status:404 });
    }
    const zip = new JSZip();
    const useShopWebdav = isShopWebdavEnabled();
    const anyWebdav = useShopWebdav || isWebdavEnabled();
    for(const f of files){
      let url: string | undefined;
      if(anyWebdav){
        url = useShopWebdav ? shopWebdavPublicUrl(f.key) : webdavPublicUrl(f.key);
      } else if(isS3Enabled()) {
        url = s3PublicUrl(f.key);
      }
      if(!url) continue;
      try {
        const data = await fetchArrayBuffer(url);
        const safeName = f.name || f.key.split('/').pop() || 'datei';
        zip.file(safeName, data);
      } catch(err){
        console.warn('ZIP fetch Fehler', f.key, (err as any)?.message);
      }
    }
  const content = await zip.generateAsync({ type:'uint8array', compression: 'DEFLATE', compressionOptions:{ level:6 } });
    const filename = (prod.title||'download').replace(/[^a-zA-Z0-9._-]+/g,'_') + '.zip';
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  const blob = new Blob([copy], { type: 'application/zip' });
  return new Response(blob, { status:200, headers:{
      'Content-Type':'application/zip',
      'Content-Disposition':`attachment; filename="${filename}"`,
      'Cache-Control':'no-store'
    }});
  } catch(e){
    console.error('ZIP Download Fehler', e);
    return NextResponse.json({ success:false, error:'ZIP Erstellung fehlgeschlagen' }, { status:500 });
  }
}
