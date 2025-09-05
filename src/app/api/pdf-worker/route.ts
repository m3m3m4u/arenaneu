import { NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

// Liefert den pdf.js Worker aus eigener Origin, um CSP (script-src 'self') einzuhalten.
export async function GET(){
  try {
  // Zugriff über require('process') um Edge-Typkonflikte zu umgehen
  const baseCwd = (require('process') as any).cwd();
    const candidates = [
      // ESM/Legacy Varianten
      ['node_modules','pdfjs-dist','build','pdf.worker.min.mjs'],
      ['node_modules','pdfjs-dist','build','pdf.worker.min.js'],
      ['node_modules','pdfjs-dist','build','pdf.worker.js'],
      ['node_modules','pdfjs-dist','legacy','build','pdf.worker.min.mjs'],
      ['node_modules','pdfjs-dist','legacy','build','pdf.worker.min.js'],
      // Standalone (output: standalone)
      ['.next','standalone','node_modules','pdfjs-dist','build','pdf.worker.min.mjs'],
      ['.next','standalone','node_modules','pdfjs-dist','build','pdf.worker.min.js'],
      ['.next','standalone','node_modules','pdfjs-dist','legacy','build','pdf.worker.min.mjs'],
      ['.next','standalone','node_modules','pdfjs-dist','legacy','build','pdf.worker.min.js'],
    ];
    let workerPath = '';
    for(const parts of candidates){
      const p = path.join(baseCwd, ...parts);
      try { await access(p); workerPath = p; break; } catch { /* try next */ }
    }
    if(!workerPath) throw new Error('pdf.worker.* nicht gefunden');
    const code = await readFile(workerPath,'utf8');
    return new Response(code, {
      status: 200,
      headers: {
        'Content-Type':'application/javascript; charset=utf-8',
        'Cache-Control':'public, max-age=31536000, immutable'
      }
    });
  } catch(e){
    console.error('pdf-worker route Fehler', e);
    return NextResponse.json({ error:'Worker nicht gefunden' }, { status:500 });
  }
}
