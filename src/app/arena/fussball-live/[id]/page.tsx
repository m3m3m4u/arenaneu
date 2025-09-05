"use client";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';

interface MCQuestion { id:string; text:string; options:string[]; correct:number; }

export default function FussballLivePage(){
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const FIELD_IMAGES = useMemo(() => [
    '/media/spielfelder/spielfeld1.JPG',
    '/media/spielfelder/spielfeld2.JPG',
    '/media/spielfelder/spielfeld3.JPG',
    '/media/spielfelder/spielfeld4.JPG',
    '/media/spielfelder/spielfeld5.JPG',
    '/media/spielfelder/spielfeld6.JPG',
    '/media/spielfelder/spielfeld7.JPG',
  ], []);
  const [fieldIdx, setFieldIdx] = useState<number>(() => Math.floor(Math.random() * 7));

  // Fragen aus gewählter Übung laden
  const [questions, setQuestions] = useState<MCQuestion[]>([]);
  const [exerciseTitle, setExerciseTitle] = useState<string|undefined>();
  const [loadingQs, setLoadingQs] = useState<boolean>(true);
  const [errorQs, setErrorQs] = useState<string|undefined>();
  const [history,setHistory] = useState<Array<{id:string; correct:boolean}>>([]);
  const [current,setCurrent] = useState<MCQuestion|undefined>();
  const [locked,setLocked] = useState(false);
  const [answerState,setAnswerState] = useState<{picked:number|null; correct:boolean|null}>({ picked:null, correct:null });

  const correctCounts = useMemo(()=>{
    const map:Record<string,{asked:number; wrong:number}> = {};
    history.forEach(h=>{ if(!map[h.id]) map[h.id]={asked:0,wrong:0}; map[h.id].asked++; if(!h.correct) map[h.id].wrong++; });
    return map;
  },[history]);

  const pickNext = useCallback(()=>{
    if(!questions.length) return;
    // Gewichtung: Baseline 1, plus 2 * wrongCount (mehr Gewicht für falsche)
    const weights = questions.map(q=>{ const stats = correctCounts[q.id]; const w = 1 + (stats? stats.wrong*2 : 0); return { q, w }; });
    const total = weights.reduce((a,b)=>a+b.w,0);
    let r = Math.random()*total;
    for(const item of weights){ if(r < item.w){ setCurrent(item.q); return; } r -= item.w; }
    setCurrent(weights[weights.length-1].q);
  },[questions, correctCounts]);

  useEffect(()=>{ if(questions.length) pickNext(); },[pickNext, questions.length]);

  // Übung aus Lobby laden und Fragen setzen
  useEffect(()=>{
    let alive = true;
    (async()=>{
      try{
        setLoadingQs(true); setErrorQs(undefined);
        // Lobby laden -> lessonId
        const rLobby = await fetch(`/api/fussball/lobbies/${encodeURIComponent(id)}/join`);
        const jLobby = await rLobby.json();
        if(!jLobby?.success) throw new Error('Lobby nicht gefunden');
        const lessonId: string | undefined = jLobby.lobby?.lessonId;
        if(!lessonId){
          throw new Error('Keine Übung in dieser Lobby hinterlegt');
        }
        // Übung laden
        const rEx = await fetch(`/api/exercises?lessonId=${encodeURIComponent(lessonId)}`);
        const jEx = await rEx.json();
        if(!jEx?.success || !jEx.exercise) throw new Error('Übung nicht gefunden');
        const mapped = toMcQuestions(jEx.exercise);
        if(alive){ setExerciseTitle(mapped.title); setQuestions(mapped.items); }
      } catch(e:any){ if(alive) setErrorQs(e?.message || String(e)); }
      finally { if(alive) setLoadingQs(false); }
    })();
    return ()=>{ alive=false; };
  },[id]);

  function answer(idx:number){
    if(!current || locked) return;
    setLocked(true);
    const isCorrect = idx === current.correct;
    setAnswerState({ picked:idx, correct:isCorrect });
    setHistory(h=>[...h,{ id: current.id, correct: isCorrect }]);
    setTimeout(()=>{ setLocked(false); setAnswerState({ picked:null, correct:null }); pickNext(); }, isCorrect? 800 : 1300);
  }

  // Platzhalter Spielfeld: später echte Canvas / Engine
  // Zeigt Statistik der beantworteten Fragen
  const stats = useMemo(()=>{
    const asked = history.length;
    const wrong = history.filter(h=>!h.correct).length;
    return { asked, wrong, correct: asked - wrong };
  },[history]);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="mb-4 flex flex-col md:flex-row md:items-end gap-2 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">⚽ Fußball Match</h1>
          <p className="text-xs text-gray-500">Lobby ID: <span className="font-mono">{id}</span></p>
          {exerciseTitle && <p className="text-xs text-gray-500">Übung: <span className="font-medium">{exerciseTitle}</span></p>}
        </div>
        <div className="text-xs text-gray-500 flex gap-4">
          <span>Fragen: {stats.asked}</span>
          <span>Korrekt: {stats.correct}</span>
          <span>Falsch: {stats.wrong}</span>
        </div>
        <div className="ml-auto text-xs"><a href="/arena/fussball2" className="text-blue-600 hover:underline">Zur Lobby</a></div>
      </header>
      {loadingQs && (
        <div className="mb-4 p-2 rounded bg-gray-50 border text-xs text-gray-600">Lade Fragen aus Übung…</div>
      )}
      {errorQs && (
        <div className="mb-4 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">{errorQs}</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Linke Spalte: Fragen */}
        <div className="flex flex-col gap-4">
          <div className="p-4 border rounded bg-white shadow-sm min-h-[240px] flex flex-col">
            <div className="text-sm font-semibold text-gray-600 mb-2">Frage</div>
            {current ? (
              <>
                <div className="text-base md:text-lg font-medium mb-4">{current.text}</div>
                <div className="flex flex-col gap-2">
                  {current.options.map((opt,i)=>{
                    const picked = answerState.picked===i;
                    const showCorrect = answerState.correct!==null;
                    const isCorrect = i===current.correct;
                    const base='text-left px-3 py-2 rounded border text-sm transition-colors';
                    let cls=base+' border-gray-200 bg-white hover:bg-gray-50';
                    if(showCorrect){
                      if(isCorrect) cls=base+' border-green-600 bg-green-50 text-green-800 font-semibold';
                      else if(picked && !isCorrect) cls=base+' border-red-500 bg-red-50 text-red-700';
                      else cls=base+' border-gray-200 bg-gray-50 opacity-70';
                    } else if(picked){
                      cls=base+' border-blue-500 bg-blue-50';
                    }
                    return <button key={i} disabled={locked || showCorrect} onClick={()=>answer(i)} className={cls}>{opt}</button>;
                  })}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">{loadingQs? 'Lade Fragen…' : (questions.length? 'Lade nächste Frage…' : 'Keine Fragen gefunden')}</div>
            )}
          </div>
          <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-xs leading-relaxed">
            Gewichtete Wiederholung aktiv: Falsch beantwortete Fragen tauchen wahrscheinlicher erneut auf. Diese Logik ist lokal – später serverseitig synchronisiert.
          </div>
        </div>
        {/* Rechte Spalte: Spielfeld mit Foto-Hintergrund */}
        <div className="relative border rounded bg-black shadow-inner aspect-[16/9] overflow-hidden">
          <Image src={FIELD_IMAGES[fieldIdx % FIELD_IMAGES.length]} alt="Spielfeld" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30 pointer-events-none" />
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/50 text-white backdrop-blur">
            Spielfeld: {fieldIdx + 1}/{FIELD_IMAGES.length}
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <button onClick={()=> setFieldIdx(i=> (i-1+FIELD_IMAGES.length)%FIELD_IMAGES.length)} className="px-2 py-1 text-[10px] rounded bg-white/70 hover:bg-white text-gray-900">◀</button>
            <button onClick={()=> setFieldIdx(i=> (i+1)%FIELD_IMAGES.length)} className="px-2 py-1 text-[10px] rounded bg-white/70 hover:bg-white text-gray-900">▶</button>
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
            {questions.map(q=>{ const statsQ = correctCounts[q.id]; const wrong = statsQ?.wrong||0; const asked = statsQ?.asked||0; return (
              <div key={q.id} className="flex flex-col items-center">
                <span className="w-2 h-2 rounded-full" style={{ background: wrong? '#dc2626': (asked? '#16a34a':'#9ca3af') }} />
                <span className="text-[8px] text-white/70 mt-0.5">{asked}</span>
              </div>
            ); })}
          </div>
        </div>
      </div>
    </main>
  );
}

