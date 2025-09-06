"use client";
import { useEffect, useState } from 'react';

interface Product { _id:string; title:string; description?:string; category?:string; files?: any[]; isPublished:boolean; createdAt?:string; }

export default function TeacherShopPage(){
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [uploadingId, setUploadingId] = useState<string|null>(null);
  const [role, setRole] = useState<string>('');

  async function load(){
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/shop/products');
      const data = await res.json();
      if(res.ok && data.success){ setItems(data.items||[]); } else { setError(data.error||'Fehler'); }
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ void load(); }, []);

  useEffect(()=>{
    try {
      // Rolle aus sessionStorage (Fallback) – echte Schutzlogik serverseitig
      const r = sessionStorage.getItem('user:role'); if(r) setRole(r);
    } catch {}
  },[]);

  async function uploadFile(id: string, file: File){
    if(role !== 'admin'){ alert('Nur Admin kann Dateien hochladen'); return; }
    const form = new FormData(); form.append('file', file);
    setUploadingId(id);
    try {
      const res = await fetch(`/api/shop/products/${id}/files?syncPreview=1`, { method:'POST', body: form });
      const d = await res.json();
      if(!(res.ok && d.success)){ alert(d.error||'Upload fehlgeschlagen'); }
      else await load();
    } catch { alert('Netzwerkfehler'); }
    setUploadingId(null);
  }

  return (
    <main className="max-w-5xl mx-auto p-6">
  <h1 className="text-2xl font-bold mb-6">Material-Download (Produkte)</h1>
      {role==='admin' && (
        <div className="mb-6 text-xs bg-blue-50 border border-blue-200 rounded p-3">
          Admin: Upload-Schaltflächen sichtbar. Lehrkräfte sehen nur Downloads.
        </div>
      )}
      <section>
        <h2 className="font-semibold mb-4">Produkte</h2>
        {loading && <div className="text-gray-500 text-sm">Lade...</div>}
        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
        {!loading && items.length===0 && <div className="text-gray-500 text-sm">Keine Produkte.</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(p=>{
            const mainPdf = p.files?.find(f=>/pdf$/i.test(f.contentType||''));
            return (
              <div key={p._id} className="bg-white border rounded shadow-sm p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">{p.title}</h3>
                <p className="text-xs text-gray-600 line-clamp-3">{p.description}</p>
                <div className="text-[11px] text-gray-500">{p.files?.length||0} Dateien</div>
                {mainPdf && <div className="text-[11px] text-indigo-600">PDF vorhanden (Vorschau später)</div>}
                {role==='admin' && (
                  <label className="text-xs cursor-pointer inline-block bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                    Datei hochladen
                    <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFile(p._id,f); e.target.value=''; }} />
                  </label>
                )}
                {uploadingId===p._id && <div className="text-[11px] text-gray-500">Lade hoch...</div>}
                <ul className="space-y-1 text-[11px] max-h-24 overflow-auto">
                  {p.files?.map(f=> <li key={f.key} className="truncate"><a className="text-blue-600 hover:underline" href={f.downloadUrl||'#'} target="_blank" rel="noopener noreferrer">{f.name}</a></li>)}
                </ul>
              </div>
            );
          })}
        </div>
        {role!=='admin' && (
          <div className="mt-6 text-[11px] text-gray-500">Dateiupload nur für Admin-Benutzer möglich.</div>
        )}
      </section>
    </main>
  );
}
