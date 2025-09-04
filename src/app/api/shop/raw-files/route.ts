import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopRawFile from '@/models/ShopRawFile';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut, webdavPublicUrl } from '@/lib/webdavClient';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';

export const runtime='nodejs';
export const maxDuration=60;

function sanitizeName(n:string){ return n.replace(/[^a-zA-Z0-9._-]+/g,'_'); }

export async function GET(req: Request){
  try {
    await dbConnect();
    const url=new URL(req.url);
    const page=Math.max(1,parseInt(url.searchParams.get('page')||'1',10));
    const limit=Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit')||'50',10)));
    const search=(url.searchParams.get('q')||'').trim().toLowerCase();
    const filter:any={}; if(search){ filter.name={ $regex: search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), $options:'i' }; }
    const total=await ShopRawFile.countDocuments(filter);
    const items=await ShopRawFile.find(filter).sort({ createdAt:-1 }).skip((page-1)*limit).limit(limit).lean();
    const useShop=isShopWebdavEnabled(); const anyWebdav=useShop || isWebdavEnabled();
    const out=items.map(it=>({
      id:String(it._id),
      name:it.name,
      key:it.key,
      size:it.size,
      contentType:it.contentType,
      createdAt:it.createdAt,
      url: anyWebdav ? (useShop ? shopWebdavPublicUrl(it.key) : webdavPublicUrl(it.key)) : s3PublicUrl(it.key)
    }));
    return NextResponse.json({ success:true, items: out, total, page, pageSize: limit });
  } catch(e){
    console.error('raw-files GET error', e);
    return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
  }
}

export async function POST(req: Request){
  try {
    await dbConnect();
    const session:any=await getServerSession(authOptions as any);
    if(!session || session.user?.role!=='admin') return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    const ct=req.headers.get('content-type')||''; if(!/multipart\/form-data/i.test(ct)) return NextResponse.json({ success:false, error:'multipart/form-data erwartet' }, { status:400 });
    const form=await req.formData(); const file=form.get('file'); if(!file || !(file instanceof File)) return NextResponse.json({ success:false, error:'Datei fehlt' }, { status:400 });
    const nameRaw=file.name || 'upload.bin'; const safe=sanitizeName(nameRaw);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const prefix=(process.env.WEBDAV_SHOP_PREFIX||'shop').replace(/^[\\/]+|[\\/]+$/g,'');
    const key=`${prefix}/raw/${Date.now()}_${safe}`;
    const useShop=isShopWebdavEnabled(); const anyWebdav=useShop || isWebdavEnabled(); let finalUrl:string|undefined;
    try {
      if(anyWebdav){
        try {
          const up = useShop ? await shopDavPut(key, bytes, file.type||undefined) : await davPut(key, bytes, file.type||undefined);
          finalUrl= up?.url || (useShop? shopWebdavPublicUrl(key): webdavPublicUrl(key));
        } catch(err:any){
          // Fallback: Wenn Shop aktiv war und 401 -> generisches WebDAV testen
          if(useShop && err?.status === 401 && isWebdavEnabled()){
            try {
              const up2 = await davPut(key, bytes, file.type||undefined);
              finalUrl = up2?.url || webdavPublicUrl(key);
            } catch(err2){
              if(isS3Enabled()){
                const up3 = await s3Put(key, bytes, file.type||'application/octet-stream'); finalUrl = up3?.url || s3PublicUrl(key);
              } else throw err2;
            }
          } else if(isS3Enabled()){
            const up3 = await s3Put(key, bytes, file.type||'application/octet-stream'); finalUrl = up3?.url || s3PublicUrl(key);
          } else throw err;
        }
      } else if(isS3Enabled()){
        const up = await s3Put(key, bytes, file.type||'application/octet-stream'); finalUrl= up?.url || s3PublicUrl(key);
      } else {
        return NextResponse.json({ success:false, error:'Kein Storage konfiguriert' }, { status:500 });
      }
    } catch(e:any){
      console.error('raw upload fail', e); return NextResponse.json({ success:false, error:'Upload fehlgeschlagen' }, { status:500 });
    }
    const doc = await ShopRawFile.create({ key, name: safe, size: bytes.length, contentType: file.type||undefined, createdBy: session.user?.username||session.user?.email });
    return NextResponse.json({ success:true, id: doc._id, name: doc.name, key: doc.key, size: doc.size, url: finalUrl });
  } catch(e){
    console.error('raw-files POST error', e);
    return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
  }
}

export async function DELETE(req: Request){
  try {
    await dbConnect();
    const session:any=await getServerSession(authOptions as any);
    if(!session || session.user?.role!=='admin') return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    const url=new URL(req.url); const id=url.searchParams.get('id'); if(!id) return NextResponse.json({ success:false, error:'id fehlt' }, { status:400 });
    const doc=await ShopRawFile.findById(id); if(!doc) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    // Optional: Löschlogik Storage
    await ShopRawFile.deleteOne({ _id: id });
    return NextResponse.json({ success:true });
  } catch(e){
    console.error('raw-files DELETE error', e); return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
  }
}
