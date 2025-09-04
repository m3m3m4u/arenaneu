import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

// Liefert den pdf.js Worker aus eigener Origin, um CSP (script-src 'self') einzuhalten.
export async function GET(){
  try {
  // Zugriff über require('process') um Edge-Typkonflikte zu umgehen
  const baseCwd = (require('process') as any).cwd();
    let workerPath = path.join(baseCwd, 'node_modules','pdfjs-dist','build','pdf.worker.min.js');
    let code: string;
    try {
      code = await readFile(workerPath,'utf8');
    } catch(e){
      // Fallback: versuche im Standalone Bundle (bei output:standalone wird node_modules verlinkt/kopiert)
      workerPath = path.join(baseCwd, '.next','standalone','node_modules','pdfjs-dist','build','pdf.worker.min.js');
      code = await readFile(workerPath,'utf8');
    }
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
