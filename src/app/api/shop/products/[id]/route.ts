import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { s3Delete } from '@/lib/storage';
import { isWebdavEnabled, davDelete } from '@/lib/webdavClient';
import { isShopWebdavEnabled, shopDavDelete } from '@/lib/webdavShopClient';
import { normalizeCategory } from '@/lib/categories';

async function ensureAuth(){
  const session: any = await getServerSession(authOptions as any);
  const role = session?.user?.role;
  if(!session || !['teacher','admin','author'].includes(role)) return null;
  return { session, role };
}

export async function GET(_req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const doc = await ShopProduct.findById(ctx.params.id).lean();
    if(!doc || !doc.isPublished){
      return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    }
    return NextResponse.json({ success:true, product: doc });
  } catch(e){
    return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const auth = await ensureAuth(); if(!auth) return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    const body = await req.json();
    const update: any = {};
    if(body.title) update.title = String(body.title).trim();
    if(typeof body.description === 'string') update.description = body.description;
    if(typeof body.category === 'string'){
      const catNorm = normalizeCategory(body.category);
      if(body.category && !catNorm) return NextResponse.json({ success:false, error:'Ungültige Kategorie' }, { status:400 });
      update.category = catNorm;
    }
    if(Array.isArray(body.tags)) update.tags = body.tags.map((t:any)=>String(t).trim()).filter(Boolean);
    if(typeof body.isPublished === 'boolean') update.isPublished = body.isPublished;
    const doc = await ShopProduct.findByIdAndUpdate(ctx.params.id, update, { new:true });
    if(!doc) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    return NextResponse.json({ success:true, product: doc });
  } catch(e){
    console.error('PATCH product', e);
    return NextResponse.json({ success:false, error:'Fehler beim Aktualisieren' }, { status:500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const auth = await ensureAuth(); if(!auth) return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    const doc = await ShopProduct.findById(ctx.params.id);
    if(!doc) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    // Dateien auf S3 löschen
  const useShopWebdav = isShopWebdavEnabled();
  const useWebdav = useShopWebdav || isWebdavEnabled();
    try {
      for(const f of doc.files){
        if(!f.key) continue;
        if(useWebdav){
          try { useShopWebdav ? await shopDavDelete(f.key) : await davDelete(f.key); } catch{}
        } else {
          try { await s3Delete(f.key); } catch{}
        }
      }
    } catch{}
    await doc.deleteOne();
    return NextResponse.json({ success:true });
  } catch(e){
    return NextResponse.json({ success:false, error:'Fehler beim Löschen' }, { status:500 });
  }
}
