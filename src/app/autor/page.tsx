"use client";
import { useState, useEffect } from "react";
import CategorySelect from '@/components/shared/CategorySelect';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import MediaLibrary from '@/components/media/MediaLibrary';

interface CourseDB { _id: string; title: string; description?: string; category?: string; isPublished?: boolean; reviewStatus?: string; author?: string; }
interface CourseUI { id: string; title: string; description?: string; category?: string; status: string; lessons: number; review?: string; }
interface LessonLite { _id: string; title: string; type: string; isExercise?: boolean; category?: string; courseId?: string; createdAt?: string; }

// -------- Review (eingereichte Teacher-Kurse) --------
function ReviewTab(){
  const [loading,setLoading] = useState(false);
  const [courses,setCourses] = useState<CourseUI[]>([]);
  const [error,setError] = useState('');
  async function load(){
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/courses/review');
      const d = await res.json();
      if(res.ok && d?.success){
        const pending: CourseDB[] = d.pending||[];
        setCourses(pending.map(c=>({ id:String(c._id), title:c.title, description:c.description, category:c.category, status: c.isPublished?'Veröffentlicht':'Entwurf', lessons:(c as any).lessonCount||0, review: c.reviewStatus||'pending' })));
      } else setError(d?.error||'Fehler beim Laden');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ load(); }, []);
  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">Eingereichte Kurse <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{courses.length}</span></h2>
        <button onClick={load} disabled={loading} className="bg-purple-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">{loading?'⏳':'🔄'}</button>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded mb-4">{error}</div>}
      {loading && <div className="text-sm text-gray-500 py-8">Lade eingereichte Kurse…</div>}
      {!loading && courses.length===0 && <div className="text-sm text-gray-500 py-6">Keine eingereichten Kurse.</div>}
      <div className="grid gap-4">
        {courses.map(c=> (
          <div key={c.id} className="bg-white border rounded p-4 flex justify-between items-center">
            <div className="min-w-0">
              <h3 className="font-semibold break-words">{c.title}</h3>
              <p className="text-xs text-gray-600">{c.lessons} Lektionen • Status: <span className="text-purple-700 font-medium">Zur Prüfung</span></p>
              {c.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</p>}
              {c.category && <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{c.category}</span>}
            </div>
            <div className="flex flex-col gap-2 text-sm min-w-[9rem] items-stretch">
              <a href={`/autor/kurs/${c.id}`} className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"><span>✏️</span><span>Bearbeiten</span></a>
              <a href={`/autor/kurs/${c.id}/einstellungen`} className="flex items-center justify-center gap-1 bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700"><span>⚙️</span><span>Settings</span></a>
              <ApproveRejectBtns courseId={c.id} onDone={load} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApproveRejectBtns({ courseId, onDone }:{ courseId:string; onDone:()=>void }){
  const [busy,setBusy] = useState(false);
  async function act(action:'approve'|'reject'){
    setBusy(true);
    try { await fetch('/api/admin/courses/review', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, courseId }) }); }
    finally { setBusy(false); onDone(); }
  }
  return (
    <div className="flex flex-col gap-1">
      <button disabled={busy} onClick={()=>act('approve')} className="bg-green-600 text-white rounded px-2 py-1 text-xs hover:bg-green-700 disabled:opacity-50">Freischalten</button>
      <button disabled={busy} onClick={()=>act('reject')} className="bg-red-600 text-white rounded px-2 py-1 text-xs hover:bg-red-700 disabled:opacity-50">Ablehnen</button>
    </div>
  );
}

