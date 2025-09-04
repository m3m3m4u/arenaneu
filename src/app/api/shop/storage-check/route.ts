import { NextResponse } from 'next/server';
import { isShopWebdavEnabled, shopDavPut } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut } from '@/lib/webdavClient';
import { isS3Enabled, s3Put } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(){
  const shop = isShopWebdavEnabled();
  const generic = isWebdavEnabled();
  const s3 = isS3Enabled();
  return NextResponse.json({ shop, generic, s3 });
}

// Einfacher Schreibtest (kleine Datei) um PUT zu validieren
export async function POST(){
  try {
    const key = `diag/test_${Date.now()}.txt`;
    const payload = new TextEncoder().encode('diag');
    let target: any = null;
    if(isShopWebdavEnabled()){
      target = await shopDavPut(key, payload, 'text/plain');
    } else if(isWebdavEnabled()) {
      target = await davPut(key, payload, 'text/plain');
    } else if(isS3Enabled()) {
      await s3Put(key, payload, 'text/plain');
      target = { key };
    } else {
      return NextResponse.json({ ok:false, error:'no_storage' }, { status:500 });
    }
    return NextResponse.json({ ok:true, key: target?.key });
  } catch (e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'fail' }, { status:500 });
  }
}
