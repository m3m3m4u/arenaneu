"use client";
import { Suspense } from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';

interface CourseItem {
  _id: string;
  title: string;
  description?: string;
  lessonCount?: number;
  category?: string;
}

type ProgressMap = Record<string, { completed: number; inProgress: number }>;

function LernenPageInner() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  // Pagination
  const pageSize = 12; // gewünschte Anzahl pro Seite
  const [serverPageSize, setServerPageSize] = useState<number>(pageSize);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0); // manuelles Reload (Retry Button)
  const [progress, setProgress] = useState<ProgressMap>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [learnerScope, setLearnerScope] = useState<'class'|'all'|undefined>(undefined);
  const [activeMode, setActiveMode] = useState<'class'|'all'>('class');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;

  // Lehrer-spezifisch: Tab & Klassen
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const search = useSearchParams();
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    try {
      const flag = (search?.get('guest') === '1') || (typeof window !== 'undefined' && localStorage.getItem('guest:active') === '1');
      setIsGuest(!!flag);
    } catch { setIsGuest(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  // Modus (class/all) initial aus URL oder localStorage lesen (nur Lernende)
  useEffect(() => {
    if (isTeacher || isAdmin) return;
    const mUrl = search?.get('mode');
    if (mUrl === 'class' || mUrl === 'all') { setActiveMode(mUrl); return; }
    try {
      const mLocal = localStorage.getItem('learner:mode');
      if (mLocal === 'class' || mLocal === 'all') setActiveMode(mLocal);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isTeacher, isAdmin]);
  // Kategorie aus URL initialisieren/aktualisieren
  useEffect(() => {
    try {
      const cat = search?.get('cat') || '';
      setSelectedCategory(cat);
  const q = search?.get('q') || '';
  setSearchText(q);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [viewTab, setViewTab] = useState<'general' | 'class'>(() => (search?.get('view') === 'class' ? 'class' : 'general'));
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(search?.get('p') || '1', 10);
    return isNaN(p) || p < 1 ? 1 : p;
  });
  const [classes, setClasses] = useState<Array<{ _id: string; name: string; courses?: Array<{ course: CourseItem }>}> >([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>(() => search?.get('classId') || '');

  // Fortschritt neu berechnen (merged global + lokal, gefiltert nach Kurs-Lektions-IDs)
  const recalcProgress = useCallback(async () => {
    if (!courses || courses.length === 0) return;
    const map: ProgressMap = {};

    try {
      const username = session?.user?.username as string | undefined;
      const hasUser = !!username;
      const globalCompleted: string[] = JSON.parse(localStorage.getItem('global:completedLessons') || '[]');

      if (hasUser && globalCompleted.length > 0) {
        // Hole Lektions-IDs je Kurs, um globale Completed den Kursen zuzuordnen
        const perCourseLessonIds = await Promise.all(
          courses.map(async (c) => {
            try {
              const res = await fetch(`/api/lessons?courseId=${c._id}`);
              if (!res.ok) return { id: c._id, ids: [] as string[] };
              const data = await res.json();
              const lessons = Array.isArray(data.lessons) ? data.lessons : [];
              return { id: c._id, ids: lessons.map((l: { _id?: string; id?: string }) => l._id || l.id).filter(Boolean) as string[] };
            } catch {
              return { id: c._id, ids: [] as string[] };
            }
          })
        );
        const idMap = new Map<string, Set<string>>(perCourseLessonIds.map(x => [x.id, new Set(x.ids)]));

        courses.forEach((c) => {
          const completedKey = `course:${c._id}:completedLessons`;
          const inProgKey = `course:${c._id}:inProgressLessons`;
          const localCompleted: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
          const courseIds = idMap.get(c._id) || new Set<string>();
          const mergedCompleted = Array.from(new Set([
            ...localCompleted,
            ...globalCompleted.filter((id) => courseIds.has(id))
          ]));
          localStorage.setItem(completedKey, JSON.stringify(mergedCompleted));
          const inProgArr: string[] = JSON.parse(localStorage.getItem(inProgKey) || '[]');
          map[c._id] = {
            completed: mergedCompleted.length,
            inProgress: Array.isArray(inProgArr) ? inProgArr.filter(id => !mergedCompleted.includes(id)).length : 0
          };
        });
      } else {
        // Fallback: nur lokale Daten nutzen
        courses.forEach((c) => {
          try {
            const completedKey = `course:${c._id}:completedLessons`;
            const inProgKey = `course:${c._id}:inProgressLessons`;
            const localCompleted: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
            const inProgArr: string[] = JSON.parse(localStorage.getItem(inProgKey) || '[]');
            map[c._id] = {
              completed: Array.isArray(localCompleted) ? localCompleted.length : 0,
              inProgress: Array.isArray(inProgArr) ? inProgArr.filter(id => !localCompleted.includes(id)).length : 0
            };
          } catch {
            map[c._id] = { completed: 0, inProgress: 0 };
          }
        });
      }
    } catch {
      // Ignorieren, Map ggf. teilweise gefüllt
    }

    setProgress(map);
  }, [courses, session?.user?.username]);

  // Allgemeine Kurse laden (Standard)
  useEffect(() => {
    if (viewTab !== 'general') return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const qParams = new URLSearchParams();
        qParams.set('mode', activeMode); // Klassen/Alle Umschalter
        qParams.set('page', String(page));
        qParams.set('limit', String(pageSize));
        if (selectedCategory) qParams.set('cat', selectedCategory);
        if (searchText.trim()) qParams.set('q', searchText.trim());
        const url = `/api/kurse?${qParams.toString()}`;
        const res = await fetch(url, { signal: controller.signal, headers: { 'Accept':'application/json' } });
        let data: any = null;
        let parseError: any = null;
        try {
          const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              data = await res.json();
            } else {
              // Fallback: Text lesen und versuchen zu parsen
              const text = await res.text();
              try { data = JSON.parse(text); } catch { data = { raw: text }; }
            }
        } catch (e) { parseError = e; }
        if (cancelled) return;
        if (res.ok && data && data.success) {
          setCourses(data.courses || []);
          setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : (data.courses?.length || 0));
          setServerPageSize(typeof data.pageSize === 'number' ? data.pageSize : pageSize);
          if (data.learnerScope) setLearnerScope(data.learnerScope);
          if (data.activeMode) setActiveMode(data.activeMode);
          if (Array.isArray(data.categories)) {
            setAllCategories((data.categories as string[]).filter(Boolean).sort((a,b)=>a.localeCompare(b,'de')));
          }
        } else {
          // Verbesserte Fehlermeldung
          const baseMsg = res.status ? `Fehler (${res.status})` : 'Fehler';
          let msg = (data && (data.error || data.message)) || (parseError ? 'Antwort unlesbar' : baseMsg);
          if (parseError) {
            console.warn('[lernen] JSON Parse Fehler /api/kurse', parseError);
          }
          setError(msg || 'Fehler beim Laden');
          setCourses([]); setTotalCount(0);
        }
      } catch (e: any) {
        if (!cancelled && e?.name !== 'AbortError') {
          console.warn('[lernen] Netzwerkfehler /api/kurse', e);
          setError('Netzwerkfehler'); setCourses([]); setTotalCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [viewTab, activeMode, page, selectedCategory, searchText, reloadTick]);

  // Klassenliste laden (nur Lehrer) – unabhängig vom Tab, damit Auswahl immer verfügbar ist
  useEffect(() => {
  if (!isTeacher || isGuest) return;
    let cancelled = false;
    const load = async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch('/api/teacher/courses/manage');
        const d = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok && d?.success) {
            const cls = (d.classes || []) as Array<{ _id: string; name: string; courses?: Array<{ course: CourseItem }> }>;
            setClasses(cls);
            if (!selectedClassId) setSelectedClassId(cls[0]?._id || '');
          } else {
            setError(d?.error || 'Fehler beim Laden der Klassen');
            setClasses([]);
          }
        }
      } catch {
        if (!cancelled) { setError('Netzwerkfehler'); setClasses([]); }
      } finally {
        if (!cancelled) { setLoadingClasses(false); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isTeacher]);

  // Wechsel der Klasse aktualisiert Kurse (nur im Klassen-Tab)
  useEffect(() => {
  if (!isTeacher || isGuest || viewTab !== 'class') return;
    const selected = classes.find(c => String(c._id) === String(selectedClassId));
    const mapped = (selected?.courses || []).map((x:any) => ({
      _id: x?.course?._id,
      title: x?.course?.title,
      description: x?.course?.description,
  lessonCount: (x?.course as any)?.lessonCount,
  category: (x?.course as any)?.category
    })).filter((c:CourseItem) => !!c._id && !!c.title);
    setCourses(mapped);
  // Für Klassensicht separate Gesamtanzahl setzen (serverseitige totalCount bezieht sich auf globalen Kursindex)
  setTotalCount(mapped.length);
  setPage(1); // Beim Klassenwechsel auf Seite 1
  }, [selectedClassId, classes, isTeacher, viewTab]);

  // URL-Query aktualisieren wenn Tab/Classe geändert
  useEffect(() => {
  if(!isTeacher || isGuest) return;
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    q.set('view', viewTab);
    if(selectedClassId) q.set('classId', selectedClassId); else q.delete('classId');
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab, selectedClassId]);

  // URL-Query bei Kategorie-Wechsel aktualisieren (behält andere Parameter bei)
  useEffect(() => {
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    if (selectedCategory) q.set('cat', selectedCategory); else q.delete('cat');
    // Kategorie-Wechsel -> erste Seite
    q.delete('p');
    setPage(1);
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // URL-Query bei Suchtext-Wechsel aktualisieren (client-seitig, rücksetz auf Seite 1)
  useEffect(() => {
    const h = setTimeout(()=>{
      const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
      if (searchText) q.set('q', searchText); else q.delete('q');
      q.delete('p');
      setPage(1);
      router.replace(`?${q.toString()}`);
    }, 250); // debounce klein
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // Modus in URL und localStorage spiegeln (nur Lernende)
  useEffect(() => {
    if (isTeacher || isAdmin) return;
    try { localStorage.setItem('learner:mode', activeMode); } catch {}
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    q.set('mode', activeMode);
    // Modus-Wechsel -> erste Seite
    q.delete('p');
    setPage(1);
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, isTeacher, isAdmin]);

  // Seite aus Query übernehmen wenn sich search ändert
  useEffect(()=>{
    const pRaw = parseInt(search?.get('p') || '1', 10);
    const p = isNaN(pRaw) || pRaw < 1 ? 1 : pRaw;
    if (p !== page) setPage(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Korrigiere Seite wenn über max hinaus (nach neuem Load)
  useEffect(()=>{
    const maxPage = Math.max(1, Math.ceil(totalCount / serverPageSize));
    if (page > maxPage) setPage(1);
  }, [totalCount, serverPageSize]);

  // Query aktualisieren wenn Seite geändert wurde (manuell über Buttons)
  useEffect(()=>{
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    if (page > 1) q.set('p', String(page)); else q.delete('p');
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    // Falls eingeloggt: serverseitigen Fortschritt holen und in localStorage mergen
  const syncProgress = async () => {
      try {
    const username = isGuest ? undefined : (session?.user?.username as string | undefined);
        if (!username) return;
        const res = await fetch(`/api/progress?username=${encodeURIComponent(username)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.completedLessons)) return;
        localStorage.setItem('global:completedLessons', JSON.stringify(data.completedLessons));
        // Nach Sync sofort neu berechnen, sofern Kurse geladen
        await recalcProgress();
      } catch {}
    };
    void syncProgress();
  }, [session?.user?.username, recalcProgress, isGuest]);

  // Bei Kurs-/Session-Änderung Fortschritt neu berechnen
  useEffect(() => {
    void recalcProgress();
  }, [courses, session?.user?.username, recalcProgress]);

  return (
  <main className="max-w-6xl mx-auto mt-6 sm:mt-10 p-4 sm:p-6">
  {isTeacher ? (
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-sm">
            <button onClick={()=>setViewTab('general')} className={"px-3 py-1.5 rounded border " + (viewTab==='general' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50')}>Allgemeiner Lernbereich</button>
            <button onClick={()=>setViewTab('class')} className={"px-3 py-1.5 rounded border " + (viewTab==='class' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50')}>Klassenspezifisch</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-600">Klasse:</label>
            <select value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)} className="border rounded px-2 py-1">
              {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            {loadingClasses && <span className="text-xs text-gray-500">Lade…</span>}
          </div>
        </div>
  ) : null}
      <h2 className="text-2xl font-bold mb-2">📚 Verfügbare Kurse</h2>
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
      {/* Umschalter nur zeigen, wenn Lernender eine Klasse hat, die 'all' erlaubt */}
      {(!isTeacher && !isAdmin && learnerScope==='all') && (
        <div className="mb-4 text-sm flex items-center gap-2">
          <span className="text-gray-600">Ansicht:</span>
          <div className="inline-flex border rounded overflow-hidden">
            <button type="button" className={(activeMode==='class'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-3 py-1.5 border-r"} onClick={()=>setActiveMode('class')}>Nur Klassenkurse</button>
            <button type="button" className={(activeMode==='all'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-3 py-1.5"} onClick={()=>setActiveMode('all')}>Alle Kurse</button>
          </div>
        </div>
      )}
      {loading && <div className="text-gray-500">Lade Kurse...</div>}
      {error && (
        <div className="text-red-600 text-sm mb-4 flex items-center gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={()=> setReloadTick(t=>t+1)}
            className="px-2 py-1 rounded border bg-white text-red-700 hover:bg-red-50 text-xs"
          >Erneut laden</button>
        </div>
      )}
      {!loading && !error && courses.length === 0 && (
        <div className="text-gray-500">{isTeacher && viewTab==='class' ? 'Für diese Klasse sind keine Kurse freigeschaltet.' : 'Für dich sind aktuell keine Kurse freigeschaltet.'}</div>
      )}
      {/* Kategorien-Filter */}
      {!loading && !error && courses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600" htmlFor="courseSearch">Suche:</label>
            <input
              id="courseSearch"
              value={searchText}
              onChange={e=>setSearchText(e.target.value)}
              placeholder="Titel / Beschreibung"
              className="border rounded px-3 py-1.5 text-sm w-56"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Fach:</span>
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1.5 rounded border text-sm ${selectedCategory === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
            >Alle</button>
            {(allCategories.length? allCategories : Array.from(new Set((courses.map(c => c.category).filter(Boolean) as string[]))).sort((a,b)=>a.localeCompare(b,'de')))
              .map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded border text-sm ${selectedCategory.toLowerCase() === cat.toLowerCase() ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
                >{cat}</button>
              ))}
          </div>
          {(searchText || selectedCategory) && (
            <div className="text-xs text-gray-500">Gefiltert (Server): {totalCount} Kurse</div>
          )}
        </div>
      )}
      {/** Gefilterte Kurse & Pagination */}
      {/** Kurse ggf. client-seitig paginieren in Klassensicht */}
      {(() => {
        const effectiveTotal = (isTeacher && viewTab==='class') ? courses.length : totalCount;
        const effectivePageSize = serverPageSize || pageSize;
        const totalPages = Math.max(1, Math.ceil(effectiveTotal / effectivePageSize));
        const pagedCourses = (isTeacher && viewTab==='class')
          ? courses.slice((page-1)*effectivePageSize, (page-1)*effectivePageSize + effectivePageSize)
          : courses; // server-seitig bereits paginiert
        return (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {pagedCourses.map(course => {
          const p = progress[course._id] || { completed: 0, inProgress: 0 };
          const lessonTotal = course.lessonCount || 0;
          const isDone = lessonTotal > 0 && p.completed === lessonTotal;
          const hasProgress = !isDone && (p.completed > 0 || p.inProgress > 0);
          const buttonLabel = isDone ? '✅ Abgeschlossen' : hasProgress ? '⏩ Weitermachen' : '▶️ Starten';
          const buttonColor = isDone ? 'bg-green-600 hover:bg-green-700' : hasProgress ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700';
          const fraction = lessonTotal > 0 ? `${p.completed}/${lessonTotal}` : '0/0';
          const barWidth = lessonTotal > 0 ? (p.completed / lessonTotal) * 100 : 0;
          return (
            <div key={course._id} className="bg-white rounded shadow p-6 border flex flex-col gap-3">
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                  {course.title}
                  {isDone && <span className="text-green-600 text-sm font-semibold">✓</span>}
                </h3>
                <p className="text-gray-700 mb-3 text-sm line-clamp-3">{course.description}</p>
                <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
                  <span>{lessonTotal} Lektionen</span>
                  <span>{fraction}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded overflow-hidden mb-3">
                  <div className={`${isDone ? 'bg-green-500' : 'bg-blue-500'} h-2 transition-all`} style={{ width: barWidth + '%' }}></div>
                </div>
              </div>
              <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-gray-500">
                  {isDone ? 'Alle Lektionen abgeschlossen' : hasProgress ? 'Fortschritt vorhanden' : 'Noch nicht begonnen'}
                </span>
                <a 
                  href={`/kurs/${course._id}`}
                  className={`${buttonColor} text-white px-4 py-2 rounded font-semibold transition text-sm`}
                >{buttonLabel}</a>
              </div>
            </div>
          );
            })}
          </div>
        );
      })()}
      {/** Pagination Controls */}
      {(() => {
        const effectiveTotal = (isTeacher && viewTab==='class') ? courses.length : totalCount;
        const effectivePageSize = serverPageSize || pageSize;
        const totalPages = Math.max(1, Math.ceil(effectiveTotal / effectivePageSize));
        if (totalPages <= 1) return null;
        const prev = () => setPage(p => Math.max(1, p-1));
        const next = () => setPage(p => Math.min(totalPages, p+1));
        // einfache Seitennavigation (bis zu 5 Buttons um aktuelle Seite)
        const windowSize = 5;
        let start = Math.max(1, page - Math.floor(windowSize/2));
        let end = start + windowSize - 1;
        if (end > totalPages) { end = totalPages; start = Math.max(1, end - windowSize + 1); }
        const pages: number[] = [];
        for (let i=start; i<=end; i++) pages.push(i);
        return (
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            <button onClick={prev} disabled={page===1} className={`px-3 py-1.5 rounded border text-sm ${page===1? 'text-gray-400 bg-gray-100 cursor-not-allowed':'bg-white hover:bg-gray-50'}`}>«</button>
            {start > 1 && (
              <button onClick={()=>setPage(1)} className={`px-3 py-1.5 rounded border text-sm ${page===1? 'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>1</button>
            )}
            {start > 2 && <span className="px-2 text-sm text-gray-500">…</span>}
            {pages.map(pn => (
              <button key={pn} onClick={()=>setPage(pn)} className={`px-3 py-1.5 rounded border text-sm ${pn===page? 'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>{pn}</button>
            ))}
            {end < totalPages-1 && <span className="px-2 text-sm text-gray-500">…</span>}
            {end < totalPages && (
              <button onClick={()=>setPage(totalPages)} className={`px-3 py-1.5 rounded border text-sm ${page===totalPages? 'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>{totalPages}</button>
            )}
            <button onClick={next} disabled={page===totalPages} className={`px-3 py-1.5 rounded border text-sm ${page===totalPages? 'text-gray-400 bg-gray-100 cursor-not-allowed':'bg-white hover:bg-gray-50'}`}>»</button>
            <div className="basis-full text-center text-[11px] text-gray-500 mt-1">Seite {page} / {totalPages} • Gesamt {(isTeacher && viewTab==='class') ? courses.length : totalCount}</div>
          </div>
        );
      })()}
  {/* Zurück-Link entfernt: Header bietet Navigation */}
    </main>
  );
}

export default function LernenPage() {
  return (
  <Suspense fallback={<main className="max-w-6xl mx-auto mt-6 sm:mt-10 p-4 sm:p-6 text-gray-500">Lade…</main>}>
      <LernenPageInner />
    </Suspense>
  );
}
