import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { s3PublicUrl } from '@/lib/storage';

export async function GET(req: Request){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')||'12',10)));
    const search = (url.searchParams.get('q')||'').trim();
    const cat = (url.searchParams.get('cat')||'').trim();
    const showAll = url.searchParams.get('all') === '1' && role === 'admin';
    const filter: any = showAll ? {} : { isPublished: true };
    if (search){
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (cat) filter.category = cat;
    const total = await ShopProduct.countDocuments(filter);
    const itemsRaw = await ShopProduct.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
    const items = itemsRaw.map(doc => ({
      ...doc,
      files: Array.isArray((doc as any).files) ? (doc as any).files.map((f: any) => ({
        ...f,
        downloadUrl: f.key ? s3PublicUrl(f.key) : undefined
      })) : []
    }));
    const cats = page===1 ? await ShopProduct.distinct('category', { isPublished: true }) : [];
    return NextResponse.json({ success:true, items, page, pageSize: limit, total, categories: cats.filter(Boolean) });
  } catch (e){
    console.error('ShopProduct GET error', e);
    return NextResponse.json({ success:false, error:'Fehler beim Laden' }, { status:500 });
  }
}

export async function POST(req: Request){
  try {
    await dbConnect();
  const session: any = await getServerSession(authOptions as any);
  const role = session?.user?.role;
    if(!session || role !== 'admin'){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const body = await req.json();
    const { title, description='', category='', tags=[], isPublished=false } = body||{};
    if(!title){ return NextResponse.json({ success:false, error:'Titel erforderlich' }, { status:400 }); }
    const doc = await ShopProduct.create({ title: String(title).trim(), description: String(description).trim(), category: category?String(category).trim():undefined, tags: Array.isArray(tags)?tags.map((t:any)=>String(t).trim()).filter(Boolean):[], isPublished: !!isPublished });
    return NextResponse.json({ success:true, product: doc });
  } catch(e){
    console.error('ShopProduct POST error', e);
    return NextResponse.json({ success:false, error:'Fehler beim Erstellen' }, { status:500 });
  }
}
