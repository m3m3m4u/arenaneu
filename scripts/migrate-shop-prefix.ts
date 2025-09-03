#!/usr/bin/env node
/**
 * Migration: Verschiebt vorhandene Shop-Produktdateien in neuen Prefix (WEBDAV_SHOP_PREFIX).
 * Unterstützt WebDAV (MOVE) oder S3 (Copy+Delete).
 * Voraussetzung: ENV:
 *   MONGODB_URI
 *   WEBDAV_* oder S3_*
 *   WEBDAV_SHOP_PREFIX (neuer Ziel-Prefix, Default 'shop')
 * Optional: ALT_PREFIX (falls alter Ordnername != 'shop')
 *
 * Nutzung:
 *   npx tsx scripts/migrate-shop-prefix.ts
 */
import mongoose from 'mongoose';
import ShopProduct from '../src/models/ShopProduct';
import { isWebdavEnabled, davMove } from '../src/lib/webdavClient';
import { s3Copy, s3Delete, isS3Enabled } from '../src/lib/storage';

async function main(){
  const mongo = process.env.MONGODB_URI || process.env.MONGODB_URL || '';
  if(!mongo){ console.error('MONGODB_URI fehlt'); (process as any).exit(1); }
  await mongoose.connect(mongo as string);
  const useWebdav = isWebdavEnabled();
  const useS3 = !useWebdav && isS3Enabled();
  if(!useWebdav && !useS3){ console.error('Weder WebDAV noch S3 aktiv. Abbruch.'); (process as any).exit(1); }
  const newPrefix = (process.env.WEBDAV_SHOP_PREFIX || 'shop').replace(/^\/+|\/+$/g,'');
  const oldPrefix = (process.env.ALT_PREFIX || 'shop').replace(/^\/+|\/+$/g,'');
  if(newPrefix === oldPrefix){ console.log('Neuer Prefix identisch mit altem. Nichts zu tun.'); (process as any).exit(0); }
  console.log('Migration Start:', { oldPrefix, newPrefix, backend: useWebdav? 'webdav':'s3' });
  const cursor = ShopProduct.find({ 'files.key': { $regex: `^${oldPrefix}/` } }).cursor();
  let totalFiles = 0, migrated = 0, errors = 0;
  for await (const doc of cursor){
    let dirty = false;
    for(const file of doc.files){
      if(!file.key || !file.key.startsWith(oldPrefix + '/')) continue;
      totalFiles++;
      const rest = file.key.substring(oldPrefix.length+1);
      const newKey = `${newPrefix}/${rest}`;
      try {
        if(useWebdav){
          await davMove(file.key, newKey);
        } else {
          await s3Copy(file.key, newKey);
          await s3Delete(file.key);
        }
        file.key = newKey;
        dirty = true;
        migrated++;
      } catch(e){
        errors++;
        console.error('Fehler bei Datei', file.key, '->', newKey, e);
      }
    }
    if(dirty){
      try { await doc.save(); } catch(e){ console.error('Speichern fehlgeschlagen für Produkt', doc._id, e); }
    }
  }
  console.log('Fertig:', { totalFiles, migrated, errors });
  await mongoose.disconnect();
}

main().catch(e=>{ console.error(e); (process as any).exit(1); });