export default function AutorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canUpload = role === 'author' || role === 'admin';
  const initialTab = (()=>{
    const t = searchParams?.get('tab');
    return (t==='uebungen'||t==='neu'||t==='kurse'||t==='medien'||t==='review') ? t : 'kurse';
  })();
  const [tab, setTab] = useState<'kurse'|'review'|'neu'|'uebungen'|'medien'|'import'>(initialTab as any);

  // Hilfsfunktion: Tab wechseln UND URL (Query) aktualisieren, damit Refresh / Direktlink funktioniert
  function changeTab(next: 'kurse'|'review'|'neu'|'uebungen'|'medien'|'import') {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      // Router ersetzen statt push um History-Spam zu vermeiden
      router.replace(url.pathname + '?' + url.searchParams.toString());
      // Merken für andere Seiten (Back-Link Logik)
      localStorage.setItem('lastAuthorTab', next === 'uebungen' ? 'uebungen' : (next==='medien'?'medien':'kurse'));
    } catch { /* ignore */ }
  }
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <h1 className="text-3xl font-bold mb-6">✍️ Autorentool</h1>
      <p className="mb-6 text-gray-700">Direkte Übungserstellung entfernt – nur Kurse & Markierung vorhandener Lektionen als Übungen.</p>
      <div className="flex gap-6 border-b border-gray-200 mb-8 text-sm">
        <button onClick={()=>changeTab('kurse')} className={"pb-2 -mb-px border-b-2 "+(tab==='kurse'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Kurse</button>
        {(role==='admin'||role==='author') && <button onClick={()=>changeTab('review')} className={"pb-2 -mb-px border-b-2 "+(tab==='review'?'border-purple-600 font-semibold text-purple-700':'border-transparent text-gray-500 hover:text-gray-800')}>Zur Prüfung</button>}
        <button onClick={()=>changeTab('neu')} className={"pb-2 -mb-px border-b-2 "+(tab==='neu'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Neuer Kurs</button>
        <button onClick={()=>changeTab('uebungen')} className={"pb-2 -mb-px border-b-2 "+(tab==='uebungen'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Übungen</button>
  <button onClick={()=>changeTab('medien')} className={"pb-2 -mb-px border-b-2 "+(tab==='medien'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Medien</button>
  {(role==='admin'||role==='author'||role==='teacher') && <button onClick={()=>changeTab('import')} className={"pb-2 -mb-px border-b-2 "+(tab==='import'?'border-green-600 font-semibold text-green-700':'border-transparent text-gray-500 hover:text-gray-800')}>Import</button>}
      </div>
      {tab==='kurse' && <CoursesTab />}
      {tab==='review' && (role==='admin'||role==='author') && <ReviewTab />}
      {tab==='neu' && <CreateCourseTab />}
      {tab==='uebungen' && <ExercisesTab />}
  {tab==='medien' && (
        <section>
          <MediaLibrary canUpload={!!canUpload} />
        </section>
      )}
  {tab==='import' && <ImportTab />}
    </main>
  );
}

// -------- Kurse Liste --------
function CoursesTab() {
  const [courses, setCourses] = useState<CourseUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<'published'|'draft'|''>('');
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10; // fest: 10 aktuellste pro Seite
  const [totalCount, setTotalCount] = useState(0);
  const sp = useSearchParams();
  const router = useRouter();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('showAll','1');
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      if (q) params.set('q', q);
      if (categoryFilter) params.set('cat', categoryFilter);
      if (statusFilter) params.set('status', statusFilter==='published'?'pub':'draft');
      const res = await fetch('/api/kurse?'+params.toString());
      const data = await res.json();
      if (res.ok && data.success) {
        const dbCourses: CourseDB[] = Array.isArray(data.courses)? data.courses: [];
        setCourses(dbCourses.map(c=>({ id:String(c._id), title:c.title, description:c.description, category:c.category, status:c.isPublished?'Veröffentlicht':'Entwurf', lessons: (c as any).lessonCount||0 })));
        setTotalCount(typeof data.totalCount === 'number'? data.totalCount : dbCourses.length);
        if (Array.isArray(data.categories)) {
          setUsedCategories((data.categories as string[]).sort((a,b)=> a.localeCompare(b,'de')));
        } else {
          // fallback: nur aktuelle Seite
          const cats = Array.from(new Set(dbCourses.map(c=> (c.category||'').trim()).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'de'));
          setUsedCategories(cats);
        }

  // ReviewTab war hier fälschlich verschachtelt – jetzt top-level definiert
      } else {
        setCourses([]); setTotalCount(0);
      }
    } catch { setCourses([]); setTotalCount(0); }
    setLoading(false);
  }

  // Initial URL -> State
  useEffect(()=>{
    try {
      const q0 = sp?.get('q') || '';
      const cat0 = sp?.get('cat') || '';
      const p0 = parseInt(sp?.get('page') || '1', 10);
      const st0 = sp?.get('stat') || '';
      if(q0) setQ(q0);
      if(cat0) setCategoryFilter(cat0);
      if(!Number.isNaN(p0) && p0>0) setPage(p0);
      if(st0==='pub') setStatusFilter('published'); else if (st0==='draft') setStatusFilter('draft');
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filterwechsel -> Seite 1
  useEffect(()=>{ setPage(1); }, [q, categoryFilter, statusFilter]);
  // Laden bei Änderungen
  useEffect(()=>{ load(); }, [page, q, categoryFilter, statusFilter]);

  // Server-seitige Pagination Infos
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = courses; // bereits server-seitig gefiltert & paginiert

    // Reflect filters + page in URL (deep-linkable)
  useEffect(()=>{
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab','kurse');
        if(q) url.searchParams.set('q', q); else url.searchParams.delete('q');
        if(categoryFilter) url.searchParams.set('cat', categoryFilter); else url.searchParams.delete('cat');
    if(statusFilter) url.searchParams.set('stat', statusFilter==='published'?'pub':'draft'); else url.searchParams.delete('stat');
        if(safePage>1) url.searchParams.set('page', String(safePage)); else url.searchParams.delete('page');
        router.replace(url.pathname + '?' + url.searchParams.toString());
      } catch { /* noop */ }
  }, [q, categoryFilter, statusFilter, safePage, router]);

    async function del(courseId: string, title: string) {
      if (!confirm(`Kurs "${title}" wirklich löschen?`)) return;
      try {
        const res = await fetch(`/api/kurs/${courseId}`, { method:'DELETE' });
        const data = await res.json();
        if (!res.ok) alert(data.error || 'Fehler');
        load();
      } catch { alert('Netzwerkfehler'); }
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Vorhandene Kurse</h2>
          <button onClick={load} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{loading?'⏳':'🔄'}</button>
        </div>
        {/* Filterzeile */}
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Filter Titel/Beschreibung…"
            className="border rounded px-3 py-1 text-sm"
          />
          <CategorySelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            includeEmpty
            emptyLabel="Alle Fächer"
            options={usedCategories}
            label=""
            labelClassName="sr-only"
            selectClassName="border rounded px-2 py-1 text-sm"
          />
          <select
            value={statusFilter}
            onChange={e=> setStatusFilter(e.target.value as any)}
            className="border rounded px-2 py-1 text-sm"
            aria-label="Status filtern"
          >
            <option value="">Alle Stati</option>
            <option value="published">Veröffentlicht</option>
            <option value="draft">Entwürfe</option>
          </select>
          {(q || categoryFilter || statusFilter) && (
            <div className="text-[11px] text-gray-500 ml-2">Treffer gesamt: {totalCount}</div>
          )}
        </div>
        {loading && <div className="text-sm text-gray-500 py-8">Lade Kurse…</div>}
        {!loading && totalCount===0 && <div className="text-sm text-gray-500 py-6">Keine Kurse gefunden.</div>}
        <div className="grid gap-4">
          {paginated.map(c=> (
            <div key={c.id} className="bg-white border rounded p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-xs text-gray-600">{c.lessons} Lektionen • {c.status}</p>
                {c.description && <p className="text-xs text-gray-500 mt-1">{c.description}</p>}
                {c.category && <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{c.category}</span>}
              </div>
              <div className="flex flex-col gap-2 text-sm min-w-[10rem]">
                <a href={`/autor/kurs/${c.id}/einstellungen`} className="flex items-center justify-center gap-1 bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700"><span>⚙️</span><span>Einstellungen</span></a>
                <a href={`/autor/kurs/${c.id}`} className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"><span>📝</span><span>Bearbeiten</span></a>
                <button onClick={()=>del(c.id, c.title)} className="flex items-center justify-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"><span>🗑️</span><span>Löschen</span></button>
              </div>
            </div>
          ))}
        </div>
        {/* Pagination */}
    {totalCount > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm">
      <div className="text-xs text-gray-500">Seite {safePage} / {totalPages} • {totalCount} Kurse</div>
            <div className="flex flex-wrap gap-2 items-center">
              <button disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-2 py-1 border rounded disabled:opacity-40">← Zurück</button>
              {Array.from({length: totalPages}).slice(0,8).map((_,i)=>{
                const p = i+1;
                return <button key={p} onClick={()=>setPage(p)} className={`px-2 py-1 border rounded ${p===safePage? 'bg-blue-600 text-white border-blue-600':'hover:bg-gray-50'}`}>{p}</button>;
              })}
              {totalPages>8 && <span className="text-xs text-gray-500">…</span>}
              <button disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-2 py-1 border rounded disabled:opacity-40">Weiter →</button>
            </div>
          </div>
        )}
      </div>
    );
  }

// -------- Kurs erstellen --------
function CreateCourseTab() {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
      e.preventDefault(); if (!title || !description || !category) return; setBusy(true);
      try {
        const res = await fetch('/api/kurse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, description, category }) });
        const data = await res.json();
        if (res.ok && data.success) { window.location.href = `/autor/kurs/${data.courseId}`; }
        else alert(data.error || 'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setBusy(false);
    }

    return (
      <form onSubmit={submit} className="space-y-6 max-w-2xl">
        <div>
          <label className="block text-sm font-medium mb-1">Titel *</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} required className="w-full border rounded p-3" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Beschreibung *</label>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} required className="w-full border rounded p-3 h-28" />
        </div>
        <div>
          <CategorySelect
            value={category}
            onChange={setCategory}
            label="Kategorie *"
            required
            includeEmpty
            emptyLabel="Kategorie wählen"
            selectClassName="w-full border rounded p-3"
          />
        </div>
        <div>
          <button disabled={busy} className="bg-green-600 disabled:opacity-50 text-white px-6 py-3 rounded font-semibold hover:bg-green-700">{busy?'Erstelle…':'Kurs erstellen ➜'}</button>
        </div>
      </form>
    );
  }

// -------- Übungen (nur Markierung & Edit) --------
function ExercisesTab() {
    const [lessons, setLessons] = useState<LessonLite[]>([]);
    const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
    const [markingId, setMarkingId] = useState<string|null>(null);
    const [editingId, setEditingId] = useState<string|null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editRaw, setEditRaw] = useState('');
    const [editMarkdown, setEditMarkdown] = useState('');
    const [saving, setSaving] = useState(false);
  const [courseTitles, setCourseTitles] = useState<Record<string,string>>({});
  const [onlyMarked, setOnlyMarked] = useState(false);

  async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/lessons');
        const data = await res.json();
    const arr = Array.isArray(data.lessons) ? data.lessons : [];
    // Sortierung: neueste zuerst (Fallback createdAt, sonst _id Timestamp Schätzung nicht implementiert)
    arr.sort((a: any,b: any)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    setLessons(arr as LessonLite[]);
        // Kurs-Titel bulk laden (vermeidet N+1 Requests)
        const uniqueCourseIds: string[] = Array.from(new Set((arr as any[])
          .map(l=> String(l.courseId||''))
          .filter(id=> id && id !== 'exercise-pool')));
        const missing = uniqueCourseIds.filter(id => !courseTitles[id]);
        if (missing.length) {
          try {
            const bulkRes = await fetch('/api/kurs/bulk?ids=' + encodeURIComponent(missing.join(',')));
            if (bulkRes.ok) {
              const bulkData = await bulkRes.json();
              if (bulkData?.success && Array.isArray(bulkData.courses)) {
                const patch: Record<string,string> = {};
                for (const c of bulkData.courses) {
                  patch[c.id] = c.title;
                }
                if (Object.keys(patch).length) setCourseTitles(prev => ({ ...prev, ...patch }));
              }
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    useEffect(()=>{ load(); }, []);

    async function mark(lessonId: string) {
      setMarkingId(lessonId);
      try {
        const res = await fetch('/api/exercises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lessonId }) });
        const data = await res.json();
        if (res.ok && data.success) {
          const cat = data.exercise?.category;
          setLessons(prev=>prev.map(l=>l._id===lessonId?{...l,isExercise:true, category: l.category || cat}:l));
        }
        else alert(data.error||'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setMarkingId(null);
    }

    async function startEdit(lessonId: string) {
      setEditingId(lessonId); setSaving(false);
      try {
        const res = await fetch(`/api/exercises?lessonId=${lessonId}`);
        const data = await res.json();
        if (res.ok && data.success) {
          const l = data.exercise;
          setEditTitle(l.title);
          if (l.type==='markdown') { setEditMarkdown(l.content?.markdown||''); setEditRaw(''); }
          else if (Array.isArray(l.questions) && l.questions.length) {
            const raw = l.questions.map((q:any)=>{
                const answers = q.answers || q.allAnswers || [];
                // erste Antwort soll korrekt sein -> falls nicht, sortieren
                let ordered = answers.slice();
                const firstCorrect = q.correctAnswer || (Array.isArray(q.correctAnswers)? q.correctAnswers[0]: undefined);
                if(firstCorrect && ordered[0] !== firstCorrect){
                  ordered = [firstCorrect, ...ordered.filter((a:string)=>a!==firstCorrect)];
                }
                return [q.question, ...ordered].join('\n');
              }).join('\n\n');
            setEditRaw(raw); setEditMarkdown('');
          } else { setEditRaw(''); setEditMarkdown(JSON.stringify(l.content||{},null,2)); }
        } else { alert('Fehler beim Laden'); setEditingId(null); }
      } catch { alert('Netzwerkfehler'); setEditingId(null); }
    }

    function parseQA(raw: string){
      return raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean).map(block=>{
        const lines = block.split(/\n/).map(l=>l.trim()).filter(Boolean);
        const q = lines[0]||''; const answers = lines.slice(1).map(a=>a.replace(/^\*/,'').trim());
        if(!answers.length) return null;
        const correctAnswer = answers[0];
        return { question:q, answers, correct:[correctAnswer], correctAnswer };
      }).filter((x:any)=>x && x.question && x.answers.length>0) as any[];
    }

    async function save(){
      if(!editingId) return; setSaving(true);
      try {
        const lesson = lessons.find(l=>l._id===editingId);
        let patch:any = { lessonId: editingId, title: editTitle };
        if (lesson?.type==='markdown') patch.content = { markdown: editMarkdown };
        else if (lesson?.type==='single-choice' || lesson?.type==='multiple-choice') {
          const parsed = parseQA(editRaw); if (!parsed.length){ alert('Keine Fragen geparst'); setSaving(false); return; }
          patch.questions = parsed.map(q=>({ question:q.question, answers:q.answers, ...(lesson.type==='single-choice'?{correctAnswer:q.correctAnswer}:{correctAnswers:q.correct}) }));
        } else patch.content = { raw: editRaw };
        const res = await fetch('/api/exercises', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
        const data = await res.json();
        if (res.ok && data.success) { setLessons(prev=>prev.map(l=>l._id===editingId?{...l,title:editTitle}:l)); cancel(); }
        else alert(data.error||'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setSaving(false);
    }

    async function unmark(lessonId:string, hard?:boolean){
      if(!confirm(hard?'Übung endgültig löschen?':'Übung-Markierung entfernen?')) return;
      try {
        const res = await fetch(`/api/exercises?lessonId=${lessonId}${hard?'&delete=1':''}`, { method:'DELETE' });
        const data = await res.json();
        if(res.ok && data.success){
          if(hard && data.deleted) setLessons(prev=>prev.filter(l=>l._id!==lessonId));
          else setLessons(prev=>prev.map(l=>l._id===lessonId?{...l,isExercise:false}:l));
        } else {
          if(res.status===409 && data.courseId){
            alert(`${data.error}\nKurs: ${data.courseTitle||data.courseId}`);
          } else {
            alert(data.error||'Fehler');
          }
        }
      } catch { alert('Netzwerkfehler'); }
    }

    async function deleteStandalone(lesson: LessonLite){
      if(!confirm('Lektion wirklich löschen?')) return;
      // Wenn Lektion an Kurs gebunden ist -> ablehnen und Kurs nennen
      if(lesson.courseId && lesson.courseId !== 'exercise-pool'){
        try {
          const r = await fetch(`/api/kurs/${lesson.courseId}`);
          if(r.ok){
            const d = await r.json();
            const title = d?.course?.title || lesson.courseId;
            alert(`Löschen nicht möglich – Lektion gehört zum Kurs: ${title}`);
          } else {
            alert(`Löschen nicht möglich – Lektion gehört zu Kurs ${lesson.courseId}`);
          }
        } catch {
          alert(`Löschen nicht möglich – Kurs ${lesson.courseId}`);
        }
        return;
      }
      try {
        const res = await fetch(`/api/lessons/${lesson._id}`, { method:'DELETE' });
        if(!res.ok){
          const data = await res.json().catch(()=>({}));
          alert(data.error||'Fehler beim Löschen');
          return;
        }
        setLessons(prev=>prev.filter(l=>l._id!==lesson._id));
      } catch {
        alert('Netzwerkfehler');
      }
    }

    function cancel(){ setEditingId(null); setEditTitle(''); setEditRaw(''); setEditMarkdown(''); }

    const filtered = lessons.filter(l=>{
      if (filter && !l.title.toLowerCase().includes(filter.toLowerCase())) return false;
      if (categoryFilter && l.category !== categoryFilter) return false;
      if (onlyMarked && !l.isExercise) return false;
      return true;
    });

  // Pagination
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > totalPages && totalPages>0) { setPage(totalPages); }
  useEffect(()=>{ setPage(1); }, [filter, categoryFilter, onlyMarked]);
  const startIndex = (page-1)*pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

    const templates = [
      { type:'single-choice', icon:'📝', name:'Single Choice', desc:'Eine richtige Antwort' },
      { type:'multiple-choice', icon:'❓❓', name:'Multiple Choice', desc:'Mehrere richtige Antworten' },
      { type:'markdown', icon:'🧾', name:'Markdown', desc:'Freier Inhalt' },
      { type:'matching', icon:'🔗', name:'Matching', desc:'Paare verbinden' },
      { type:'memory', icon:'🧠', name:'Memory', desc:'Paare aufdecken' },
      { type:'lueckentext', icon:'🧩', name:'Lückentext', desc:'*Antwort* markieren' },
      { type:'ordering', icon:'🔢', name:'Reihenfolge', desc:'Sortieren' },
      { type:'text-answer', icon:'✍️', name:'Text-Antwort', desc:'Freitext prüfen' },
  { type:'minigame', icon:'🎮', name:'Minigame', desc:'Kursteilnehmer wählen den Spieltyp.' },
  { type:'video', icon:'🎬', name:'Video', desc:'YouTube (Embed) – abgeschlossen nach komplettem Ansehen' }
    ];

    const goCreate = (t:string) => {
      // Kurs-Kontext erforderlich? Nutzer wird auf Seite ggf. erinnert.
      window.location.href = `/autor/lektion/neu?type=${encodeURIComponent(t)}`;
    };

    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-semibold mb-3">Neue Lektion / Übung erstellen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-2">
            {templates.map(t => (
              <button
                key={t.type}
                type="button"
                onClick={()=>goCreate(t.type)}
                className="border rounded p-4 text-left bg-white hover:border-blue-400 hover:bg-blue-50 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="font-semibold text-sm mb-1">{t.name}</div>
                <div className="text-xs text-gray-600 leading-snug">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">Hinweis: Einige Typen (z.B. Single Choice) besitzen einen speziellen Editor.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter Titel..." className="border rounded px-3 py-1 text-sm" />
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Alle Fächer</option>
            {Array.from(new Set(lessons.map(l=>l.category).filter(Boolean)))
              .sort()
              .map(cat=> <option key={cat as string} value={cat as string}>{cat}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer select-none bg-white">
            <input type="checkbox" className="accent-blue-600" checked={onlyMarked} onChange={e=>setOnlyMarked(e.target.checked)} />
            Nur markierte
          </label>
          <button onClick={load} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">🔄 Aktualisieren</button>
          {categoryFilter && <button type="button" onClick={()=>setCategoryFilter('')} className="text-xs text-blue-600 underline">Filter zurücksetzen</button>}
        </div>
        {(categoryFilter || filter) && (
          <div className="text-[11px] text-gray-500">Gefunden: {filtered.length} / {lessons.length}</div>
        )}
        {loading && <div className="text-sm text-gray-500">Lade Lektionen…</div>}
        {!loading && filtered.length===0 && <div className="text-sm text-gray-500">Keine Lektionen gefunden.</div>}
        <div className="border rounded divide-y">
          {paginated.map(lesson=> (
            <div key={lesson._id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{lesson.title}</div>
                <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                  <span>Typ: {lesson.type}</span>
                  {lesson.category && <span className="text-blue-600">Fach: {lesson.category}</span>}
                  {lesson.courseId && lesson.courseId !== 'exercise-pool' && (
                    <span className="text-purple-600">Kurs: {courseTitles[lesson.courseId] || '…'}</span>
                  )}
                </div>
              </div>
              {editingId===lesson._id ? (
                <div className="flex-1 space-y-2">
                  <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="border rounded px-2 py-1 w-full text-sm" />
                  {lesson.type==='markdown' ? (
                    <textarea value={editMarkdown} onChange={e=>setEditMarkdown(e.target.value)} className="border rounded px-2 py-1 w-full text-xs h-32 font-mono" />
                  ): (
                    <textarea value={editRaw} onChange={e=>setEditRaw(e.target.value)} className="border rounded px-2 py-1 w-full text-xs h-32 font-mono" />
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button disabled={saving} onClick={save} className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">💾 Speichern</button>
                    <button onClick={cancel} className="bg-gray-500 text-white px-3 py-1 rounded text-sm">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap items-center">
                  {/* Fragen-Zähler (robust je nach Typ) */}
                  {(() => {
                    const l: any = lesson;
                    // Für Video & Markdown keine Fragenzahl anzeigen
                    if (l.type === 'video' || l.type === 'markdown') return null;
                    let qCount = 0;
                    switch(l.type){
                      case 'single-choice':
                      case 'multiple-choice':
                      case 'matching':
                        if (Array.isArray(l.questions)) qCount = l.questions.length; break;
                      case 'minigame': {
                        // Neuer Modus: content.blocks; Alt: questions
                        if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length;
                        else if (Array.isArray(l.questions)) qCount = l.questions.length;
                        break;
                      }
                      case 'memory': {
                        // memory: Anzahl Paare in content.pairs (Array von Paaren) oder Summe über Blocks
                        const pairs = Array.isArray(l?.content?.pairs)? l.content.pairs : [];
                        qCount = pairs.length ? pairs.length : 0;
                        break;
                      }
                      case 'lueckentext': {
                        // lueckentext: Anzahl Lücken falls vorhanden
                        const gaps = Array.isArray(l?.content?.gaps) ? l.content.gaps : (Array.isArray(l?.content?.items)? l.content.items: []);
                        qCount = gaps.length || 0;
                        break;
                      }
                      case 'ordering': {
                        const items = Array.isArray(l?.content?.items)? l.content.items: [];
                        qCount = items.length ? 1 : 0; // eine Aufgabe
                        break;
                      }
                      case 'text-answer': {
                        // text-answer: content.blocks oder 1 Frage
                        if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length; else qCount = 1;
                        break;
                      }
                      default: {
                        if (Array.isArray(l.questions)) qCount = l.questions.length;
                        else if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length;
                      }
                    }
                    return <span className="text-xs text-gray-500 px-2 py-1 border rounded bg-gray-50">Fragen: {qCount}</span>;
                  })()}
                  <button
                    onClick={async ()=>{
                      try {
                        // Original komplett laden (inkl. courseId, content, questions)
                        const origRes = await fetch(`/api/lessons/${lesson._id}`);
                        if(!origRes.ok){ alert('Original nicht ladbar'); return; }
                        const origData = await origRes.json();
                        const orig = origData.lesson;
                        if(!orig){ alert('Keine Originaldaten'); return; }
                        const payload: any = {
                          // Standalone Kopie NICHT dem ursprünglichen Kurs zuordnen
                          courseId: 'exercise-pool',
                          title: (orig.title||'') + ' (Kopie)',
                          type: orig.type
                        };
                        if (Array.isArray(orig.questions) && orig.questions.length){
                          payload.questions = orig.questions.map((q:any)=>({
                            question: q.question,
                            answers: q.allAnswers || q.answers || [...(q.correctAnswers|| (q.correctAnswer?[q.correctAnswer]:[])), ...(q.wrongAnswers||[])] ,
                            correctAnswer: q.correctAnswer,
                            correctAnswers: q.correctAnswers
                          }));
                        } else if (orig.content) {
                          payload.content = orig.content;
                        }
                        const createRes = await fetch('/api/lessons', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                        if(!createRes.ok){
                          const txt = await createRes.text();
                          alert('Duplizieren fehlgeschlagen: '+txt);
                          return;
                        }
                        const created = await createRes.json();
                        const newId = created?.lesson?._id || created?.lesson?.id;
                        if(newId){
                          window.location.href = `/autor/lektion/${newId}`;
                        } else {
                          alert('Kopie ohne ID – Liste aktualisieren.');
                        }
                      } catch (e) {
                        alert('Netzwerk/Fehler beim Duplizieren');
                        console.error(e);
                      }
                    }}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >📄 Kopie & Bearb.</button>
                  <button onClick={()=>deleteStandalone(lesson)} className="bg-red-700 text-white px-3 py-1 rounded text-sm" title="Lektion löschen (nur möglich wenn nicht in Kurs)">🗑️ Löschen</button>
                  {lesson.isExercise ? (
                    <>
                      <button onClick={()=>unmark(lesson._id)} className="bg-yellow-600 text-white px-3 py-1 rounded text-sm">Markierung löschen</button>
                      <button onClick={()=>unmark(lesson._id,true)} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Endg. löschen</button>
                    </>
                  ) : (
                    <button disabled={markingId===lesson._id} onClick={()=>mark(lesson._id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">{markingId===lesson._id?'…':'Als Übung markieren'}</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Pagination Controls */}
        {filtered.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm">
            <div className="text-xs text-gray-500">Seite {page} / {totalPages} • {filtered.length} Übungen gesamt</div>
            <div className="flex flex-wrap gap-2 items-center">
              <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-2 py-1 border rounded disabled:opacity-40">← Zurück</button>
              {Array.from({length: totalPages}).slice(0,8).map((_,i)=>{
                const p = i+1;
                return <button key={p} onClick={()=>setPage(p)} className={`px-2 py-1 border rounded ${p===page? 'bg-blue-600 text-white border-blue-600':'hover:bg-gray-50'}`}>{p}</button>;
              })}
              {totalPages>8 && <span className="text-xs text-gray-500">…</span>}
              <button disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-2 py-1 border rounded disabled:opacity-40">Weiter →</button>
            </div>
          </div>
        )}
  {/* Hinweis entfernt auf Wunsch */}
      </div>
    );
  }
// (alter, defekter Codeblock entfernt)

// -------- Import Tab (Excel -> Kurse) --------
function ImportTab(){
  const [file, setFile] = useState<File|null>(null);
  const [preview, setPreview] = useState<any[]|null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any|null>(null);
  const [lastPreviewSig, setLastPreviewSig] = useState<string|null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [expanded, setExpanded] = useState<Record<number,boolean>>({});
  const fileSig = file ? `${file.name}|${file.size}|${file.lastModified}` : '';

  async function upload(mode:'preview'|'commit'){
    if(!file) return;
    if(mode==='commit' && lastPreviewSig !== fileSig){
      setErrors(['Datei geändert – bitte zuerst Vorschau ausführen.']);
      return;
    }
    setBusy(true); setErrors([]); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      const res = await fetch('/api/import/courses', { method:'POST', body: form });
      const data = await res.json();
      if(!res.ok){
        setErrors([data.error||'Fehler']);
        if(data.preview?.courses) setPreview(data.preview.courses);
      } else {
        if(mode==='preview'){
          setPreview(data.preview||[]); setErrors(data.errors||[]);
          setLastPreviewSig(fileSig);
        } else setResult(data);
      }
    } catch (e:any) { setErrors(['Netzwerkfehler: '+ (e?.message||'Unbekannt')]); }
    setBusy(false);
  }

  const totalLessons = preview ? preview.reduce((acc,c)=> acc + (c.lessonCount||0),0) : 0;
  const totalCourseErrors = preview ? preview.filter(c=>c.errors?.length).length : 0;
  const totalLessonErrors = preview ? preview.reduce((a,c)=> a + c.lessons.filter((l:any)=> l.errors?.length).length,0):0;
  const allOk = preview && totalCourseErrors===0 && totalLessonErrors===0;
  const formatSize = (n:number)=>{
    if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/1024/1024).toFixed(2)+' MB'; };

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-3"><span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-700 font-semibold text-lg">⇪</span> <span>Excel Import</span></h2>
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>setShowHelp(h=>!h)} className="text-sm px-3 py-1.5 rounded border bg-white hover:bg-gray-50 flex items-center gap-1">{showHelp? '📘 Hilfe schließen':'📘 Format Hilfe'}</button>
            {file && <button disabled={busy} onClick={()=>{ setFile(null); setPreview(null); setResult(null); setErrors([]); setLastPreviewSig(null); }} className="text-sm px-3 py-1.5 rounded border bg-white hover:bg-gray-50">Zurücksetzen</button>}
          </div>
        </div>
        {showHelp && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded p-4 text-xs leading-relaxed space-y-2">
            <div className="font-semibold text-green-800 flex items-center gap-2">🛈 Format Überblick</div>
            <ul className="list-disc pl-5 space-y-1 text-green-900">
              <li>Eine Spalte = 1 Kurs. Zeile1 Titel, Zeile2 Kategorie, Zeile3 Beschreibung.</li>
              <li>Ab Zeile4 Lektionen. Optional erste Zeile des Blocks mit Typ: VIDEO:, MD:, SC:, MC:, MATCHING:, MEMORY:, ORDERING:, LUECKENTEXT:, TEXT-ANSWER:, MINIGAME:</li>
              <li>Choice: Fragezeile, darunter Antworten (* markiert richtige), Blöcke mit Leerzeile trennen.</li>
              <li>Matching/Memory: Paarzeilen LINKS|RECHTS (Leerzeile = neuer Aufgabenblock).</li>
              <li>Lückentext: *Lücke* markieren. Ordering: ein Item je Zeile.</li>
              <li>Video: Typ, Titel, URL, danach optional Markdown.</li>
              <li>Minigame: key=value Zeilen (Config) + Frageblöcke je nach Spieltyp.</li>
            </ul>
            <div><a href="/api/import/courses/template" className="text-green-700 underline font-medium" download>Template herunterladen</a></div>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-6">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">1. Datei wählen (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onClick={e=>{ (e.target as HTMLInputElement).value=''; }}
                  onChange={e=>{const f=e.target.files?.[0]||null; setFile(f); setPreview(null); setResult(null); setErrors([]); setLastPreviewSig(null);}}
                  className="text-sm block w-full border rounded px-3 py-2 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-green-600 file:text-white hover:file:bg-green-700"
                />
                {file && <div className="text-[11px] text-gray-500">{file.name} • {formatSize(file.size)} • {new Date(file.lastModified).toLocaleDateString('de-DE')}</div>}
              </div>
              <div className="flex gap-3 items-end">
                <button
                  disabled={!file||busy||(!!preview && lastPreviewSig!==fileSig)}
                  onClick={()=>{ if(!preview) { upload('preview'); } else { upload('commit'); } }}
                  className={`px-6 h-11 rounded-md font-semibold text-sm text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition ${preview? 'bg-green-600 hover:bg-green-700':'bg-blue-600 hover:bg-blue-700'}`}
                >{busy? 'Übertrage…' : (preview ? (allOk? '✅ Import starten':'Import (trotz Warnungen)') : '2. Vorschau erzeugen')}</button>
              </div>
            </div>
            {lastPreviewSig && lastPreviewSig!==fileSig && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded inline-block">Datei geändert – neue Vorschau nötig</div>}
            {errors.length>0 && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded space-y-1">{errors.map((e,i)=><div key={i}>⚠ {e}</div>)}</div>}
            {preview && !result && (
              <div className="flex flex-wrap gap-3 text-xs mt-2">
                <span className="px-2 py-1 rounded bg-gray-100">Kurse: {preview.length}</span>
                <span className="px-2 py-1 rounded bg-gray-100">Lektionen: {totalLessons}</span>
                <span className={`px-2 py-1 rounded ${allOk? 'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-800'}`}>{allOk? 'Keine Fehler gefunden':'Warnungen/Fehler: '+ (totalCourseErrors+totalLessonErrors)}</span>
              </div>
            )}
            {result && (
              <div className="mt-4 border-t pt-4 space-y-2">
                <h3 className="font-semibold text-green-700 flex items-center gap-2">✅ Import abgeschlossen</h3>
                <div className="text-sm text-gray-700">Erstellte Kurse: {result.created?.length||0}</div>
                <ul className="list-disc pl-5 text-xs text-gray-600 space-y-0.5">
                  {result.created?.map((c:any,i:number)=><li key={i}>{c.courseId} – {c.lessons} Lektionen</li>)}
                </ul>
              </div>
            )}
          </div>

          {preview && !result && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">3. Prüfung der Vorschau <span className={`text-xs px-2 py-0.5 rounded ${allOk? 'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-800'}`}>{allOk? 'OK':'Bitte prüfen'}</span></h3>
              <div className="space-y-3">
                {preview.map((c:any,i:number)=>{
                  const hasErr = c.errors?.length || c.lessons.some((l:any)=> l.errors?.length);
                  const isOpen = expanded[i] ?? true;
                  return (
                    <div key={i} className={`border rounded-lg bg-white shadow-sm ${hasErr? 'ring-1 ring-red-200':''}`}>
                      <button type="button" onClick={()=> setExpanded(p=>({...p,[i]: !isOpen}))} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-t-lg">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">{c.title} {hasErr && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Fehler</span>}</div>
                          <div className="text-[11px] text-gray-500 flex flex-wrap gap-2 items-center">{c.category && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{c.category}</span>}<span>{c.lessonCount} Lektionen</span></div>
                        </div>
                        <span className="text-xs text-gray-500">{isOpen? '▲':'▼'}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3">
                          {c.errors?.length>0 && <div className="text-xs text-red-600 mb-2">Kursfehler: {c.errors.join(', ')}</div>}
                          <ol className="space-y-1 text-xs">
                            {c.lessons.map((l:any,li:number)=>(
                              <li key={li} className="flex gap-2 items-start">
                                <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 min-w-[5.2rem] text-center">{l.type}</span>
                                <span className="flex-1 break-words">{l.title}</span>
                                {(l.questionCount!=null) && (
                                  <span className="text-blue-600">{l.questionCount} Fr.</span>
                                )}
                                {(l.pairCount!=null) && <span className="text-indigo-600">{l.pairPattern ? `${l.pairPattern} (${l.pairCount})` : `${l.pairCount}`} Paar{l.pairCount===1?'':'e'}</span>}
                                {l.errors?.length>0 && <span className="text-red-600">{l.errors.join('; ')}</span>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Seitenleiste */}
        <aside className="space-y-6">
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4 text-sm">
            <h4 className="font-semibold flex items-center gap-2">Status</h4>
            <ul className="space-y-2 text-xs">
              <li className="flex justify-between"><span>Gewählte Datei</span><span>{file? '✔️':'—'}</span></li>
              <li className="flex justify-between"><span>Vorschau</span><span>{preview? '✔️':'—'}</span></li>
              <li className="flex justify-between"><span>Fehler</span><span className={allOk? 'text-green-600':'text-red-600'}>{preview? (totalCourseErrors+totalLessonErrors): '—'}</span></li>
              <li className="flex justify-between"><span>Importiert</span><span>{result? '✔️':'—'}</span></li>
            </ul>
            {preview && !result && <div className="text-[11px] text-gray-500">Zum Start des Imports erneut auf den Button klicken.</div>}
            {result && <div className="text-[11px] text-green-700">Fertig – Kurse können jetzt bearbeitet werden.</div>}
          </div>
          {!showHelp && (
            <button onClick={()=>setShowHelp(true)} className="w-full text-xs px-3 py-2 rounded border bg-white hover:bg-gray-50">ℹ️ Kurzanleitung anzeigen</button>
          )}
        </aside>
      </div>
    </section>
  );
}
