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
    let added = 0;
    const usedNames = new Set<string>();
    for(const f of files){
      let url: string | undefined;
      if(anyWebdav){
        url = useShopWebdav ? shopWebdavPublicUrl(f.key) : webdavPublicUrl(f.key);
      } else if(isS3Enabled()) {
        url = s3PublicUrl(f.key);
      }
      if(!url) continue;
      // Relative Pfade ("/medien/...") in absolute URLs umwandeln
      if(url.startsWith('/')){
        try { const origin = new URL(req.url).origin; url = origin + url; } catch {}
      }
      try {
        const data = await fetchArrayBuffer(url);
        let baseName = f.name || f.key.split('/').pop() || 'datei';
        baseName = baseName.replace(/[^a-zA-Z0-9._-]+/g,'_');
        if(!baseName) baseName='datei';
        let finalName = baseName;
        let c = 1;
        while(usedNames.has(finalName)){
          const dot = baseName.lastIndexOf('.');
          if(dot>0){ finalName = baseName.slice(0,dot)+`_${c}`+baseName.slice(dot); } else { finalName = baseName + `_${c}`; }
          c++;
        }
        usedNames.add(finalName);
        zip.file(finalName, data);
        added++;
      } catch(err){
        console.warn('ZIP fetch Fehler', f.key, (err as any)?.message);
      }
    }
  const content = await zip.generateAsync({ type:'uint8array', compression: 'DEFLATE', compressionOptions:{ level:6 } });
    const filename = (prod.title||'download').replace(/[^a-zA-Z0-9._-]+/g,'_') + '.zip';
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  const blob = new Blob([copy], { type: 'application/zip' });
  if(added === 0){
      return NextResponse.json({ success:false, error:'Keine Dateien abrufbar (ZIP leer)', files: files.length }, { status:502 });
    }
  // Download Logging (nicht-blockierend)
  try {
    const ShopDownloadLog = (await import('@/models/ShopDownloadLog')).default;
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '') as string;
    const userAgent = (req.headers.get('user-agent') || '') as string;
    await ShopDownloadLog.create({ productId: String((prod as any)._id), user: session?.user?.username, role, ip, userAgent });
  } catch {/* ignore logging errors */}
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
