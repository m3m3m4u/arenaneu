import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';
// @ts-ignore - Node Prozess verfügbar in Edge / Node Runtime (Next.js wählt automatisch)
const baseDir: string = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : process.cwd();

// Liefert eine einfache Liste verfügbarer Medien-Dateinamen (Bilder & Audio) aus public/uploads und public/media.
// Nur Dateinamen (keine Unterordner) – dient der Editor-Autovervollständigung / Auswahl.

export async function GET() {
  try {
  const uploadsDir = join(baseDir, 'public', 'uploads');
  const mediaDir = join(baseDir, 'public', 'media');
    const exts = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)$/i;
    let uploads: string[] = [];
    let media: string[] = [];
    try { uploads = (await readdir(uploadsDir, { withFileTypes: true })).filter(d=>d.isFile() && exts.test(d.name)).map(d=>d.name); } catch {}
    try { media = (await readdir(mediaDir, { withFileTypes: true })).filter(d=>d.isFile() && exts.test(d.name)).map(d=>d.name); } catch {}
    // Deduplizieren: uploads bevorzugt, dann media
    const seen = new Set<string>();
    const all: { name: string; location: 'uploads'|'media'; }[] = [];
    for(const n of uploads){ if(!seen.has(n)){ seen.add(n); all.push({ name:n, location:'uploads'}); } }
    for(const n of media){ if(!seen.has(n)){ seen.add(n); all.push({ name:n, location:'media'}); } }
    return NextResponse.json({ success:true, files: all });
  } catch (e) {
    return NextResponse.json({ success:false, error:'Listing failed' }, { status:500 });
  }
}
