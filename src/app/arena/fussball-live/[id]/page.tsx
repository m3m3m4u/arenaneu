"use client";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  // Feldposition: 0..6 mit 3 (entspricht 4) als neutral
  const NEUTRAL_INDEX = 3;
  const LEFT_GOAL_INDEX = 0;
  const RIGHT_GOAL_INDEX = 6;
  const STEP = 3; // alle 3 Punkte Vorsprung = 1 Schritt
  const [fieldIdx, setFieldIdx] = useState<number>(NEUTRAL_INDEX);
  // Natürliche Bildgröße für korrektes Seitenverhältnis
  const [fieldWH, setFieldWH] = useState<{w:number; h:number} | null>(null);

  // Fragen aus gewählter Übung laden
  const [questions, setQuestions] = useState<MCQuestion[]>([]);
  const [exerciseTitle, setExerciseTitle] = useState<string|undefined>();
  const [loadingQs, setLoadingQs] = useState<boolean>(true);
  const [errorQs, setErrorQs] = useState<string|undefined>();
  const [history,setHistory] = useState<Array<{id:string; correct:boolean}>>([]);
  // Team-Score und Zugseite (welches Team ist am Zug)
  const [scores, setScores] = useState<{left:number; right:number}>({ left: 0, right: 0 });
  const [goals, setGoals] = useState<{left:number; right:number}>({ left: 0, right: 0 });
  const [turn, setTurn] = useState<'left'|'right'>('left');
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
    // Punktewertung: Bei korrekter Antwort erhält das Team am Zug einen Punkt
    if(isCorrect){
      setScores(s=> ({ ...s, [turn]: s[turn] + 1 } as any));
    }
    setHistory(h=>[...h,{ id: current.id, correct: isCorrect }]);
    // Nach der Antwort wechselt der Zug zum anderen Team
    setTimeout(()=>{
      setLocked(false);
      setAnswerState({ picked:null, correct:null });
      setTurn(t=> t==='left'?'right':'left');
      pickNext();
    }, isCorrect? 800 : 1300);
  }

  // Platzhalter Spielfeld: später echte Canvas / Engine
  // Zeigt Statistik der beantworteten Fragen
  const stats = useMemo(()=>{
    const asked = history.length;
    const wrong = history.filter(h=>!h.correct).length;
    return { asked, wrong, correct: asked - wrong };
  },[history]);

  // Bildseitenverhältnis anhand des aktuellen Feldbilds bestimmen
  useEffect(()=>{
    const src = FIELD_IMAGES[fieldIdx % FIELD_IMAGES.length];
    let cancelled = false;
  const img = new window.Image();
    img.onload = () => { if(!cancelled){ setFieldWH({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 }); } };
    img.onerror = () => { if(!cancelled){ setFieldWH({ w: 16, h: 9 }); } };
    img.src = src;
    return ()=>{ cancelled = true; };
  },[FIELD_IMAGES, fieldIdx]);

  // Feldposition abhängig vom aktuellen Vorsprung bewegen; bei 1/7 -> Tor und Reset
  const handlingGoalRef = useRef(false);
  useEffect(()=>{
    if(handlingGoalRef.current) return;
    const rawLead = scores.left - scores.right; // >0: links führt, <0: rechts führt
    const steps = Math.min(3, Math.floor(Math.abs(rawLead) / STEP));
    const desiredIdx = rawLead > 0
      ? Math.max(LEFT_GOAL_INDEX, NEUTRAL_INDEX - steps)
      : rawLead < 0
        ? Math.min(RIGHT_GOAL_INDEX, NEUTRAL_INDEX + steps)
        : NEUTRAL_INDEX;
    // Tor erreicht?
    if(desiredIdx === LEFT_GOAL_INDEX || desiredIdx === RIGHT_GOAL_INDEX){
      handlingGoalRef.current = true;
      // Tor für führendes Team verbuchen
      setGoals(g=> desiredIdx===LEFT_GOAL_INDEX ? ({ ...g, left: g.left + 1 }) : ({ ...g, right: g.right + 1 }));
      // Punkte zurücksetzen und Feld neutralisieren
      setTimeout(()=>{
        setScores({ left: 0, right: 0 });
        setFieldIdx(NEUTRAL_INDEX);
        handlingGoalRef.current = false;
      }, 100); // kurzer Tick, damit UI Torzustand erkennen kann
      return;
    }
    setFieldIdx(desiredIdx);
  },[scores.left, scores.right]);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="mb-4 flex flex-col md:flex-row md:items-end gap-2 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">⚽ Fußball Match</h1>
          <p className="text-xs text-gray-500">Lobby ID: <span className="font-mono">{id}</span></p>
          {exerciseTitle && <p className="text-xs text-gray-500">Übung: <span className="font-medium">{exerciseTitle}</span></p>}
        </div>
        <div className="text-xs text-gray-700 flex flex-wrap items-center gap-3">
          <span>Fragen: {stats.asked}</span>
          <span>Korrekt: {stats.correct}</span>
          <span>Falsch: {stats.wrong}</span>
          <span className="ml-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-100 border">
            <span className="font-semibold">Score</span>
            <span className="text-[11px]">Links</span>
            <span className="px-1 rounded bg-white border font-mono">{scores.left}</span>
            <span className="text-[11px]">Rechts</span>
            <span className="px-1 rounded bg-white border font-mono">{scores.right}</span>
            <span className="ml-1 text-[11px]">Zug: <b>{turn==='left'?'Links':'Rechts'}</b></span>
          </span>
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-green-50 border border-green-200 text-green-800">
            <span className="font-semibold">Tore</span>
            <span className="text-[11px]">Links</span>
            <span className="px-1 rounded bg-white border font-mono">{goals.left}</span>
            <span className="text-[11px]">Rechts</span>
            <span className="px-1 rounded bg-white border font-mono">{goals.right}</span>
          </span>
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
        {/* Rechte Spalte: Spielfeld mit Foto-Hintergrund im Original-Seitenverhältnis */}
        <div
          className="relative border rounded bg-black shadow-inner overflow-hidden"
          style={{ aspectRatio: fieldWH ? `${fieldWH.w}/${fieldWH.h}` : '16/9' }}
        >
          <Image src={FIELD_IMAGES[fieldIdx % FIELD_IMAGES.length]} alt="Spielfeld" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30 pointer-events-none" />
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/50 text-white backdrop-blur">
            Spielfeld: {fieldIdx + 1}/{FIELD_IMAGES.length}
          </div>
          {/* Manuelle Bildwechsel entfernt – Position ergibt sich aus Vorsprung */}
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
