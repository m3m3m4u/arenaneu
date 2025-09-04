import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';

export const runtime = 'nodejs';

// GET /api/shop/admin/files?limit=50&page=1
// Liefert flache Liste aller Dateien (auch nicht veröffentlichter Produkte) nach Upload-Datum absteigend.
// Pagination server-seitig. Nur Admin.
export async function GET(req: Request){
  try {
    if(!await isAdminRequest(req)){
      return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
    }
    if(!rateLimit(req,'shop-admin-files')){
      return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    }
    await dbConnect();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')||'50',10)));
    const skip = (page-1)*limit;
    // Wir projizieren nur benötigte Felder um Speicher zu sparen
    const products = await ShopProduct.find({}, { files: 1, title: 1, createdAt:1 })
      .lean();
    // Flache Liste aller Dateien mit Verweis auf Produkt
    const all: Array<{ productId:string; productTitle:string; fileKey:string; fileName:string; size:number; contentType?:string; createdAt:Date; productCreatedAt:Date; }> = [];
    for(const p of products){
      const files = Array.isArray((p as any).files)? (p as any).files: [];
      files.forEach((f:any)=>{
        all.push({
          productId: String((p as any)._id),
          productTitle: (p as any).title || '',
          fileKey: f.key,
          fileName: f.name,
          size: f.size,
          contentType: f.contentType,
          createdAt: f.createdAt ? new Date(f.createdAt) : (p as any).createdAt,
          productCreatedAt: (p as any).createdAt
        });
      });
    }
    all.sort((a,b)=> b.createdAt.getTime() - a.createdAt.getTime());
    const total = all.length;
    const slice = all.slice(skip, skip+limit);
    return NextResponse.json({ success:true, page, pageSize: limit, total, files: slice });
  } catch(e){
    console.error('admin files list error', e);
    return NextResponse.json({ success:false, error:'Serverfehler' }, { status:500 });
  }
}
