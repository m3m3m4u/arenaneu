// Copies pdf.js worker into public so it's always available from same-origin without server FS lookups.
// Runs on postinstall. Works in local and most CI (including Vercel's install phase).
const fs = require('fs');
const path = require('path');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function tryResolve(...candidates){
  for(const c of candidates){
    try { return require.resolve(c); } catch { /* try next */ }
  }
  return null;
}

function main(){
  const root = process.cwd();
  const publicDir = path.join(root, 'public');
  ensureDir(publicDir);
  const outPath = path.join(publicDir, 'pdf.worker.min.mjs');
  const resolved = tryResolve('pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs-dist/build/pdf.worker.mjs', 'pdfjs-dist/build/pdf.worker.min.js', 'pdfjs-dist/build/pdf.worker.js');
  if(!resolved){
    console.warn('[copy-pdf-worker] Could not resolve pdf.js worker file. Is pdfjs-dist installed?');
    return;
  }
  try {
    fs.copyFileSync(resolved, outPath);
    console.log('[copy-pdf-worker] Copied', resolved, '->', outPath);
  } catch (e){
    console.warn('[copy-pdf-worker] Copy failed:', e);
  }
}

main();
