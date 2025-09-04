import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut, webdavPublicUrl } from '@/lib/webdavClient';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';
import * as XLSX from 'xlsx';
import { normalizeCategory } from '@/lib/categories';
import ShopRawFile from '@/models/ShopRawFile';

export const runtime='nodejs';
export const maxDuration=120;

// Erwartet multipart/form-data mit field "file" (Excel: .xlsx / .xls / .csv)
// Struktur: Jede Spalte = ein Material
// Row1: Titel, Row2: Kategorie, Row3: Beschreibung, Row4: Preis (Zahl / optional), Rows5+: Dateinamen
// Dateien müssen vorab hochgeladen sein und exakt mit gespeicherten Namen vorkommen (wir suchen nach key-Endungen)
// mode=preview -> nur parse; sonst anlegen (mit Platzhaltern für Dateien)
export async function POST(req: Request){
  try {
    if(!await isAdminRequest(req)) return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
    if(!rateLimit(req,'bulk-excel')) return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    const ct=req.headers.get('content-type')||''; if(!/multipart\/form-data/i.test(ct)) return NextResponse.json({success:false,error:'multipart/form-data erwartet'},{status:400});
    const form=await req.formData(); const f=form.get('file'); if(!f || !(f instanceof File)) return NextResponse.json({success:false,error:'Datei fehlt'},{status:400});
    const buf=new Uint8Array(await f.arrayBuffer());
    await dbConnect();
    // Parse Excel
    const wb = XLSX.read(buf, { type:'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]]; if(!sheet) return NextResponse.json({ success:false, error:'Kein Sheet gefunden' }, { status:400 });
    const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
    const cols:number[]=[]; for(let c=range.s.c;c<=range.e.c;c++) cols.push(c);
  const materials: Array<{ title:string; category?:string; description?:string; price:number; files:string[]; normalizedCategory?:string }> = [];
    for(const c of cols){
      const cellVal=(r:number)=>{ const ref=XLSX.utils.encode_cell({c,r}); const cell=sheet[ref]; if(!cell) return ''; return String(cell.v??'').trim(); };
      const title = cellVal(range.s.r);
      if(!title) continue; // leere Spalte ignorieren
  const categoryRaw = cellVal(range.s.r+1) || undefined;
  const normalizedCategory = categoryRaw ? normalizeCategory(categoryRaw) || undefined : undefined;
  const category = categoryRaw;
      const description = cellVal(range.s.r+2) || undefined;
      const priceRaw = cellVal(range.s.r+3);
      const price = priceRaw? Number(priceRaw.replace(',','.'))||0 : 0;
      const fileNames: string[] = [];
      for(let r=range.s.r+4; r<=range.e.r; r++){
        const name = cellVal(r); if(name) fileNames.push(name);
      }
      materials.push({ title, category, description, price, files: fileNames, normalizedCategory });
    }
    if(!materials.length) return NextResponse.json({ success:false, error:'Keine gültigen Spalten gefunden' }, { status:400 });

    const urlObj=new URL(req.url); const preview = urlObj.searchParams.get('mode')==='preview';
    if(preview){
      return NextResponse.json({ success:true, preview:true, materials });
    }

    // Wir können hier keine Dateinamen->Key Zuordnung ohne Index kennen. Vereinfachung: wir versuchen, vorhandene Produkte nicht zu duplizieren (gleicher Titel).
    // Für Datei-Verknüpfungen: Admin lädt zuerst Dateien (Medien-ähnlich) in einen Ordner /shop/uploads/raw/<filename>. Wir suchen diese Keys.
    // RawFile Matching: vorhandene RawFile Namen werden per exact name zugeordnet
    const allNames = [...new Set(materials.flatMap(m=> m.files))];
    const rawFiles = await ShopRawFile.find({ name: { $in: allNames } }).lean();
    const rawMap = new Map<string, any>(); rawFiles.forEach(r=> rawMap.set(r.name, r));
    const created:any[]=[]; const skipped:any[]=[]; const unmatched:Set<string>=new Set();
    for(const m of materials){
      const existing = await ShopProduct.findOne({ title: m.title });
      if(existing){ skipped.push({ title:m.title, reason:'existiert' }); continue; }
      const doc = await ShopProduct.create({ title: m.title, category: m.normalizedCategory, description: m.description, price: m.price, tags:[], isPublished:false, files: [] });
      let linked = 0; let placeholders = 0;
      for(const fn of m.files){
        const rf = rawMap.get(fn);
        if(rf){
          doc.files.push({ key: rf.key, name: rf.name, size: rf.size, contentType: rf.contentType, createdAt: new Date() });
          linked++;
        } else {
          doc.files.push({ key:`placeholder:${fn}`, name:fn, size:0, contentType: undefined, createdAt:new Date() });
          placeholders++; unmatched.add(fn);
        }
      }
      await doc.save();
      created.push({ id: doc._id, title: doc.title, linked, placeholders });
    }
    return NextResponse.json({ success:true, created, skipped, count: created.length, totalInput: materials.length, unmatched: Array.from(unmatched) });
  } catch(e:any){
    console.error('bulk-from-excel error', e);
    return NextResponse.json({ success:false, error:'Serverfehler', message:e?.message });
  }
}
