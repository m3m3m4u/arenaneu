import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';

// Speichert erstes generiertes Thumbnail (data URL) als previewImages[0] im entsprechenden File-Eintrag.
export async function POST(req: Request){
  try {
    const body = await req.json();
    const { key, productId, dataUrl } = body||{};
    if(!key || !productId || !dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')){
      return NextResponse.json({ success:false, error:'Invalid payload' }, { status:400 });
    }
    await dbConnect();
    const prod:any = await ShopProduct.findOne({ _id: productId });
    if(!prod) return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 });
    const file = prod.files.find((f:any)=> f.key===key);
    if(!file) return NextResponse.json({ success:false, error:'Datei nicht gefunden' }, { status:404 });
    if(file.previewImages && file.previewImages.length && file.previewImages[0]){
      return NextResponse.json({ success:true, skipped:true });
    }
    file.previewImages = [dataUrl];
    await prod.save();
    return NextResponse.json({ success:true, stored:true });
  } catch(e){
    console.error('product-thumbnail POST error', e);
    return NextResponse.json({ success:false, error:'Serverfehler' }, { status:500 });
  }
}
