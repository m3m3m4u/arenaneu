"use client";

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';

interface Exercise { _id: string; title: string; type: string; courseId: string; createdAt?: string; category?: string; }

function UebenInner() {
  // Gesamtliste aller Übungen (ungefiltert)
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const isTeacher = role === 'teacher';
  const [classes, setClasses] = useState<Array<{ _id:string; name:string; exercises?: any[] }>>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);
  useEffect(()=>{
    try { const p = new URLSearchParams(window.location.search); setIsGuest(p.get('guest')==='1' || localStorage.getItem('guest:active')==='1'); } catch {}
  },[]);
  useEffect(()=>{
    try { setSelectedCategory(search?.get('cat') || ''); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const load = useCallback(async () => {
    // Immer alle Übungen laden; Filter erfolgt clientseitig, damit die Button-Leiste vollständig bleibt
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/exercises`);
      const data = await res.json();
      if (data.success) setAllExercises(data.exercises || []); else setError(data.error || 'Fehler');
    } catch { setError('Netzwerkfehler'); } finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); }, [load]);
  // Klassen + bereits zugeordnete Übungen laden (Teacher)
  useEffect(()=>{
    if(!isTeacher) return;
    (async()=>{
      try {
        const r = await fetch('/api/teacher/courses/manage');
        const d = await r.json();
        if(r.ok && d.success) {
          setClasses(d.classes||[]);
          if(!selectedClassId && d.classes?.length) setSelectedClassId(d.classes[0]._id);
        }
      } catch {}
    })();
  }, [isTeacher, selectedClassId]);
  // Sync Kategorie in URL (?cat=)
  useEffect(()=>{
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    if (selectedCategory) q.set('cat', selectedCategory); else q.delete('cat');
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  return (
  <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">✏️ Übungen</h2>
          <p className="text-gray-600">Freie Übungslektionen zur Wiederholung.</p>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-50">🔄 Aktualisieren</button>
        {isTeacher && classes.length>0 && (
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-600">Klasse:</label>
            <select value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)} className="border rounded px-2 py-1">
              {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
    {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">{error}</div>}
    {!loading && allExercises.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-600 mr-1">Fach:</span>
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded border text-sm ${selectedCategory === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
          >Alle</button>
      {Array.from(new Set((allExercises.map(e => e.category).filter(Boolean) as string[])))
            .sort((a, b) => a.localeCompare(b, 'de'))
            .map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded border text-sm ${selectedCategory.toLowerCase() === cat.toLowerCase() ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
              >{cat}</button>
            ))}
        </div>
      )}
    {loading ? <div className="text-gray-500">Lade…</div> : (
    allExercises.length === 0 ? <div className="text-gray-500 text-sm">Noch keine Übungen vorhanden.</div> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {(selectedCategory ? allExercises.filter(e => (e.category || '').toLowerCase() === selectedCategory.toLowerCase()) : allExercises).map(ex => {
              const link = ex.courseId && ex.courseId !== 'exercise-pool' ? `/kurs/${ex.courseId}/lektion/${ex._id}` : `/kurs/${ex.courseId || 'exercise-pool'}/lektion/${ex._id}`;
              const alreadyAssigned = isTeacher && selectedClassId ? (classes.find(c=>c._id===selectedClassId)?.exercises||[]).some((a:any)=>a.lesson?._id===ex._id) : false;
              return (
                <div key={ex._id} className="border rounded p-4 bg-white hover:shadow-sm transition flex flex-col gap-2">
                  <a href={link} className="group">
                    <h3 className="font-semibold truncate group-hover:underline" title={ex.title}>{ex.title}</h3>
                  </a>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{ex.type}</span>
                    {ex.category && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded" title="Fach">{ex.category}</span>}
                    {ex.createdAt && <span>{new Date(ex.createdAt).toLocaleDateString('de-DE')}</span>}
                  </div>
                  {isTeacher && selectedClassId && (
                    <div className="mt-2">
                      {alreadyAssigned ? (
                        <button
                          disabled={assigning===ex._id}
                          onClick={async()=>{
                            setAssigning(ex._id);
                            try { await fetch('/api/teacher/courses/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'disableExercise', classId: selectedClassId, lessonId: ex._id }) });
                              // reload classes
                              const r=await fetch('/api/teacher/courses/manage'); const d=await r.json(); if(r.ok && d.success) setClasses(d.classes||[]);
                            } finally { setAssigning(null); }
                          }}
                          className="w-full text-xs px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50">
                          ✅ Zugeordnet (Klicken zum Entfernen)
                        </button>
                      ) : (
                        <button
                          disabled={assigning===ex._id}
                          onClick={async()=>{
                            setAssigning(ex._id);
                            try { await fetch('/api/teacher/courses/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'enableExercise', classId: selectedClassId, lessonId: ex._id }) });
                              const r=await fetch('/api/teacher/courses/manage'); const d=await r.json(); if(r.ok && d.success) setClasses(d.classes||[]);
                            } finally { setAssigning(null); }
                          }}
                          className="w-full text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                          ➕ Übung zuordnen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      <div className="mt-10">
  <a href="/dashboard" className="text-blue-600 hover:underline text-sm">← Zurück zur Startseite</a>
      </div>
    </main>
  );
}

export default function UebenPage(){
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto mt-10 p-6"><div className="text-gray-500">Lade…</div></main>}>
      <UebenInner />
    </Suspense>
  );
}
