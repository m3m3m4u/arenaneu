import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';
import ShopDownloadLog from '@/models/ShopDownloadLog';
import ShopProduct from '@/models/ShopProduct';

export const runtime = 'nodejs';

export async function GET(req: Request){
  try {
    if(!await isAdminRequest(req)){
      return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
    }
    if(!rateLimit(req,'shop-admin-downloads')){
      return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    }
    await dbConnect();
    const url = new URL(req.url);
    const sinceStr = url.searchParams.get('since');
    const untilStr = url.searchParams.get('until');
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')||'50',10)));
    const by = (url.searchParams.get('by')||'product'); // 'product' | 'day'

    const match: any = {};
    if(sinceStr){ const d=new Date(sinceStr); if(!isNaN(d.getTime())) match.createdAt = { ...(match.createdAt||{}), $gte: d }; }
    if(untilStr){ const d=new Date(untilStr); if(!isNaN(d.getTime())) match.createdAt = { ...(match.createdAt||{}), $lte: d }; }

    if(by==='day'){
      const rows = await ShopDownloadLog.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: limit }
      ]);
      return NextResponse.json({ success:true, by:'day', rows });
    }

    // Aggregation nach Produkt
    const rows = await ShopDownloadLog.aggregate([
      { $match: match },
      { $group: { _id: '$productId', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      { $sort: { count: -1, last: -1 } },
      { $limit: limit }
    ]);
    // Titel auflösen
    const ids = rows.map(r=> r._id);
    const prods = await ShopProduct.find({ _id: { $in: ids } }, { title:1 }).lean();
    const titleMap = new Map<string,string>(prods.map((p:any)=> [String(p._id), p.title]));
    const items = rows.map(r=> ({ productId: r._id, title: titleMap.get(String(r._id)) || '(gelöscht)', count: r.count, last: r.last }));
    return NextResponse.json({ success:true, by:'product', items });
  } catch(e){
    console.error('admin downloads error', e);
    return NextResponse.json({ success:false, error:'Serverfehler' }, { status:500 });
  }
}
