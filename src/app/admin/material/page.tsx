"use client";
import { useEffect, useState, useCallback } from 'react';
import { CATEGORIES } from '@/lib/categories';

interface Product { _id:string; title:string; description?:string; category?:string; isPublished:boolean; files?: any[]; price?:number; }
interface RawFile { id:string; name:string; key:string; size:number; url:string; createdAt:string; contentType?:string; }
interface ExcelPreviewMaterial { title:string; category?:string; description?:string; price:number; files:string[]; normalizedCategory?:string; }

// Neuer Admin Bereich: Produkte aus Raw-Dateien erstellen, Raw-Datei Bibliothek & Excel Import Preview
export default function AdminMaterialPage(){
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [newCat, setNewCat] = useState('');
  const [price, setPrice] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [categories, setCategories] = useState<string[]>(CATEGORIES as unknown as string[]);
  const [uploadingProductFile, setUploadingProductFile] = useState<string|null>(null);
  const [createError, setCreateError] = useState<string|null>(null);

  // Raw File Library
  const [rawFiles, setRawFiles] = useState<RawFile[]>([]);
  const [rawPage, setRawPage] = useState(1);
  const [rawTotal, setRawTotal] = useState(0);
  const [rawSearch, setRawSearch] = useState('');
  const [rawUploading, setRawUploading] = useState(false);
  const [selectedRawIds, setSelectedRawIds] = useState<string[]>([]);

  // Excel Import
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewMaterial[]|null>(null);
  const [excelUnmatched, setExcelUnmatched] = useState<string[]>([]);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelResult, setExcelResult] = useState<any|null>(null);

  const toggleRaw = (id:string)=> setSelectedRawIds(ids=> ids.includes(id)? ids.filter(x=>x!==id): [...ids,id]);

  const loadRaw = useCallback(async(page=1)=>{
    try {
      const r = await fetch(`/api/shop/raw-files?page=${page}&limit=30&q=${encodeURIComponent(rawSearch)}`);
      const d = await r.json();
      if(r.ok && d.success){ setRawFiles(d.items); setRawTotal(d.total); setRawPage(d.page); }
    } catch{/*ignore*/}
  },[rawSearch]);

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
    setCreating(true); setCreateError(null);
    try {
      const payload: any = { title: title.trim(), description: desc.trim(), rawFileIds: selectedRawIds };
      if(chosenCat && chosenCat.trim()) payload.category = chosenCat.trim();
      if(price.trim()) payload.price = Number(price.replace(',','.'))||0;
      const r = await fetch('/api/shop/products', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if(!(r.ok && d.success)) setCreateError(d.error||'Erstellen fehlgeschlagen');
      else { setTitle(''); setDesc(''); setCat(''); setNewCat(''); setPrice(''); setSelectedRawIds([]); await load(); }
    } catch { setError('Netzwerkfehler'); }
    setCreating(false);
  }

  async function uploadFile(id: string, file: File){
    const form = new FormData(); form.append('file', file);
    setUploadingProductFile(id);
    try {
      const r = await fetch(`/api/shop/products/${id}/files`, { method:'POST', body: form });
      const d = await r.json();
      if(!(r.ok && d.success)){ alert(d.error||'Upload fehlgeschlagen'); }
      else await load();
    } catch { alert('Netzwerkfehler'); }
    setUploadingProductFile(null);
  }

  async function removeProductFile(productId:string, key:string){
    if(!confirm('Datei wirklich entfernen?')) return;
    try {
      const r = await fetch(`/api/shop/products/${productId}/files?key=${encodeURIComponent(key)}`, { method:'DELETE' });
      const d = await r.json();
      if(!(r.ok && d.success)) alert(d.error||'Entfernen fehlgeschlagen'); else load();
    } catch { alert('Netzwerkfehler'); }
  }

  async function uploadRawFile(file: File){
    setRawUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      const r = await fetch('/api/shop/raw-files', { method:'POST', body: form });
      const d = await r.json();
      if(!(r.ok && d.success)) alert(d.error||'Raw Upload fehlgeschlagen'); else loadRaw(rawPage);
    } catch { alert('Netzwerkfehler'); }
    setRawUploading(false);
  }

  async function handleExcel(file: File, preview=true){
    setExcelLoading(true); setExcelResult(null); setExcelUnmatched([]);
    try {
      const form = new FormData(); form.append('file', file);
      const url = '/api/shop/admin/materials/bulk-from-excel'+ (preview?'?mode=preview':'');
      const r = await fetch(url, { method:'POST', body: form });
      const d = await r.json();
      if(!(r.ok && d.success)){ alert(d.error||'Excel Import Fehler'); }
      else if(preview){ setExcelPreview(d.materials||null); }
      else { setExcelResult(d); setExcelUnmatched(d.unmatched||[]); }
    } catch { alert('Netzwerkfehler'); }
    setExcelLoading(false);
  }

  function applyExcelPreview(){
    if(!excelPreview) return;
    // Für jedes Preview-Material versuchen wir zu matchen: Der Nutzer kann später Produkte einzeln editieren – hier nur Info.
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Material-Upload (Admin)</h1>
        <p className="text-sm text-gray-600 mt-1">Produkte anlegen und Dateien hochladen. Lehrkräfte sehen nur den Downloadbereich.</p>
      </header>

      <section className="bg-white border rounded shadow-sm p-5 space-y-4">
        <h2 className="font-semibold">Neues Produkt aus Raw-Dateien</h2>
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
            <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Preis" className="border rounded px-2 py-2 text-sm w-28" />
            <button disabled={!title.trim()||creating|| (cat==='__new' && !newCat.trim())} onClick={createProduct} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-40">Anlegen</button>
          </div>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Beschreibung (optional)" className="border rounded px-3 py-2 text-sm w-full min-h-[70px] resize-y" />
          <div className="border-t pt-3 space-y-2 text-[11px]">
            <p>Raw-Dateien auswählen (unten in Bibliothek hochladen & anklicken). Gewählt: {selectedRawIds.length}</p>
            {createError && <div className="text-xs text-red-600">{createError}</div>}
          </div>
        </div>
      </section>

      <section className="bg-white border rounded shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h2 className="font-semibold">Raw-Dateien</h2>
          <div className="flex gap-2 items-center text-xs">
            <input value={rawSearch} onChange={e=>setRawSearch(e.target.value)} placeholder="Suche" className="border rounded px-2 py-1" />
            <button onClick={()=>loadRaw(1)} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">Suche</button>
            <label className="cursor-pointer px-2 py-1 border rounded bg-indigo-50 hover:bg-indigo-100">
              + Upload
              <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadRawFile(f); e.target.value=''; }} />
            </label>
            {rawUploading && <span>Upload…</span>}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {rawFiles.map(f=>{
            const sel = selectedRawIds.includes(f.id);
            return (
              <button key={f.id} onClick={()=>toggleRaw(f.id)} className={`border rounded p-2 text-left flex flex-col gap-1 text-[11px] hover:bg-gray-50 ${sel?'ring-2 ring-blue-500 bg-blue-50':''}`}>
                <span className="font-medium truncate" title={f.name}>{f.name}</span>
                <span className="text-gray-500">{Math.round(f.size/1024)} KB</span>
                <span className="text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</span>
              </button>
            );
          })}
        </div>
        {rawTotal>rawFiles.length && (
          <div className="flex justify-center mt-2">
            <button onClick={()=>{ loadRaw(rawPage+1); }} className="text-xs px-3 py-1 border rounded">Mehr…</button>
          </div>
        )}
      </section>

      <section className="bg-white border rounded shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold">Excel Import</h2>
          <div className="flex gap-2 text-xs items-center">
            <label className="cursor-pointer px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">
              Datei wählen (Preview)
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleExcel(f,true); e.target.value=''; }} />
            </label>
            {excelPreview && (
              <label className="cursor-pointer px-2 py-1 border rounded bg-indigo-50 hover:bg-indigo-100">
                Commit (selbe Datei erneut)
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleExcel(f,false); e.target.value=''; }} />
              </label>
            )}
            {excelLoading && <span>Lädt…</span>}
          </div>
        </div>
        {excelPreview && (
          <div className="text-[11px] overflow-auto">
            <p className="mb-1 font-medium">Preview ({excelPreview.length} Materialien)</p>
            <table className="w-full text-[11px] border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-1 py-0.5 text-left">Titel</th>
                  <th className="border px-1 py-0.5 text-left">Kategorie</th>
                  <th className="border px-1 py-0.5 text-left">Preis</th>
                  <th className="border px-1 py-0.5 text-left">Dateien</th>
                </tr>
              </thead>
              <tbody>
                {excelPreview.map(m=> (
                  <tr key={m.title} className="hover:bg-gray-50">
                    <td className="border px-1 py-0.5 whitespace-nowrap max-w-[160px] truncate" title={m.title}>{m.title}</td>
                    <td className="border px-1 py-0.5">{m.category||''}</td>
                    <td className="border px-1 py-0.5">{m.price||0}</td>
                    <td className="border px-1 py-0.5">{m.files.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-gray-500">Zum Commit dieselbe Datei im Commit Button auswählen.</p>
          </div>
        )}
        {excelResult && (
          <div className="text-[11px] space-y-2">
            <p className="font-medium">Ergebnis: {excelResult.count} erstellt / {excelResult.totalInput} Input (Skips: {excelResult.skipped?.length||0})</p>
            {excelResult.created?.length>0 && (
              <ul className="list-disc pl-4">
                {excelResult.created.map((c:any)=>(<li key={c.id}>{c.title} (linked {c.linked}, placeholders {c.placeholders})</li>))}
              </ul>
            )}
            {excelUnmatched.length>0 && <p className="text-orange-600">Unmatched Dateien: {excelUnmatched.slice(0,20).join(', ')}{excelUnmatched.length>20?' …':''}</p>}
          </div>
        )}
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
              {uploadingProductFile===p._id && <div className="text-[11px] text-gray-500">Upload läuft...</div>}
              <ul className="space-y-1 text-[11px] max-h-24 overflow-auto">
                {p.files?.map(f=> {
                  const placeholder = f.key?.startsWith('placeholder:');
                  return (
                    <li key={f.key} className="flex items-center gap-2">
                      {placeholder ? (
                        <span title="Platzhalter" className="text-orange-600 truncate">{f.name}</span>
                      ) : (
                        <a className="text-blue-600 hover:underline truncate" href={f.downloadUrl||'#'} target="_blank" rel="noopener noreferrer">{f.name}</a>
                      )}
                      <button onClick={()=>removeProductFile(p._id, f.key)} className="text-red-500 hover:underline shrink-0">x</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
