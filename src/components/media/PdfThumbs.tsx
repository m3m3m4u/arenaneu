"use client";
import { useEffect, useState } from 'react';

interface PdfThumbsProps { url:string; maxPages?:number; onOpen?:(page:number)=>void; className?:string; }

// Erzeugt kleine Vorschaubilder (Canvas -> DataURL) für die ersten Seiten einer PDF
export default function PdfThumbs({ url, maxPages=4, onOpen, className }: PdfThumbsProps){
  const [thumbs,setThumbs] = useState<Array<{page:number; data:string}>>([]);
  const [err,setErr] = useState<string|undefined>();
  const [loading,setLoading] = useState(false);

  useEffect(()=>{
    let dead=false;
    (async()=>{
      setLoading(true); setErr(undefined); setThumbs([]);
      try {
        // Versuche Standard-API zu laden
  const pdfjsLib: any = await import('pdfjs-dist');
        if(!pdfjsLib.getDocument){
          console.error('[PdfThumbs] getDocument fehlt auf pdfjsLib', Object.keys(pdfjsLib));
          throw new Error('pdfjs getDocument nicht gefunden');
        }
  if(pdfjsLib.GlobalWorkerOptions){
          // Lokalen Worker ausliefern, um CSP (script-src 'self') einzuhalten
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', window.location.origin).toString();
        }
        console.debug('[PdfThumbs] Lade PDF', url);
  const task = pdfjsLib.getDocument({ url, useSystemFonts: true, enableXfa: false, disableCreateObjectURL: true, withCredentials: false });
        const pdf = await task.promise; if(dead) return;
        console.debug('[PdfThumbs] PDF Seiten', pdf.numPages);
        const total = Math.min(pdf.numPages, maxPages);
        const nextThumbs: Array<{page:number; data:string}> = [];
        for(let p=1;p<=total;p++){
          if(dead) return;
            try {
              const pageObj = await pdf.getPage(p); if(dead) return;
              const viewport = pageObj.getViewport({ scale: 0.3 });
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d'); if(!ctx) continue;
              canvas.width = viewport.width; canvas.height = viewport.height;
              await (pageObj as any).render({ canvasContext: ctx, canvas, viewport }).promise;
              nextThumbs.push({ page:p, data: canvas.toDataURL('image/png') });
            } catch(pageErr){
              console.warn('[PdfThumbs] Seite konnte nicht gerendert werden', p, pageErr);
            }
        }
        if(!dead) setThumbs(nextThumbs);
      } catch(e:any){
        console.error('[PdfThumbs] Fehler', e);
        if(!dead) setErr('PDF Vorschau fehlgeschlagen');
      } finally {
        if(!dead) setLoading(false);
      }
    })();
    return ()=>{ dead=true; };
  },[url,maxPages]);

  if(err) return <div className="text-[10px] text-red-500">{err}</div>;
  if(loading && !thumbs.length) return <div className="text-[10px] text-gray-400">Lade Vorschau…</div>;
  if(!thumbs.length) return null;
  return (
    <div className={"flex gap-1 flex-wrap mt-1 " + (className||'')}>
      {thumbs.map(t=> (
        <button key={t.page} onClick={()=> onOpen?.(t.page)} className="border rounded overflow-hidden bg-white hover:shadow focus:outline-none">
          <img src={t.data} alt={`Seite ${t.page}`} className="h-16 w-auto block" />
        </button>
      ))}
    </div>
  );
}