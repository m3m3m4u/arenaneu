import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Liefert den pdf.js Worker aus eigener Origin, um CSP (script-src 'self') einzuhalten.
export async function GET(){
  try {
  const workerPath = path.join((globalThis as any).process.cwd(), 'node_modules','pdfjs-dist','build','pdf.worker.min.js');
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
