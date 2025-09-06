import { NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

// Liefert den pdf.js Worker aus eigener Origin, um CSP (script-src 'self') einzuhalten.
export async function GET(){
  try {
    // 1) Bevorzugt: über Bundler die URL des Worker-Assets ermitteln und weiterleiten
    try {
      // Next/Webpack liefert die gebündelte URL für das Asset (TS kennt ?url nicht)
      // @ts-ignore
      const mod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      const assetUrl = (mod && (mod.default || mod)) as string | undefined;
      if (assetUrl && typeof assetUrl === 'string') {
        return new Response(null, {
          status: 302,
          headers: {
            Location: assetUrl,
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        });
      }
    } catch { /* fall back to filesystem search below */ }

    // 1b) Node-Auflösung: versuche den Pfad via require.resolve herauszufinden (robust in Serverless)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const resolved = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
      if(process.env.PDF_WORKER_DEBUG){
        console.log('[pdf-worker] require.resolve ->', resolved);
      }
      const code = await readFile(resolved, 'utf8');
      return new Response(code, {
        status: 200,
        headers: {
          'Content-Type':'application/javascript; charset=utf-8',
          'Cache-Control':'public, max-age=31536000, immutable'
        }
      });
    } catch { /* continue to candidates */ }

    // 2) Fallback: Worker-Datei im Dateisystem suchen (lokal/standalone)
    const baseCwd = (require('process') as any).cwd();
    const candidates = [
      ['node_modules','pdfjs-dist','build','pdf.worker.min.mjs'],
      ['node_modules','pdfjs-dist','build','pdf.worker.min.js'],
      ['node_modules','pdfjs-dist','build','pdf.worker.js'],
      ['node_modules','pdfjs-dist','legacy','build','pdf.worker.min.mjs'],
      ['node_modules','pdfjs-dist','legacy','build','pdf.worker.min.js'],
      ['.next','standalone','node_modules','pdfjs-dist','build','pdf.worker.min.mjs'],
      ['.next','standalone','node_modules','pdfjs-dist','build','pdf.worker.min.js'],
      ['.next','standalone','node_modules','pdfjs-dist','legacy','build','pdf.worker.min.mjs'],
      ['.next','standalone','node_modules','pdfjs-dist','legacy','build','pdf.worker.min.js'],
    ];
    for(const parts of candidates){
      const p = path.join(baseCwd, ...parts);
      try {
        if(process.env.PDF_WORKER_DEBUG){
          console.log('[pdf-worker] try', p);
        }
        await access(p);
        const code = await readFile(p,'utf8');
        return new Response(code, {
          status: 200,
          headers: {
            'Content-Type':'application/javascript; charset=utf-8',
            'Cache-Control':'public, max-age=31536000, immutable'
          }
        });
      } catch { /* try next */ }
    }
    throw new Error('pdf.worker Asset nicht gefunden');
  } catch(e){
    console.error('pdf-worker route Fehler', e);
    return NextResponse.json({ error:'Worker nicht gefunden' }, { status:500 });
  }
}
