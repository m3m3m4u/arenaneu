#!/usr/bin/env node
/**
 * Migration: Normalisiert mediaLink / Fragen-Medien und content.* Felder auf kanonisches Schema.
 * - /medien/uploads/ -> /uploads/
 * - Dateiname -> /uploads/<name>
 * - Absolute URLs bleiben unverändert
 * Nutzung: npx tsx scripts/migrate-media-paths.ts
 */
import mongoose from 'mongoose';
import path from 'path';
// Direkte relative Importe (Node-Ausführung außerhalb Next build context)
import Lesson from '../src/models/Lesson';
import { canonicalizeMediaPath } from '../src/lib/media';

async function run(){
  const uri = (process as any).env.MONGODB_URI || (process as any).env.MONGODB_URL || '';
  if(!uri){ console.error('MONGODB_URI fehlt'); (process as any).exit(1); }
  await mongoose.connect(uri);
  let changedLessons = 0;
  const cursor = Lesson.find({ $or: [ { 'questions.mediaLink': { $exists: true, $ne: null } }, { 'content.blocks.media': { $exists: true } } ] }).cursor();
  for await (const doc of cursor){
    let dirty = false;
    // Fragen
    if(Array.isArray((doc as any).questions)){
      (doc as any).questions.forEach((q: any)=>{
        if(q.mediaLink){
          const norm = canonicalizeMediaPath(q.mediaLink);
          if(norm && norm !== q.mediaLink){ q.mediaLink = norm; dirty = true; }
        }
      });
    }
    // text-answer blocks
    const content = (doc as any).content;
    if(content && Array.isArray(content.blocks)){
      content.blocks.forEach((b: any)=>{
        if(b.media){
          const norm = canonicalizeMediaPath(b.media);
          if(norm && norm !== b.media){ b.media = norm; dirty = true; }
        }
      });
    }
    if(dirty){
  try { await doc.save(); changedLessons++; }
      catch(e){ console.error('Fehler beim Speichern', doc._id, e); }
    }
  }
  console.log('Fertig. Aktualisierte Lektionen:', changedLessons);
  await mongoose.disconnect();
}
run().catch(e=>{ console.error(e); (process as any).exit(1); });
