import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { s3PublicUrl, s3Copy, s3Delete, isS3Enabled } from '@/lib/storage';
import { isWebdavEnabled, webdavPublicUrl, davMove } from '@/lib/webdavClient';
import { isShopWebdavEnabled, shopWebdavPublicUrl, shopDavMove } from '@/lib/webdavShopClient';
import { CATEGORIES, normalizeCategory } from '@/lib/categories';
import TempShopFile from '@/models/TempShopFile';
import ShopRawFile from '@/models/ShopRawFile';

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
  const subject = (url.searchParams.get('subject')||'').trim();
  // Lehrer sollen im Download-Bereich ebenfalls unveröffentlichte Materialien sehen können
  const showAll = url.searchParams.get('all') === '1' && (role === 'admin' || role === 'teacher');
    const filter: any = showAll ? {} : { isPublished: true };
    if (search){
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
  if (cat) filter.category = cat;
  if (subject) filter.subjects = subject;
    const total = await ShopProduct.countDocuments(filter);
    const itemsRaw = await ShopProduct.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
  const useShopWebdav = isShopWebdavEnabled();
  const useWebdav = useShopWebdav || isWebdavEnabled();
    const items = itemsRaw.map(doc => ({
      ...doc,
      files: Array.isArray((doc as any).files) ? (doc as any).files.map((f: any) => ({
        ...f,
  downloadUrl: f.key ? (useWebdav ? (useShopWebdav ? shopWebdavPublicUrl(f.key) : webdavPublicUrl(f.key)) : s3PublicUrl(f.key)) : undefined
      })) : []
    }));
  // Kategorien: immer die zentrale Liste zurückgeben (damit alle Fächer, z.B. Religion, verfügbar sind)
  // Subjects abhängig vom aktuellen Filter (aber ohne aktives Subject), damit nur Fächer mit Material angezeigt werden
  let subjects: string[] = [];
  if(page===1){
    const filterForSubjects: any = { ...(showAll ? {} : { isPublished: true }) };
    if (search) {
      filterForSubjects.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (cat) filterForSubjects.category = cat;
    // aktives Subject explizit NICHT einschränken, damit die Liste alle passenden Fächer enthält
    subjects = (await ShopProduct.distinct('subjects', filterForSubjects)).filter(Boolean) as string[];
  }
  const categories = CATEGORIES;
  return NextResponse.json({ success:true, items, page, pageSize: limit, total, categories, subjects });
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
  const { title, description='', category='', tags=[], isPublished=false, tempKeys=[], rawFileIds=[], price, subjects=[] } = body||{};
    if(!title){ return NextResponse.json({ success:false, error:'Titel erforderlich' }, { status:400 }); }
    const catNorm = normalizeCategory(category);
    if(category && !catNorm){
      return NextResponse.json({ success:false, error:'Ungültige Kategorie' }, { status:400 });
    }
  const doc = await ShopProduct.create({ title: String(title).trim(), description: String(description).trim(), category: catNorm, tags: Array.isArray(tags)?tags.map((t:any)=>String(t).trim()).filter(Boolean):[], subjects: Array.isArray(subjects)?subjects.map((s:any)=>String(s).trim()).filter(Boolean):[], isPublished: !!isPublished, price: typeof price === 'number' ? price : (price ? Number(price) || 0 : 0) });
    // Direkte Verknüpfung vorhandener Raw-Dateien (werden NICHT verschoben, nur referenziert)
    if(Array.isArray(rawFileIds) && rawFileIds.length){
      const raws = await ShopRawFile.find({ _id: { $in: rawFileIds } });
      for(const r of raws){
        // Deduplikation falls gleiche key bereits vorhanden
        if(!doc.files.find(f=> f.key === r.key)){
          doc.files.push({ key: r.key, name: r.name, size: r.size, contentType: r.contentType, createdAt: new Date() });
        }
      }
    }
  if(Array.isArray(tempKeys) && tempKeys.length){
      const temps = await TempShopFile.find({ key: { $in: tempKeys } });
      const prefix = (process.env.WEBDAV_SHOP_PREFIX || 'shop').replace(/^[\\/]+|[\\/]+$/g,'');
      const useWebdav = isShopWebdavEnabled() || isWebdavEnabled();
      let movedCount = 0;
      for(const t of temps){
        try {
          const safeName = t.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
          const newKey = `${prefix}/${doc._id}/${Date.now()}_${safeName}`;
          let moved = false;
          if(useWebdav){
            if(isShopWebdavEnabled()){
              try { await shopDavMove(t.key, newKey); moved = true; } catch(err){ console.warn('shopDavMove fehlgeschlagen', t.key, err); }
            } else {
              try { await davMove(t.key, newKey); moved = true; } catch(err){ console.warn('davMove fehlgeschlagen', t.key, err); }
            }
          } else if(isS3Enabled()) {
            await s3Copy(t.key, newKey); await s3Delete(t.key); moved = true;
          }
          if(moved){
            doc.files.push({ key: newKey, name: t.name, size: t.size, contentType: t.contentType, createdAt: new Date() });
            await TempShopFile.deleteOne({ _id: t._id });
            movedCount++;
          } else {
            console.warn('Temp Datei konnte nicht übernommen werden (Move fehlgeschlagen):', t.key);
          }
        } catch(err){
          console.warn('Temp Datei Übernahme fehlgeschlagen', t.key, err);
        }
      }
      await doc.save();
      if(movedCount === 0){
        console.warn('Kein tempKey erfolgreich verschoben', { tempKeys, useWebdav, isShop: isShopWebdavEnabled(), isGeneric: isWebdavEnabled(), s3: isS3Enabled() });
      }
      // Produkt-Ausgabe inkl. downloadUrl und movedCount
      const useShopWebdav = isShopWebdavEnabled();
      const anyWebdav = useShopWebdav || isWebdavEnabled();
      const productOut: any = doc.toObject ? doc.toObject() : JSON.parse(JSON.stringify(doc));
      productOut.files = (productOut.files||[]).map((f: any)=>({
        ...f,
        downloadUrl: f.key ? (anyWebdav ? (useShopWebdav ? shopWebdavPublicUrl(f.key) : webdavPublicUrl(f.key)) : s3PublicUrl(f.key)) : undefined
      }));
      return NextResponse.json({ success:true, product: productOut, movedCount, warning: movedCount===0 ? 'Keine Datei übernommen' : undefined });
    }
  return NextResponse.json({ success:true, product: doc, movedCount: 0, rawLinked: Array.isArray(rawFileIds)? rawFileIds.length : 0 });
  } catch(e){
    console.error('ShopProduct POST error', e);
    return NextResponse.json({ success:false, error:'Fehler beim Erstellen' }, { status:500 });
  }
}
