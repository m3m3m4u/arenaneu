import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davExists, davPut, webdavPublicUrl } from '@/lib/webdavClient';

export const runtime = 'nodejs';

// Fester Upload-Speicher für Shop-Dateien ohne temporäre Phase.
// Ähnlich wie /api/media – nur anderer Basis-Pfad und Berechtigungen (author/admin).

const SHOP_PREFIX = (process.env.WEBDAV_SHOP_PREFIX || 'shop').replace(/^[\/]+|[\/]+$/g,'');
const BASE_PREFIX = SHOP_PREFIX ? SHOP_PREFIX + '/raw' : 'shop/raw';

// Erlaubt Unicode-Buchstaben (inkl. ÄÖÜäöüß) und Ziffern sowie . _ -
// Whitespace wird zu einem einzelnen Unterstrich zusammengezogen.
function sanitize(name: string){
  try {
    const normalized = (name || '').normalize('NFC');
    const kept = normalized
      // Ersetze alles außer Buchstaben/Ziffern/._- und Leerzeichen durch _
      .replace(/[^\p{L}\p{N}._\-\s]+/gu, '_')
      // Mehrfache Leerzeichen zu einem _
      .replace(/\s+/g, '_')
      // Führende/trailende Unterstriche entfernen
      .replace(/^_+|_+$/g, '')
      // Sicherheitskürzung
      .slice(0, 180);
    return kept || 'datei';
  } catch {
    // Fallback ohne Unicode-Property Escapes
  // Erhalte deutsche Umlaute/ß im Fallback explizit
  return (name || 'datei').replace(/[^a-zA-Z0-9._\-äöüÄÖÜß]+/g,'_').replace(/^_+|_+$/g,'').slice(0,180) || 'datei';
  }
}

// Liste aller Dateien (nur WebDAV Varianten aktuell). Optional später S3.
export async function GET(){
  if(!isShopWebdavEnabled() && !isWebdavEnabled()){
    return NextResponse.json({ success:false, error:'WebDAV nicht konfiguriert' }, { status:500 });
  }
  // Für schnelle Umsetzung: kein Directory Listing via PROPFIND hier (würde rekursiv nötig). TODO: Implementierung falls benötigt.
  return NextResponse.json({ success:true, note:'Listing noch nicht implementiert. Verwende admin/files Endpoint.' });
}

export async function POST(req: Request){
  const session = await getServerSession(authOptions as any);
  const role = (session?.user as any)?.role as string | undefined;
  if(!role || (role !== 'author' && role !== 'admin' && role !== 'teacher')){
    return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
  }
  if(!isShopWebdavEnabled() && !isWebdavEnabled()){
    return NextResponse.json({ success:false, error:'Kein WebDAV konfiguriert' }, { status:500 });
  }
  try {
    const form = await req.formData();
    const file = form.get('file');
    if(!file || !(file instanceof Blob)){
      return NextResponse.json({ success:false, error:'Keine Datei' }, { status:400 });
    }
    const rawName = (file as any).name || 'upload.bin';
    const safe = sanitize(rawName);
    const key = `${BASE_PREFIX}/${Date.now()}_${safe}`;
    const useShop = isShopWebdavEnabled();
    const blob = file as Blob;
    try {
      if(useShop){
        await shopDavPut(key, blob, (blob as any).type || undefined);
        return NextResponse.json({ success:true, key, url: shopWebdavPublicUrl(key), name: safe });
      } else {
        await davPut(key, blob, (blob as any).type || undefined);
        return NextResponse.json({ success:true, key, url: webdavPublicUrl(key), name: safe });
      }
    } catch(e:any){
      return NextResponse.json({ success:false, error: 'Upload fehlgeschlagen: '+ (e?.message||e) }, { status:500 });
    }
  } catch(e:any){
    return NextResponse.json({ success:false, error: String(e?.message||e) }, { status:500 });
  }
}
