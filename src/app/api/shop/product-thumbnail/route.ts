import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { isWebdavEnabled, davPut, webdavPublicUrl } from '@/lib/webdavClient';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';

// Speichert erstes generiertes Thumbnail (data URL) als previewImages[0] im entsprechenden File-Eintrag.
export async function POST(req: Request){
  try {
    const body = await req.json();
  const { key: fileKey, productId, dataUrl } = body||{};
  if(!fileKey || !productId || !dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')){
      return NextResponse.json({ success:false, error:'Invalid payload' }, { status:400 });
    }
    await dbConnect();
    const prod:any = await ShopProduct.findOne({ _id: productId });
    if(!prod) return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 });
  const file = prod.files.find((f:any)=> f.key===fileKey);
    if(!file) return NextResponse.json({ success:false, error:'Datei nicht gefunden' }, { status:404 });
    if(file.previewImages && file.previewImages.length && file.previewImages[0]){
      return NextResponse.json({ success:true, skipped:true, existing:file.previewImages[0] });
    }
    // DataURL -> Binary
    const commaIdx = dataUrl.indexOf(',');
    const b64 = dataUrl.substring(commaIdx+1);
  const bin = (globalThis as any).Buffer ? (globalThis as any).Buffer.from(b64, 'base64') : new Uint8Array([]);
    const fileNameSafe = file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/\.pdf$/i,'');
  const keyBase = `thumbnails/${prod._id}`;
  const thumbKey = `${keyBase}/${fileNameSafe}_p1.png`;
    let publicUrl: string | null = null;
    try {
      if(isWebdavEnabled()){
        const put = await davPut(thumbKey, bin, 'image/png');
        publicUrl = put?.url || webdavPublicUrl(thumbKey);
      } else if(isS3Enabled()){
        const put = await s3Put(thumbKey, bin instanceof Uint8Array ? bin : new Uint8Array(bin), 'image/png');
        publicUrl = put?.url || s3PublicUrl(thumbKey);
      }
    } catch(e){ console.warn('Thumbnail Upload fehlgeschlagen', thumbKey, e); }
    if(!publicUrl){
      // Fallback: Speichere weiterhin inline als DataURL damit wenigstens vorhanden
      file.previewImages = [dataUrl];
    } else {
      file.previewImages = [publicUrl];
    }
    await prod.save();
    return NextResponse.json({ success:true, stored:true, url: publicUrl || null, inlineFallback: !publicUrl });
  } catch(e){
    console.error('product-thumbnail POST error', e);
    return NextResponse.json({ success:false, error:'Serverfehler' }, { status:500 });
  }
}
