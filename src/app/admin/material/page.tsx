"use client";
import { useEffect, useState, useCallback } from 'react';
import { CATEGORIES } from '@/lib/categories';

interface Product { _id:string; title:string; description?:string; category?:string; isPublished:boolean; files?: any[]; price?:number; }
interface RawFile { id:string; name:string; key:string; size:number; url:string; createdAt:string; contentType?:string; }
interface ExcelPreviewMaterial { title:string; category?:string; description?:string; price:number; files:string[]; normalizedCategory?:string; }

// Neuer Admin Bereich: Produkte aus Raw-Dateien erstellen, Raw-Datei Bibliothek & Excel Import Preview
export default function AdminMaterialPage(){
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'manage'|'excel'|'preview'>('manage');
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
  const [rawDeletingId, setRawDeletingId] = useState<string|null>(null);

  // Excel Import
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewMaterial[]|null>(null);
  const [excelUnmatched, setExcelUnmatched] = useState<string[]>([]);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelResult, setExcelResult] = useState<any|null>(null);
  const [excelToken, setExcelToken] = useState<string|null>(null);
  // PDF Preview
  const [pdfUrl,setPdfUrl] = useState<string|null>(null);

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
  const r = await fetch('/api/shop/products?all=1');
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

  async function deleteRawFile(id:string){
    if(!confirm('Roh-Datei wirklich löschen?')) return;
    setRawDeletingId(id);
    try {
      const r = await fetch('/api/shop/raw-files?id='+encodeURIComponent(id), { method:'DELETE' });
      const d = await r.json();
      if(!(r.ok && d.success)) alert(d.error||'Löschen fehlgeschlagen');
      else {
        setSelectedRawIds(x=> x.filter(i=> i!==id));
        await loadRaw(1);
      }
    } catch { alert('Netzwerkfehler'); }
    setRawDeletingId(null);
  }

  async function deleteSelectedRaw(){
    if(!selectedRawIds.length) return;
    if(!confirm(`${selectedRawIds.length} ausgewählte Roh-Datei(en) wirklich löschen?`)) return;
    for(const id of [...selectedRawIds]){
      try {
        await fetch('/api/shop/raw-files?id='+encodeURIComponent(id), { method:'DELETE' });
      } catch {/* ignore */}
    }
    setSelectedRawIds([]);
    loadRaw(1);
  }

  async function handleExcel(file: File){
    setExcelLoading(true); setExcelResult(null); setExcelUnmatched([]);
    try {
      const form = new FormData(); form.append('file', file);
      const url = '/api/shop/admin/materials/bulk-from-excel?mode=preview';
      const r = await fetch(url, { method:'POST', body: form });
      const d = await r.json();
      if(!(r.ok && d.success)){ alert(d.error||'Excel Import Fehler'); }
      else { setExcelPreview(d.materials||null); setExcelToken(d.token||null); setExcelResult(null); }
    } catch { alert('Netzwerkfehler'); }
    setExcelLoading(false);
  }

  async function commitExcel(){
    if(!excelToken){ alert('Kein Preview Token'); return; }
    setExcelLoading(true); setExcelResult(null); setExcelUnmatched([]);
    try {
      const r = await fetch(`/api/shop/admin/materials/bulk-from-excel?token=${encodeURIComponent(excelToken)}`, { method:'POST' });
      const d = await r.json();
      if(!(r.ok && d.success)){ alert(d.error||'Commit Fehler'); }
      else {
        setExcelResult(d);
        setExcelUnmatched(d.unmatched||[]);
        setExcelToken(null);
        // Optimistisch neue Produkte (rudimentär) ergänzen bis Reload fertig
        if(Array.isArray(d.created) && d.created.length){
          setProducts(prev=>{
            const existingIds = new Set(prev.map(p=>p._id));
            const injected = d.created.filter((c:any)=> !existingIds.has(String(c.id))).map((c:any)=> ({ _id:String(c.id), title:c.title, description:'', category: undefined, isPublished:false, files:[], price: undefined } as Product));
            return [...injected, ...prev];
          });
        }
        // Nachladen kompletter Daten
        load();
        // Direkt zur Vorschau wechseln
        setTab('preview');
      }
    } catch { alert('Netzwerkfehler'); }
    setExcelLoading(false);
  }

  function applyExcelPreview(){
    if(!excelPreview) return;
    // Für jedes Preview-Material versuchen wir zu matchen: Der Nutzer kann später Produkte einzeln editieren – hier nur Info.
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Material Verwaltung</h1>
        <p className="text-sm text-gray-600">Roh-Dateien, Produkte, Excel-Import & Shop Vorschau.</p>
        <nav className="flex flex-wrap gap-2 text-sm mt-2">
          {[
            {id:'manage', label:'Materialien'},
            {id:'excel', label:'Excel Import'},
            {id:'preview', label:'Shop Vorschau'}
          ].map(t=> (
            <button key={t.id} onClick={()=>setTab(t.id as any)} className={`px-3 py-1.5 rounded border ${tab===t.id? 'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>{t.label}</button>
          ))}
          <button onClick={()=>load()} className="ml-auto px-3 py-1.5 rounded border bg-white hover:bg-gray-50 text-xs">Refresh</button>
        </nav>
      </header>

      {tab==='manage' && <section className="bg-white border rounded shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h2 className="font-semibold">Raw-Dateien</h2>
          <div className="flex gap-2 items-center text-xs">
            <input value={rawSearch} onChange={e=>setRawSearch(e.target.value)} placeholder="Suche" className="border rounded px-2 py-1" />
            <button onClick={()=>loadRaw(1)} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">Suche</button>
            <label className="cursor-pointer px-2 py-1 border rounded bg-indigo-50 hover:bg-indigo-100">
              + Upload
              <input type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadRawFile(f); e.target.value=''; }} />
            </label>
            {selectedRawIds.length>0 && (
              <button onClick={deleteSelectedRaw} className="px-2 py-1 border rounded bg-red-50 hover:bg-red-100 text-red-700" title="Ausgewählte löschen">Löschen ({selectedRawIds.length})</button>
            )}
            {rawUploading && <span>Upload…</span>}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {rawFiles.map(f=>{
            const sel = selectedRawIds.includes(f.id);
            const usedByProduct = products.some(p=> (p.files||[]).some(file=> file.key===f.key || file.name===f.name));
            return (
              <div key={f.id} onClick={()=>!usedByProduct && toggleRaw(f.id)} className={`relative border rounded p-2 text-left flex flex-col gap-1 text-[11px] ${usedByProduct? 'opacity-70 cursor-not-allowed bg-gray-50':'cursor-pointer hover:bg-gray-50'} ${sel?'ring-2 ring-blue-500 bg-blue-50':''}`}>
                <button
                  onClick={(e)=>{ e.stopPropagation(); if(usedByProduct) return; deleteRawFile(f.id); }}
                  title={usedByProduct? 'In Produkt verwendet – nicht löschbar':'Löschen'}
                  className={`absolute top-1 right-1 text-xs px-1 ${usedByProduct? 'text-gray-400':'text-red-600 hover:text-red-800'}`}
                  disabled={rawDeletingId===f.id || usedByProduct}
                >{rawDeletingId===f.id? '…':'×'}</button>
                <span className="font-medium truncate pr-4" title={f.name}>{f.name}</span>
                <span className="text-gray-500">{Math.round(f.size/1024)} KB</span>
                <span className="text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</span>
                {usedByProduct && <span className="text-[10px] text-emerald-700">in Produkt</span>}
                <div className="flex gap-1 flex-wrap mt-1">
                  <a href={f.url} target="_blank" onClick={e=> e.stopPropagation()} className="px-1 py-0.5 border rounded text-[10px] hover:bg-white bg-gray-100">Öffnen</a>
                  {f.contentType?.includes('pdf') && (
                    <button onClick={(e)=>{ e.stopPropagation(); setPdfUrl(f.url); }} className="px-1 py-0.5 border rounded text-[10px] bg-indigo-50 hover:bg-indigo-100">Vorschau</button>
                  )}
                  <a href={f.url} download onClick={e=> e.stopPropagation()} className="px-1 py-0.5 border rounded text-[10px] bg-gray-50 hover:bg-gray-100">Download</a>
                </div>
              </div>
            );
          })}
        </div>
        {rawTotal>rawFiles.length && (
          <div className="flex justify-center mt-2">
            <button onClick={()=>{ loadRaw(rawPage+1); }} className="text-xs px-3 py-1 border rounded">Mehr…</button>
          </div>
        )}
  </section>}

  {tab==='excel' && <section className="bg-white border rounded shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold">Excel Import</h2>
          <div className="flex gap-2 text-xs items-center">
            <label className="cursor-pointer px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">
              Datei wählen
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleExcel(f); e.target.value=''; }} />
            </label>
            {excelPreview && excelToken && !excelResult && (
              <button onClick={commitExcel} className="px-2 py-1 border rounded bg-emerald-600 text-white hover:bg-emerald-700 text-xs">Import bestätigen</button>
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
            {excelToken && <p className="mt-2 text-gray-500">Bitte prüfen und dann "Import bestätigen" klicken. Token: <span className="font-mono">{excelToken}</span></p>}
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
  </section>}

  {/* Produktliste im Materialien-Tab entfernt (nicht mehr benötigt) */}

      {tab==='preview' && <section className="bg-white border rounded shadow-sm p-5 space-y-4">
        <h2 className="font-semibold">Shop Vorschau (alle Produkte)</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p=> (
            <div key={p._id} className="border rounded p-4 bg-white flex flex-col gap-2 text-sm">
              <div className="font-semibold flex justify-between items-center">
                <span className="truncate pr-2" title={p.title}>{p.title}</span>
                <div className="flex items-center gap-2">
                  {typeof p.price==='number' && <span className="text-xs text-gray-500">{p.price.toFixed(2)} €</span>}
                  <button
                    onClick={async()=>{ if(!confirm(`Produkt "${p.title}" löschen?`)) return; try{ const r=await fetch(`/api/shop/products/${p._id}`,{ method:'DELETE' }); const d=await r.json(); if(!(r.ok && d.success)) alert(d.error||'Löschen fehlgeschlagen'); else setProducts(prev=> prev.filter(x=> x._id!==p._id)); } catch { alert('Netzwerkfehler'); } }}
                    className="text-xs text-red-600 hover:text-red-800 px-1 py-0.5 border border-red-200 rounded"
                    title="Produkt löschen"
                  >✕</button>
                </div>
              </div>
              {p.category && <div className="text-[11px] text-indigo-700">{p.category}</div>}
              <div className="text-[11px] text-gray-500">{p.files?.filter(f=>!f.key?.startsWith('placeholder:')).length || 0} echte Dateien / {p.files?.length||0} gesamt</div>
              {p.description && <p className="text-[11px] text-gray-600 line-clamp-3 whitespace-pre-line">{p.description}</p>}
              <div className="flex flex-col gap-1 mt-auto">
                <div className="flex flex-wrap gap-1">
                  {(p.files||[]).slice(0,4).map(f=> (
                    <button key={f.key} onClick={()=>{ if(f.downloadUrl){ if(f.name.toLowerCase().endsWith('.pdf')) setPdfUrl(f.downloadUrl); else window.open(f.downloadUrl,'_blank'); } }} className={`px-1 py-0.5 border rounded text-[10px] ${f.key.startsWith('placeholder:')?'border-orange-300 text-orange-600':'border-gray-200 text-gray-600 hover:bg-gray-50'}`} title={f.name}>{f.name.slice(0,18)}</button>
                  ))}
                  {p.files && p.files.length>4 && <span className="text-[10px] text-gray-400">+{p.files.length-4}</span>}
                </div>
                {(()=>{ 
                  const pdfFile = (p.files||[]).find(f=> f.downloadUrl && /\.pdf$/i.test(f.name));
                  if(!pdfFile) return null;
                  return <div className="border-t pt-1 mt-1">
                    <span className="block text-[10px] text-gray-400 mb-0.5">Vorschau</span>
                    {/* @ts-ignore */}
                    {require('react').createElement(require('@/components/media/PdfThumbs').default, { url: pdfFile.downloadUrl, onOpen: ()=> setPdfUrl(pdfFile.downloadUrl) })}
                  </div>;
                })()}
              </div>
            </div>
          ))}
        </div>
      </section>}
      {pdfUrl && (
        <div className="fixed inset-0 z-50">
          {/** Lazy import über dynamic wäre möglich; direkte Einbindung hier */}
          {/* @ts-ignore */}
          {require('react').createElement(require('@/components/media/PdfPreview').default, { url: pdfUrl, onClose: ()=> setPdfUrl(null) })}
        </div>
      )}
    </main>
  );
}
