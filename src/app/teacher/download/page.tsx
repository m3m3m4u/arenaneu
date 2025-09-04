"use client";
import { useEffect, useState, useRef } from 'react';

interface ProductFile { key:string; name:string; downloadUrl?:string; contentType?:string; }
interface Product { _id:string; title:string; description?:string; price?:number; files?:ProductFile[]; category?:string; }

export default function TeacherDownloadShop(){
  const [items,setItems] = useState<Product[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [activeIdx,setActiveIdx] = useState<Record<string,number>>({}); // ProduktID -> Index der aktiven Datei (für Karussell)
  // Thumbnails für PDF (erste Seite) – key => dataURL | 'error'
  const [thumbs,setThumbs] = useState<Record<string,string>>({});
  // Einfache Warteschlange, um gleichzeitige PDF-Decodes zu begrenzen
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);

  async function processQueue(){
    if(busyRef.current) return; busyRef.current=true;
    while(queueRef.current.length){
      const k = queueRef.current.shift()!;
      // Falls inzwischen vorhanden (oder Fehler gesetzt) überspringen
      if(thumbs[k]) continue;
      const file = findFileByKey(k);
      if(!file || !file.downloadUrl) continue;
      try {
        // Dynamischer Import (kein SSR Bundle Blow-Up)
  const pdfjs: any = await import('pdfjs-dist');
        try { (pdfjs as any).GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js'; } catch {}
  const task = pdfjs.getDocument({ url: file.downloadUrl, useSystemFonts: true, enableXfa: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  // Erst mit moderatem Scale rendern (Qualität ausreichend für 320x240 Ziel)
  const baseViewport = page.getViewport({ scale: 0.7 });
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = Math.ceil(baseViewport.width);
  pageCanvas.height = Math.ceil(baseViewport.height);
  const pctx = pageCanvas.getContext('2d');
  if(!pctx) throw new Error('CanvasContext fehlgeschlagen');
  await page.render({ canvasContext: pctx, viewport: baseViewport }).promise;
  // Normiere auf festes 4:3 Thumbnail (letterboxed)
  const TARGET_W = 320; const TARGET_H = 240; // 4:3
  const out = document.createElement('canvas'); out.width = TARGET_W; out.height = TARGET_H;
  const octx = out.getContext('2d'); if(!octx) throw new Error('OutContext fehlgeschlagen');
  octx.fillStyle = '#ffffff'; octx.fillRect(0,0,TARGET_W,TARGET_H);
  const scale = Math.min(TARGET_W / pageCanvas.width, TARGET_H / pageCanvas.height);
  const drawW = pageCanvas.width * scale; const drawH = pageCanvas.height * scale;
  const dx = (TARGET_W - drawW)/2; const dy = (TARGET_H - drawH)/2;
  octx.imageSmoothingEnabled = true; (octx as any).imageSmoothingQuality='high';
  octx.drawImage(pageCanvas, dx, dy, drawW, drawH);
  const url = out.toDataURL('image/png');
  setThumbs(t=> ({ ...t, [k]: url }));
      } catch (e){
        setThumbs(t=> ({ ...t, [k]: 'error' }));
      }
    }
    busyRef.current=false;
  }

  function enqueueThumb(f: ProductFile){
    const k = f.key || f.downloadUrl!;
    if(thumbs[k]) return; // schon vorhanden oder Fehler
    if(!queueRef.current.includes(k)){
      queueRef.current.push(k);
      processQueue();
    }
  }

  function findFileByKey(k:string){
    for(const p of items){
      for(const f of (p.files||[])) if(f.key===k) return f;
    }
    return null;
  }

  async function load(){
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/shop/products?all=1');
      const d = await r.json();
      if(r.ok && d.success){ setItems(d.items||[]); } else setError(d.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ void load(); },[]);

  function pdfFiles(p:Product){
    // Nur echte Dateien (keine Platzhalter) und ausschließlich PDFs für die Vorschau
    return (p.files||[])
      .filter(f=> !f.key?.startsWith('placeholder:'))
      .filter(f=> /\.pdf$/i.test(f.name));
  }

  function setActive(pId:string, dir:number){
    setActiveIdx(prev=>{ const cur = prev[pId]||0; const files = pdfFiles(items.find(i=> i._id===pId)!); if(!files.length) return prev; const next = ( (cur+dir)%files.length + files.length ) % files.length; return { ...prev, [pId]: next }; });
  }

  function downloadFile(f:ProductFile){ if(!f.downloadUrl) return; try{ const a=document.createElement('a'); a.href=f.downloadUrl; a.download=f.name||'download'; a.rel='noopener'; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),0);} catch { window.open(f.downloadUrl,'_blank'); } }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Material-Downloads</h1>
      {loading && <div className="text-sm text-gray-500">Lade…</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      {!loading && !error && items.length===0 && <div className="text-sm text-gray-500">Keine Produkte vorhanden.</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {items.map(p=>{
          const files = pdfFiles(p);
          const idx = activeIdx[p._id]||0;
          const current = files[idx];
          if(current) enqueueThumb(current); // nur PDFs vorhanden
          const thumbKey = current?.key || '';
          return (
            <div key={p._id} className="group bg-white border rounded shadow-sm flex flex-col overflow-hidden">
              <div className="relative bg-gray-50 aspect-[4/3] flex items-center justify-center p-2">
                {/* Nur PDF-Thumbnails (erste Seite). Andere Dateitypen werden ignoriert. */}
                {current && current.downloadUrl ? (
                  <div className="w-full h-full flex items-center justify-center">
                    {thumbs[thumbKey] && thumbs[thumbKey] !== 'error' && (
                      <img src={thumbs[thumbKey]} alt={current.name} className="max-w-full max-h-full object-contain rounded shadow-sm" />
                    )}
                    {!thumbs[thumbKey] && <span className="text-[11px] text-gray-500">Lade Vorschau…</span>}
                    {thumbs[thumbKey] === 'error' && <span className="text-[11px] text-red-500">Keine Vorschau</span>}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400">Keine PDFs</div>
                )}
                {files.length>1 && (
                  <>
                    <button onClick={()=>setActive(p._id,-1)} className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/70 hover:bg-white text-xs px-1 py-0.5 rounded shadow">‹</button>
                    <button onClick={()=>setActive(p._id,1)} className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/70 hover:bg-white text-xs px-1 py-0.5 rounded shadow">›</button>
                    <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
                      {files.map((_,i)=>(<span key={i} className={`w-2 h-2 rounded-full ${i===idx?'bg-indigo-600':'bg-gray-300'}`} />))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 flex flex-col p-4 gap-2">
                <h3 className="font-semibold text-base leading-tight line-clamp-2" title={p.title}>{p.title}</h3>
                {p.description && <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-4">{p.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
                  {typeof p.price==='number' && <span className="font-medium text-gray-700">{p.price.toFixed(2)} €</span>}
                  <span>{files.length} PDF{files.length!==1?'s':''}</span>
                </div>
                <button onClick={()=> {
                  // Gesamtes Produkt als ZIP herunterladen
                  const a=document.createElement('a');
                  a.href=`/api/shop/products/${p._id}/download-zip`;
                  a.download=`${p.title.replace(/[^a-zA-Z0-9._-]+/g,'_')}.zip`;
                  document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),0);
                }} className="mt-2 w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded py-1.5 font-medium">Alle Dateien (ZIP)</button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}