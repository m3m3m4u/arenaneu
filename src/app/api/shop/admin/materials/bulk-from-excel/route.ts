import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut, webdavPublicUrl } from '@/lib/webdavClient';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';
import * as XLSX from 'xlsx';

export const runtime='nodejs';
export const maxDuration=120;

// Erwartet multipart/form-data mit field "file" (Excel: .xlsx / .xls / .csv)
// Struktur: Jede Spalte = ein Material
// Row1: Titel, Row2: Kategorie, Row3: Beschreibung, Row4: Preis (Zahl / optional), Rows5+: Dateinamen
// Dateien müssen vorab hochgeladen sein und exakt mit gespeicherten Namen vorkommen (wir suchen nach key-Endungen)
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
    const materials: Array<{ title:string; category?:string; description?:string; price:number; files:string[] }> = [];
    for(const c of cols){
      const cellVal=(r:number)=>{ const ref=XLSX.utils.encode_cell({c,r}); const cell=sheet[ref]; if(!cell) return ''; return String(cell.v??'').trim(); };
      const title = cellVal(range.s.r);
      if(!title) continue; // leere Spalte ignorieren
      const category = cellVal(range.s.r+1) || undefined;
      const description = cellVal(range.s.r+2) || undefined;
      const priceRaw = cellVal(range.s.r+3);
      const price = priceRaw? Number(priceRaw.replace(',','.'))||0 : 0;
      const fileNames: string[] = [];
      for(let r=range.s.r+4; r<=range.e.r; r++){
        const name = cellVal(r); if(name) fileNames.push(name);
      }
      materials.push({ title, category, description, price, files: fileNames });
    }
    if(!materials.length) return NextResponse.json({ success:false, error:'Keine gültigen Spalten gefunden' }, { status:400 });

    // Wir können hier keine Dateinamen->Key Zuordnung ohne Index kennen. Vereinfachung: wir versuchen, vorhandene Produkte nicht zu duplizieren (gleicher Titel).
    // Für Datei-Verknüpfungen: Admin lädt zuerst Dateien (Medien-ähnlich) in einen Ordner /shop/uploads/raw/<filename>. Wir suchen diese Keys.
    const useShop = isShopWebdavEnabled(); const useWebdav = useShop || isWebdavEnabled(); const useS3 = !useWebdav && isS3Enabled();
    // Listing existierender Dateien ist ohne WebDAV PROPFIND Rekursion schwer – wir erwarten daher, dass Excel-Dateinamen exakt bereits als KEY-Endung existieren.
    // Optional: Könnte man später mit eigenem Index-Model lösen.
    // Hier nur Erzeugung der Produkte (Dateien erst später manuell zuordenbar), wenn fileNames vorhanden -> wir speichern Platzhalter.
    const created:any[]=[]; const skipped:any[]=[];
    for(const m of materials){
      const existing = await ShopProduct.findOne({ title: m.title });
      if(existing){ skipped.push({ title:m.title, reason:'existiert' }); continue; }
      const doc = await ShopProduct.create({ title: m.title, category: m.category, description: m.description, price: m.price, tags:[], isPublished:false, files: [] });
      // Placeholder file entries (ohne Upload). Später per separatem Endpoint verknüpfen.
      m.files.forEach(fn=>{ doc.files.push({ key:`placeholder:${fn}`, name:fn, size:0, contentType: undefined, createdAt:new Date() }); });
      await doc.save();
      created.push({ id: doc._id, title: doc.title, placeholders: m.files.length });
    }
    return NextResponse.json({ success:true, created, skipped, count: created.length, totalInput: materials.length });
  } catch(e:any){
    console.error('bulk-from-excel error', e);
    return NextResponse.json({ success:false, error:'Serverfehler', message:e?.message });
  }
}
