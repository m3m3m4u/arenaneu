"use client";
import { useEffect, useState, useCallback } from 'react';
import { CATEGORIES } from '@/lib/categories';

interface Product { _id:string; title:string; description?:string; category?:string; isPublished:boolean; files?: any[]; }

// Einfacher Admin-Upload-Bereich für Shop-Materialien
export default function AdminMaterialPage(){
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [newCat, setNewCat] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [categories, setCategories] = useState<string[]>(CATEGORIES as unknown as string[]);
  const [uploading, setUploading] = useState<string|null>(null);
  const [preUploads, setPreUploads] = useState<Array<{ key:string; name:string; size:number }>>([]);
  const [tempUploading, setTempUploading] = useState(false);
  const [createError, setCreateError] = useState<string|null>(null);

  const uploadTemp = useCallback(async (file: File)=>{
    setTempUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      const r = await fetch('/api/shop/temp-files', { method:'POST', body: form });
      const d = await r.json();
      if(r.ok && d.success){
        const arr = Array.isArray(d.files)? d.files: (d.temp? [d.temp]: []);
        if(arr.length){
          setPreUploads(p=> [...p, ...arr.map((x:any)=> ({ key:x.key, name:x.name, size:x.size }))]);
        } else {
          alert('Kein Dateiobjekt im Response');
        }
      } else {
        alert(d.error||'Upload fehlgeschlagen');
      }
    } catch { alert('Netzwerkfehler'); }
    setTempUploading(false);
  },[]);

  async function load(){
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/shop/products');
      const d = await r.json();
      if(r.ok && d.success){ setProducts(d.items||[]); } else { setError(d.error||'Fehler'); }
      // Kurs-Kategorien nachladen (separat, nicht an Produkte Response gebunden)
      try {
        const rc = await fetch('/api/course-categories');
        const dc = await rc.json();
        if(rc.ok && dc.success && Array.isArray(dc.categories) && dc.categories.length){
          setCategories(dc.categories);
        }
      } catch {}
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  async function createProduct(){
    if(!title.trim()) return;
    const chosenCat = cat === '__new' ? newCat : cat;
    setCreating(true);
    setCreateError(null);
    try {
      const payload: any = { title: title.trim(), description: desc.trim() };
      if(chosenCat && chosenCat.trim()) payload.category = chosenCat.trim();
      if(preUploads.length) payload.tempKeys = preUploads.map(f=>f.key);
      const r = await fetch('/api/shop/products', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if(!(r.ok && d.success)) setCreateError(d.error||'Erstellen fehlgeschlagen');
      else { setTitle(''); setDesc(''); setCat(''); setNewCat(''); setPreUploads([]); await load(); }
    } catch { setError('Netzwerkfehler'); }
    setCreating(false);
  }

  async function uploadFile(id: string, file: File){
    const form = new FormData(); form.append('file', file);
    setUploading(id);
    try {
      const r = await fetch(`/api/shop/products/${id}/files`, { method:'POST', body: form });
      const d = await r.json();
      if(!(r.ok && d.success)){ alert(d.error||'Upload fehlgeschlagen'); }
      else await load();
    } catch { alert('Netzwerkfehler'); }
    setUploading(null);
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Material-Upload (Admin)</h1>
        <p className="text-sm text-gray-600 mt-1">Produkte anlegen und Dateien hochladen. Lehrkräfte sehen nur den Downloadbereich.</p>
      </header>

      <section className="bg-white border rounded shadow-sm p-5 space-y-4">
        <h2 className="font-semibold">Neues Produkt</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titel" className="border rounded px-3 py-2 text-sm flex-1" />
            <div className="flex flex-col gap-2 w-48">
              <select value={cat} onChange={e=>{ setCat(e.target.value); }} className="border rounded px-2 py-2 text-sm bg-white">
                <option value="">Kategorie wählen</option>
                {categories.map(c=> <option key={c} value={c}>{c}</option>)}
                <option value="__new">+ Neue Kategorie...</option>
              </select>
              {cat==='__new' && (
                <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Neue Kategorie" className="border rounded px-2 py-1 text-xs" />
              )}
            </div>
            <button disabled={!title.trim()||creating|| (cat==='__new' && !newCat.trim())} onClick={createProduct} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-40">Anlegen</button>
          </div>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Beschreibung (optional)" className="border rounded px-3 py-2 text-sm w-full min-h-[70px] resize-y" />
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs cursor-pointer inline-block bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded border">
                Datei vorab hochladen
                <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadTemp(f); e.target.value=''; }} />
              </label>
              {tempUploading && <span className="text-[11px] text-gray-500">Upload…</span>}
              {preUploads.length>0 && <span className="text-[11px] text-gray-600">{preUploads.length} Datei(en) bereit</span>}
            </div>
            {preUploads.length>0 && (
              <ul className="text-[11px] bg-gray-50 border rounded p-2 max-h-28 overflow-auto space-y-1">
                {preUploads.map(f=> (
                  <li key={f.key} className="flex items-center gap-2">
                    <span className="truncate" title={f.name}>{f.name}</span>
                    <span className="text-gray-400">{Math.round(f.size/1024)} KB</span>
                    <button onClick={()=> setPreUploads(p=> p.filter(x=> x.key!==f.key))} className="text-red-500 hover:underline">x</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-gray-500">Vorab hochgeladene Dateien werden beim Anlegen verschoben.</p>
            {createError && <div className="text-xs text-red-600">{createError}</div>}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-semibold">Produkte</h2>
          <div className="flex items-center gap-2 text-xs">
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="border rounded px-2 py-1 bg-white">
              <option value="">Alle Kategorien</option>
              {categories.map(c=> <option key={c} value={c}>{c}</option>)}
            </select>
            {filterCat && <button onClick={()=>setFilterCat('')} className="text-blue-600 hover:underline">Zurücksetzen</button>}
          </div>
        </div>
        {loading && <div className="text-sm text-gray-500">Lade...</div>}
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {!loading && !products.length && <div className="text-sm text-gray-500">Keine Produkte gefunden.</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.filter(p=> !filterCat || p.category===filterCat).map(p=> (
            <div key={p._id} className="bg-white border rounded p-4 shadow-sm flex flex-col gap-3">
              <h3 className="font-semibold text-lg">{p.title}</h3>
              <div className="flex flex-wrap gap-2 items-center text-[11px] text-gray-500">
                {p.category && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">{p.category}</span>}
                <span>{p.files?.length||0} Dateien</span>
              </div>
              {p.description && <p className="text-[11px] leading-snug text-gray-600 line-clamp-4 whitespace-pre-line">{p.description}</p>}
              <label className="text-xs cursor-pointer inline-block bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                Datei hochladen
                <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFile(p._id,f); e.target.value=''; }} />
              </label>
              {uploading===p._id && <div className="text-[11px] text-gray-500">Upload läuft...</div>}
              <ul className="space-y-1 text-[11px] max-h-24 overflow-auto">
                {p.files?.map(f=> <li key={f.key} className="truncate"><a className="text-blue-600 hover:underline" href={f.downloadUrl||'#'} target="_blank" rel="noopener noreferrer">{f.name}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
