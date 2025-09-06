import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { s3Put, isS3Enabled } from '@/lib/storage';
import { isWebdavEnabled, davPut, webdavPublicUrl } from '@/lib/webdavClient';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { generatePdfPreviewImagesForShopFile, generatePdfPreviewImagesForShopFileBytes } from '@/lib/pdf/generatePreviews';

export const runtime = 'nodejs'; // benötigt für Buffer

export async function POST(req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || !['teacher','admin','author'].includes(role)){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
  const url = new URL(req.url);
  const syncPreviewParam = url.searchParams.get('syncPreview');
  const wantSyncPreview = syncPreviewParam === '1' || /true|yes|on/i.test(syncPreviewParam||'');
    const contentType = req.headers.get('content-type')||'';
    if(!/^multipart\/form-data/i.test(contentType)){
      return NextResponse.json({ success:false, error:'multipart/form-data erwartet' }, { status:400 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if(!file || !(file instanceof File)){
      return NextResponse.json({ success:false, error:'Datei fehlt' }, { status:400 });
    }
  // Optional auch aus Form lesen (falls Clients lieber Feld mitsenden)
  const syncPreviewField = form.get('syncPreview');
  const wantSync = wantSyncPreview || (typeof syncPreviewField === 'string' && (/^1$|true|yes|on/i.test(syncPreviewField)));
    const doc = await ShopProduct.findById(ctx.params.id);
    if(!doc){ return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 }); }
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Gemeinsamer Schlüssel – identisch für WebDAV & S3
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const shopBase = (process.env.WEBDAV_SHOP_PREFIX || 'shop').replace(/^[\\/]+|[\\/]+$/g,'');
  const key = `${shopBase}/${doc._id}/${Date.now()}_${safeName}`;

  const useShopWebdav = isShopWebdavEnabled();
  const useWebdav = useShopWebdav || isWebdavEnabled();
    let finalUrl: string | undefined;

    if(useWebdav){
      try {
        const up = useShopWebdav
          ? await shopDavPut(key, bytes, file.type||'application/octet-stream')
          : await davPut(key, bytes, file.type||'application/octet-stream');
        finalUrl = up?.url || (useShopWebdav ? shopWebdavPublicUrl(key) : webdavPublicUrl(key));
      } catch(err){
        console.error('WebDAV Upload fehlgeschlagen, versuche ggf. S3 Fallback', err);
        if(isS3Enabled()){
          const up2 = await s3Put(key, bytes, file.type||'application/octet-stream');
          finalUrl = up2?.url;
        } else {
          return NextResponse.json({ success:false, error:'Upload fehlgeschlagen (WebDAV)' }, { status:500 });
        }
      }
    } else {
      if(!isS3Enabled()){
        return NextResponse.json({ success:false, error:'Kein Storage konfiguriert' }, { status:500 });
      }
      const up = await s3Put(key, bytes, file.type||'application/octet-stream');
      finalUrl = up?.url;
    }

  const isPdf = /pdf$/i.test(file.type||'') || /\.pdf$/i.test(file.name||'');
  doc.files.push({ key, name: file.name, size: bytes.length, contentType: file.type, createdAt: new Date() });
    await doc.save();

    // Vorschau-Generierung für PDFs: optional synchron warten
    let previewResult: { urls: string[]; pages: number } | null = null;
    if(isPdf){
      // @ts-ignore _id ist ObjectId; zur Sicherheit String bauen
      const pid = String((doc as any)._id);
      if(wantSync){
        try {
          // Verwende die Upload-Bytes direkt, um Race-Conditions zu vermeiden
          previewResult = await generatePdfPreviewImagesForShopFileBytes(pid, key, file.name, bytes);
        } catch(e){
          console.warn('Sync PDF Preview Gen Fehlgeschlagen', (e as any)?.message);
        }
        // Falls Sync fehlgeschlagen hat, asynchron nachreichen
        if(!previewResult){
          void generatePdfPreviewImagesForShopFile(pid, key, file.name).catch(e=>{
            console.warn('PDF Preview Gen (Fallback async) Fehlgeschlagen', (e as any)?.message);
          });
        }
      } else {
        void generatePdfPreviewImagesForShopFile(pid, key, file.name).catch(e=>{
          console.warn('PDF Preview Gen Fehlgeschlagen', (e as any)?.message);
        });
      }
    }

    return NextResponse.json({ success:true, file: { key, url: finalUrl }, previewQueued: !!(isPdf && !previewResult), preview: previewResult });
  } catch(e){
    console.error('Upload file error', e);
    return NextResponse.json({ success:false, error:'Upload fehlgeschlagen' }, { status:500 });
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || role !== 'admin'){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if(!key){
      return NextResponse.json({ success:false, error:'key fehlt' }, { status:400 });
    }
    const doc = await ShopProduct.findById(ctx.params.id);
    if(!doc){ return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 }); }
    const before = doc.files.length;
    doc.files = doc.files.filter((f: any)=> f.key !== key);
    if(doc.files.length === before){
      return NextResponse.json({ success:false, error:'Datei nicht gefunden' }, { status:404 });
    }
    await doc.save();
    return NextResponse.json({ success:true, removed:true, remaining: doc.files.length });
  } catch(e){
    console.error('Remove product file error', e);
    return NextResponse.json({ success:false, error:'Löschen fehlgeschlagen' }, { status:500 });
  }
}
