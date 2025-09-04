"use client";
import { useEffect, useRef, useState } from 'react';

// Dynamischer Import von pdfjs-dist nur im Client
interface PdfPreviewProps { url: string; onClose: ()=>void; }
export default function PdfPreview({ url, onClose }: PdfPreviewProps){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [page,setPage] = useState(1);
  const [numPages,setNumPages] = useState<number|undefined>();
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|undefined>();
  const [scale,setScale] = useState(1);

  // pdf Instanz referenz zwischenspeichern
  const pdfRef = useRef<any>(null);

  async function renderPage(p:number, pdf:any){
    const pageObj = await pdf.getPage(p);
    const viewport = pageObj.getViewport({ scale });
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext('2d'); if(!ctx) return;
    canvas.width = viewport.width; canvas.height = viewport.height;
    // pdfjs v5 verlangt canvas + canvasContext; Types meckern sonst -> any cast
    await (pageObj as any).render({ canvasContext: ctx, canvas, viewport }).promise;
  }

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        setLoading(true); setError(undefined);
        // @ts-ignore
        const pdfjsLib = await import('pdfjs-dist');
        // Worker setzen (Fallback CDN falls bundler Pfad nicht passt)
        // @ts-ignore
        if(pdfjsLib.GlobalWorkerOptions){
          // @ts-ignore
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.2.67'}/pdf.worker.min.js`;
        }
        // @ts-ignore
        const task = pdfjsLib.getDocument(url);
        const pdf = await task.promise;
        if(cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        await renderPage(1, pdf);
      } catch(e:any){ if(!cancelled) setError('PDF konnte nicht geladen werden'); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[url, scale]);

  async function changePage(delta:number){
    const pdf = pdfRef.current; if(!pdf) return;
    const target = page + delta;
    if(target<1 || (numPages && target>numPages)) return;
    setPage(target);
    try { await renderPage(target, pdf); } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
      <div className="p-2 flex items-center gap-2 text-xs text-white bg-gray-900/70">
        <button onClick={onClose} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded">Schließen</button>
        <span className="opacity-70">PDF Vorschau</span>
        {numPages && <span className="ml-2">Seite {page}/{numPages}</span>}
        <div className="flex items-center gap-1 ml-4">
          <button disabled={page<=1} onClick={()=>changePage(-1)} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">‹</button>
          <button disabled={numPages? page>=numPages : false} onClick={()=>changePage(1)} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">›</button>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button onClick={()=>setScale(s=> Math.max(0.5, s-0.1))} className="px-2 py-1 bg-gray-700 rounded">-</button>
          <span>{Math.round(scale*100)}%</span>
          <button onClick={()=>setScale(s=> Math.min(3, s+0.1))} className="px-2 py-1 bg-gray-700 rounded">+</button>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto underline text-blue-300">In neuem Tab öffnen</a>
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        {loading && <div className="text-white text-sm">Lade…</div>}
        {error && <div className="text-red-300 text-sm">{error}</div>}
        <canvas ref={canvasRef} className="shadow max-w-full h-auto" />
      </div>
    </div>
  );
}
