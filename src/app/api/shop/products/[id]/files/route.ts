import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { s3Put } from '@/lib/storage';

export const runtime = 'nodejs'; // benötigt für Buffer

export async function POST(req: Request, ctx: { params: { id: string }} ){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || !['teacher','admin','author'].includes(role)){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const contentType = req.headers.get('content-type')||'';
    if(!/^multipart\/form-data/i.test(contentType)){
      return NextResponse.json({ success:false, error:'multipart/form-data erwartet' }, { status:400 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if(!file || !(file instanceof File)){
      return NextResponse.json({ success:false, error:'Datei fehlt' }, { status:400 });
    }
    const doc = await ShopProduct.findById(ctx.params.id);
    if(!doc){ return NextResponse.json({ success:false, error:'Produkt nicht gefunden' }, { status:404 }); }
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const key = `shop/${doc._id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g,'_')}`;
    const uploaded = await s3Put(key, bytes, file.type||'application/octet-stream');
    doc.files.push({ key, name: file.name, size: bytes.length, contentType: file.type });
    await doc.save();
    return NextResponse.json({ success:true, file: { key, url: uploaded?.url } });
  } catch(e){
    console.error('Upload file error', e);
    return NextResponse.json({ success:false, error:'Upload fehlgeschlagen' }, { status:500 });
  }
}
