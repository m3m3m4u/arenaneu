"use client";
import { useEffect, useState } from 'react';

interface PdfThumbsProps { url:string; maxPages?:number; onOpen?:(page:number)=>void; }

// Erzeugt kleine Vorschaubilder (Canvas -> DataURL) für die ersten Seiten einer PDF
export default function PdfThumbs({ url, maxPages=4, onOpen }: PdfThumbsProps){
  const [thumbs,setThumbs] = useState<Array<{page:number; data:string}>>([]);
  const [err,setErr] = useState<string|undefined>();
  useEffect(()=>{
    let dead=false; (async()=>{
      try {
        setErr(undefined); setThumbs([]);
        const pdfjsLib: any = await import('pdfjs-dist');
        if(pdfjsLib.GlobalWorkerOptions){
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.2.67'}/pdf.worker.min.js`;
        }
        const task = pdfjsLib.getDocument(url); const pdf = await task.promise; if(dead) return;
        const total = Math.min(pdf.numPages, maxPages);
        const nextThumbs: Array<{page:number; data:string}> = [];
        for(let p=1;p<=total;p++){
          try {
            const pageObj = await pdf.getPage(p); if(dead) return;
            const viewport = pageObj.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d'); if(!ctx) continue;
            canvas.width = viewport.width; canvas.height = viewport.height;
            await (pageObj as any).render({ canvasContext: ctx, canvas, viewport }).promise;
            nextThumbs.push({ page:p, data: canvas.toDataURL('image/png') });
          } catch {/*ignore single page*/}
        }
        if(!dead) setThumbs(nextThumbs);
      } catch(e:any){ if(!dead) setErr('PDF Vorschau fehlgeschlagen'); }
    })();
    return ()=>{ dead=true; };
  },[url,maxPages]);
  if(err) return <div className="text-[10px] text-red-500">{err}</div>;
  if(!thumbs.length) return <div className="text-[10px] text-gray-400">Lade Vorschau…</div>;
  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {thumbs.map(t=> (
        <button key={t.page} onClick={()=> onOpen?.(t.page)} className="border rounded overflow-hidden bg-white hover:shadow focus:outline-none">
          <img src={t.data} alt={`Seite ${t.page}`} className="h-16 w-auto block" />
        </button>
      ))}
    </div>
  );
}