// (Das frühere SVG-Pitch wurde durch Foto-Hintergründe ersetzt)

// Daten aus Lobby/Exercise laden
async function fetchLobby(lobbyId: string){
  try{
    const r = await fetch(`/api/fussball/lobbies/${lobbyId}/join`);
    const j = await r.json();
    if(j?.success) return j.lobby as { id:string; title:string; lessonId?:string };
  }catch{}
  throw new Error('Lobby nicht gefunden');
}

type ExerciseApi = { success:boolean; exercise?: { _id:string; title:string; type:string; questions?: Array<{ question:string; allAnswers?:string[]; correctAnswer?:string; correctAnswers?:string[]; wrongAnswers?:string[] }>} };

async function fetchExercise(lessonId: string){
  const r = await fetch(`/api/exercises?lessonId=${encodeURIComponent(lessonId)}`);
  const j: ExerciseApi = await r.json();
  if(!j.success || !j.exercise) throw new Error('Übung nicht gefunden');
  return j.exercise;
}

function toMcQuestions(exercise: NonNullable<ExerciseApi['exercise']>): { title?:string; items: MCQuestion[] }{
  const items: MCQuestion[] = [];
  const qs = Array.isArray(exercise.questions)? exercise.questions : [];
  qs.forEach((q, idx)=>{
    let options: string[] = Array.isArray(q.allAnswers) && q.allAnswers.length? [...q.allAnswers] : [];
    // Fallback-Optionen aus korrekt + falsch bauen
    if(options.length === 0){
      const pool = new Set<string>();
      if(q.correctAnswer) pool.add(q.correctAnswer);
      (q.correctAnswers||[]).forEach(a=> pool.add(a));
      (q.wrongAnswers||[]).forEach(a=> pool.add(a));
      options = Array.from(pool);
    }
    if(options.length === 0) return; // Frage überspringen
    // Korrekte Antwort bestimmen (single-choice bevorzugt)
    let correctAnswer: string | undefined = q.correctAnswer || (q.correctAnswers && q.correctAnswers[0]) || undefined;
    if(!correctAnswer){
      // Wenn allAnswers existiert und erste Antwort korrekt sein soll, nimm Index 0
      correctAnswer = options[0];
    }
    // Sicherstellen, dass die korrekte Antwort in den Optionen ist
    if(!options.includes(correctAnswer)) options = [correctAnswer, ...options];
    // Eindeutig machen
    options = Array.from(new Set(options));
    const correct = Math.max(0, options.indexOf(correctAnswer));
    items.push({ id: `q${idx}`, text: q.question || `Frage ${idx+1}`, options, correct });
  });
  return { title: exercise.title, items };
}

// Ende
