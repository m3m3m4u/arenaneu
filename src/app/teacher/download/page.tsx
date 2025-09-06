"use client";
import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface ProductFile { key:string; name:string; downloadUrl?:string; contentType?:string; previewImages?:string[]; }
interface Product { _id:string; title:string; description?:string; price?:number; files?:ProductFile[]; category?:string; }

export default function TeacherDownloadShop(){
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items,setItems] = useState<Product[]>([]);
  const [subjects,setSubjects] = useState<string[]>([]);
  const [activeSubject,setActiveSubject] = useState<string>('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [activeIdx,setActiveIdx] = useState<Record<string,number>>({}); // ProduktID -> Index des aktiven Preview-Bildes
  // Thumbnails für PDF (erste Seite) – key => dataURL | 'error'
  const [thumbs,setThumbs] = useState<Record<string,string>>({});
  // Raw-Preview Cache: PDF-Basis -> Liste der Bild-URLs (aus Raw Files)
  const [rawPreviews, setRawPreviews] = useState<Record<string, string[]>>({});
  const pendingBasesRef = useRef<Set<string>>(new Set());
  // Einfache Warteschlange, um gleichzeitige PDF-Decodes zu begrenzen
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  // Seitenanzahl je PDF-Datei (key -> numPages)
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});

  async function processQueue(){
    if(busyRef.current) return; busyRef.current=true;
    while(queueRef.current.length){
      const k = queueRef.current.shift()!;
      // Falls inzwischen vorhanden (oder Fehler gesetzt) überspringen
      if(thumbs[k]) continue;
      const file = findFileByKey(k);
      if(!file || !file.downloadUrl) continue;
      // Falls bereits vom Server vorhandene Preview (previewImages[0]) -> direkt übernehmen
      if(file.previewImages && file.previewImages[0]){
        setThumbs(t=> ({ ...t, [k]: file.previewImages![0] }));
        continue;
      }
      try {
        // Dynamischer Import: legacy Build für Browser-Kompatibilität
        let pdfjs: any;
  pdfjs = await import('pdfjs-dist');
        if(!(pdfjs as any).getDocument){
          console.warn('pdfjs getDocument fehlt', pdfjs);
          throw new Error('pdfjs getDocument nicht verfügbar');
        }
  // Lokaler Worker (gleiche Origin) um CSP einzuhalten
  try { (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch {}
        let pdf: any;
        try {
          // Primär: direkt über URL
          pdf = await (pdfjs as any).getDocument({ url: file.downloadUrl, useSystemFonts: true, enableXfa: false }).promise;
        } catch(err){
          console.warn('Direkter PDF Laden fehlgeschlagen, versuche Blob', file.name, err);
          try {
            const resp = await fetch(file.downloadUrl);
            const ab = await resp.arrayBuffer();
            pdf = await (pdfjs as any).getDocument({ data: new Uint8Array(ab) }).promise;
          } catch(blobErr){
            console.warn('Blob Fallback fehlgeschlagen', file.name, blobErr);
            throw blobErr;
          }
        }
  // Seitenzahl merken
  try { if(typeof pdf?.numPages === 'number'){ setPageCounts(pc=> ({ ...pc, [k]: pdf.numPages })); } } catch {}
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
  // Keine serverseitige Speicherung mehr
      } catch (e){
        console.warn('PDF Thumbnail Fehler', file?.name, e);
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
  function findProductIdByFileKey(k:string){
    for(const p of items){
      if((p.files||[]).some(f=> f.key===k)) return p._id;
    }
    return null;
  }

  async function load(){
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams(); qs.set('all','1'); if(activeSubject) qs.set('subject', activeSubject);
      const r = await fetch(`/api/shop/products?${qs.toString()}`);
      const d = await r.json();
      if(r.ok && d.success){ setItems(d.items||[]); if(d.subjects) setSubjects(d.subjects); } else setError(d.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ void load(); },[activeSubject]);

  // Initiale Übernahme des URL-Parameters ?subject in den lokalen Zustand
  useEffect(()=>{
    try {
      const initial = (searchParams?.get('subject')||'').trim();
      if(initial) setActiveSubject(initial);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Hilfsfunktion: Subjekt setzen und URL aktualisieren (ohne Scroll/Neuaufbau)
  function applySubject(subj: string){
    setActiveSubject(subj);
    try {
      const sp = new URLSearchParams(window.location.search);
      if(subj) sp.set('subject', subj); else sp.delete('subject');
      const qs = sp.toString();
      const path = window.location.pathname + (qs? ('?'+qs):'');
      router.replace(path, { scroll: false });
    } catch {}
  }

  const isPdf = (f:ProductFile)=> /\.pdf$/i.test(f.name);
  const isImage = (f:ProductFile)=> /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name);
  function getPreviewImages(p: Product): { images: string[]; pdf?: ProductFile }{
    const all = (p.files||[]).filter(f=> !f.key?.startsWith('placeholder:'));
    const pdf = all.find(isPdf);
    const images = all.filter(isImage);
    if(pdf){
      const base = pdf.name.replace(/\.(pdf)$/i,'');
      const relImgs = images
        .filter(img=> new RegExp('^'+base.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$')+'-(\\d+)\.(png|jpe?g|webp)$','i').test(img.name))
        .map(img=> ({ url: img.downloadUrl, idx: parseInt((img.name.match(/-(\d+)\.(png|jpe?g|webp)$/i)||[])[1]||'0',10) }))
        .filter(x=> !!x.url)
        .sort((a,b)=> a.idx-b.idx)
        .map(x=> x.url!)
      ;
      if(relImgs.length) return { images: relImgs, pdf };
      // Fallback 1: serverseitig gespeicherte previewImages am PDF
      // Fallback: serverseitig gespeicherte previewImages am PDF
      const filePreviews = Array.isArray(pdf.previewImages) ? pdf.previewImages : [];
      if(filePreviews.length) return { images: filePreviews, pdf };
      // Fallback 2: Raw-Files automatisch per Namensschema <Base>-N.(png|jpg|webp)
      const cached = rawPreviews[base];
      if(cached && cached.length){ return { images: cached, pdf }; }
      // Asynchron laden, wenn noch nicht unterwegs
      if(!pendingBasesRef.current.has(base)){
        pendingBasesRef.current.add(base);
        // Wir holen alle Raw-Files mit q=Base und filtern clientseitig strikt auf das Schema
        (async()=>{
          try{
            const params = new URLSearchParams();
            params.set('q', base);
            params.set('limit','100');
            const r = await fetch(`/api/shop/raw-files?${params.toString()}`, { cache:'no-store' });
            const d = await r.json();
            if(r.ok && d.success && Array.isArray(d.items)){
              const matcher = new RegExp('^'+base.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$')+'-(\\d+)\.(png|jpe?g|webp)$','i');
              const list = d.items
                .map((it:any)=> ({ name: String(it.name||''), url: it.url }))
                .filter((it:any)=> matcher.test(it.name) && it.url)
                .map((it:any)=> ({ url: it.url, idx: parseInt((it.name.match(/-(\d+)\.(png|jpe?g|webp)$/i)||[])[1]||'0',10) }))
                .sort((a:any,b:any)=> a.idx-b.idx)
                .map((x:any)=> x.url as string);
              if(list.length){ setRawPreviews(prev=> ({ ...prev, [base]: list })); }
            }
          } catch {/* ignore */}
        })();
      }
      return { images: [], pdf };
    }
    // Kein PDF: zeige vorhandene Bilder
    const anyImgs = images.map(i=> i.downloadUrl!).filter(Boolean);
    return { images: anyImgs };
  }

  // Hinweis: Karussell-Steuerung erfolgt inline je Produktkarte

  function downloadFile(f:ProductFile){ if(!f.downloadUrl) return; try{ const a=document.createElement('a'); a.href=f.downloadUrl; a.download=f.name||'download'; a.rel='noopener'; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),0);} catch { window.open(f.downloadUrl,'_blank'); } }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Material-Downloads</h1>
      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        <button onClick={()=>applySubject('')} className={`px-3 py-1 rounded border ${!activeSubject?'bg-indigo-600 text-white border-indigo-600':'bg-white hover:bg-gray-50'}`}>Alle Fächer</button>
        {subjects.map(s=> (
          <button key={s} onClick={()=>applySubject(s)} className={`px-3 py-1 rounded border ${activeSubject===s?'bg-indigo-600 text-white border-indigo-600':'bg-white hover:bg-gray-50'}`}>{s}</button>
        ))}
      </div>
      {loading && <div className="text-sm text-gray-500">Lade…</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      {!loading && !error && items.length===0 && <div className="text-sm text-gray-500">Keine Produkte vorhanden.</div>}
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map(p=>{
          const { images, pdf } = getPreviewImages(p);
          const previews = images;
          const count = previews.length;
          const idx = Math.min(activeIdx[p._id]||0, Math.max(0, count-1));
          const setActive = (dir:number)=> setActiveIdx(prev=>{ const cur = prev[p._id]||0; if(!count) return prev; const next = ((cur+dir)%count + count) % count; return { ...prev, [p._id]: next }; });
          // Touch-Wischen (pro Karte lokale Variablen im Closure)
          let startX = 0, startY = 0, startT = 0; let lastDX = 0; let locked = false;
          const onTouchStart = (e: React.TouchEvent)=>{
            const t = e.touches[0]; startX = t.clientX; startY = t.clientY; startT = Date.now(); lastDX = 0; locked = false;
          };
          const onTouchMove = (e: React.TouchEvent)=>{
            const t = e.touches[0]; const dx = t.clientX - startX; const dy = t.clientY - startY; lastDX = dx;
            if(!locked){
              if(Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2){ locked = true; }
            }
            if(locked){ e.preventDefault(); }
          };
          const onTouchEnd = ()=>{
            if(!locked) return;
            const dt = Date.now() - startT; const adx = Math.abs(lastDX);
            if(adx > 40 || (adx > 20 && dt < 300)){
              setActive(lastDX > 0 ? -1 : 1);
            }
          };
          // Falls keine Preview-Bilder und es ein PDF gibt: Render-Fallback erster Seite (nur Anzeige)
          const thumbKey = pdf?.key || '';
          if(!count && pdf) enqueueThumb(pdf);
          const currentImg = count? previews[idx] : (thumbs[thumbKey] && thumbs[thumbKey] !== 'error' ? thumbs[thumbKey] : undefined);
          // Seitenanzahl anzeigen: bevorzugt Anzahl Preview-Bilder, sonst pdfjs numPages falls geladen
          const totalPages = count || (thumbKey ? pageCounts[thumbKey] : undefined) || undefined;
          return (
            <div key={p._id} className="group bg-white border rounded shadow-sm flex flex-col overflow-hidden">
              <div className="relative bg-white aspect-[210/297] overflow-hidden touch-pan-y w-full" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                {currentImg ? (
                  <img src={currentImg} alt={p.title} className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="text-[11px] text-gray-400">{pdf? (thumbs[thumbKey]==='error' ? 'Keine Vorschau' : 'Lade Vorschau…') : 'Keine Vorschau'}</div>
                )}
                {count>1 && (
                  <>
                    <button onClick={()=>setActive(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white text-base px-3 py-2 rounded shadow-md border border-gray-200 z-10">‹</button>
                    <button onClick={()=>setActive(1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white text-base px-3 py-2 rounded shadow-md border border-gray-200 z-10">›</button>
                    <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
                      {previews.map((_,i)=>(<span key={i} className={`w-2 h-2 rounded-full ${i===idx?'bg-indigo-600':'bg-gray-300'}`} />))}
                    </div>
                  </>
                )}
              </div>
              {/* ZIP Download direkt unter dem Bild */}
              <div className="px-4 pt-3">
                <button onClick={()=> {
                  const a=document.createElement('a');
                  a.href=`/api/shop/products/${p._id}/download-zip`;
                  a.download=`${p.title.replace(/[^a-zA-Z0-9._-]+/g,'_')}.zip`;
                  document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),0);
                }} className="w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded py-1.5 font-medium">Alle Dateien (ZIP)</button>
              </div>
              <div className="flex-1 flex flex-col p-4 gap-2">
                <h3 className="font-semibold text-base leading-tight line-clamp-2" title={p.title}>{p.title}</h3>
                {p.description && <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-4">{p.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
                  {typeof p.price==='number' && (
                    <span className="font-medium text-gray-700">
                      {p.price.toFixed(2)} € {typeof totalPages==='number' && totalPages>0 && (<span className="font-normal text-gray-500">• {totalPages} Seiten</span>)}
                    </span>
                  )}
                  <span>{(p.files||[]).filter(f=>!f.key?.startsWith('placeholder:')).length} Datei{((p.files||[]).filter(f=>!f.key?.startsWith('placeholder:')).length)!==1?'en':''}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}