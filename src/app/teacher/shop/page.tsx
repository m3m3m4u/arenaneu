"use client";
import { useEffect, useState } from 'react';

interface Product { _id:string; title:string; description?:string; category?:string; files?: any[]; isPublished:boolean; createdAt?:string; }

export default function TeacherShopPage(){
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploadingId, setUploadingId] = useState<string|null>(null);

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

  async function create(){
    if(!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/shop/products',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title:newTitle, description:newDesc, category:newCat, isPublished:true })});
      const d = await res.json();
      if(res.ok && d.success){ setNewTitle(''); setNewDesc(''); setNewCat(''); await load(); }
      else setError(d.error||'Fehler beim Erstellen');
    } catch { setError('Netzwerkfehler'); }
    setCreating(false);
  }

  async function uploadFile(id: string, file: File){
    const form = new FormData(); form.append('file', file);
    setUploadingId(id);
    try {
      const res = await fetch(`/api/shop/products/${id}/files`, { method:'POST', body: form });
      const d = await res.json();
      if(!(res.ok && d.success)){ alert(d.error||'Upload fehlgeschlagen'); }
      else await load();
    } catch { alert('Netzwerkfehler'); }
    setUploadingId(null);
  }

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Material-Download (Produkte)</h1>
      <section className="mb-8 bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Neues Produkt</h2>
        <div className="flex flex-col gap-2 max-w-md">
          <input placeholder="Titel" value={newTitle} onChange={e=>setNewTitle(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          <textarea placeholder="Beschreibung" value={newDesc} onChange={e=>setNewDesc(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          <input placeholder="Kategorie" value={newCat} onChange={e=>setNewCat(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          <button onClick={create} disabled={creating} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">{creating?'Erstelle...':'Erstellen & Veröffentlichen'}</button>
        </div>
      </section>
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
                <label className="text-xs cursor-pointer inline-block bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                  Datei hochladen
                  <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFile(p._id,f); e.target.value=''; }} />
                </label>
                {uploadingId===p._id && <div className="text-[11px] text-gray-500">Lade hoch...</div>}
                <ul className="space-y-1 text-[11px] max-h-24 overflow-auto">
                  {p.files?.map(f=> <li key={f.key} className="truncate">{f.name}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
