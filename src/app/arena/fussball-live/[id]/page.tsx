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
  // Synchronisierter Zustand vom Server
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

  // Nur initial oder wenn keine aktuelle Frage vorhanden ist automatisch wählen
  useEffect(()=>{ if(questions.length && !current) pickNext(); },[questions.length, current, pickNext]);

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
  const mapped = buildQuestionsFromExercise(jEx.exercise);
        if(alive){ setExerciseTitle(mapped.title); setQuestions(mapped.items); }
      } catch(e:any){ if(alive) setErrorQs(e?.message || String(e)); }
      finally { if(alive) setLoadingQs(false); }
    })();
    return ()=>{ alive=false; };
  },[id]);

  const answeringRef = useRef(false);
  async function answer(idx:number){
    if(!current || answeringRef.current) return;
    answeringRef.current = true;
    setLocked(true);
    const isCorrect = idx === current.correct;
    setAnswerState({ picked:idx, correct:isCorrect });
    try{
      const r = await fetch(`/api/fussball/lobbies/${encodeURIComponent(id)}/answer`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ correct: isCorrect }) });
      const j = await r.json();
      if(j?.success && j.state){ setScores(j.state.scores); setGoals(j.state.goals); setFieldIdx(j.state.fieldIdx); setTurn(j.state.turn); }
    } finally {
      setHistory(h=>[...h,{ id: current.id, correct: isCorrect }]);
      setTimeout(()=>{
        setLocked(false);
        setAnswerState({ picked:null, correct:null });
        pickNext();
        answeringRef.current = false;
      }, isCorrect? 800 : 1300);
    }
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

  // Server-Sync: Zustand pollen, damit beide Geräte synchron bleiben
  useEffect(()=>{
    let alive = true; let t:any;
    async function tick(){
      try{
        const r = await fetch(`/api/fussball/lobbies/${encodeURIComponent(id)}/state`, { cache:'no-store' });
        const j = await r.json();
        if(!alive) return;
        if(j?.success && j.state){ setScores(j.state.scores); setGoals(j.state.goals); setFieldIdx(j.state.fieldIdx); setTurn(j.state.turn); }
      } finally { if(alive){ t = setTimeout(tick, 600); } }
    }
    tick();
    return ()=>{ alive=false; if(t) clearTimeout(t); };
  },[id]);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">⚽ Fußball Match</h1>
          {exerciseTitle && <p className="text-xs text-gray-500">Übung: <span className="font-medium">{exerciseTitle}</span></p>}
        </div>
        <div className="md:col-span-2">
      {/* Großer Spielstand (Tore) – einzige Anzeige */}
          <div className="w-full bg-white border rounded shadow-sm p-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
        <div className="text-[11px] text-gray-500">Tore Rot</div>
        <div className="text-3xl md:text-5xl font-extrabold leading-none text-red-600">{goals.left}</div>
                <div className="text-[11px] text-gray-400 mt-1">Punkte: {scores.left}</div>
              </div>
              <div className="text-2xl font-bold text-gray-400">:</div>
              <div className="text-center">
        <div className="text-[11px] text-gray-500">Tore Blau</div>
        <div className="text-3xl md:text-5xl font-extrabold leading-none text-blue-600">{goals.right}</div>
                <div className="text-[11px] text-gray-400 mt-1">Punkte: {scores.right}</div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <span className="text-[11px] text-gray-500">Fragen</span>
              <span className="px-2 py-0.5 rounded bg-gray-50 border text-xs">{stats.asked}</span>
              <span className="text-[11px] text-gray-500">Korrekt</span>
              <span className="px-2 py-0.5 rounded bg-green-50 border text-xs">{stats.correct}</span>
              <span className="text-[11px] text-gray-500">Falsch</span>
              <span className="px-2 py-0.5 rounded bg-red-50 border text-xs">{stats.wrong}</span>
            </div>
          </div>
        </div>
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
                <div className="text-xl md:text-2xl font-medium mb-4">{current.text}</div>
        <div className="flex flex-col gap-3">
                  {current.options.map((opt,i)=>{
                    const picked = answerState.picked===i;
                    const showCorrect = answerState.correct!==null;
                    const isCorrect = i===current.correct;
          // +200% Größe: deutlich größere Buttons
          const base='text-left px-6 py-4 rounded border text-xl md:text-2xl transition-colors';
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
        </div>
        {/* Rechte Spalte: Spielfeld mit Foto-Hintergrund im Original-Seitenverhältnis */}
        <FieldView
          images={FIELD_IMAGES}
          fieldIdx={fieldIdx}
          fieldWH={fieldWH}
          questions={questions}
          correctCounts={correctCounts}
          goals={goals}
          scores={scores}
          current={current}
          locked={locked}
          answerState={answerState}
          onAnswer={answer}
        />
      </div>
    </main>
  );
}

// (Das frühere SVG-Pitch wurde durch Foto-Hintergründe ersetzt)

// Komponente: Spielfeld mit 40% kleinerer Darstellung und Vollbildmodus
function FieldView({ images, fieldIdx, fieldWH, questions, correctCounts, goals, scores, current, locked, answerState, onAnswer }:{ images:string[]; fieldIdx:number; fieldWH:{w:number;h:number}|null; questions:MCQuestion[]; correctCounts:Record<string,{asked:number; wrong:number}>; goals:{left:number;right:number}; scores:{left:number;right:number}; current:MCQuestion|undefined; locked:boolean; answerState:{picked:number|null; correct:boolean|null}; onAnswer:(idx:number)=>void }){
  const containerRef = useRef<HTMLDivElement|null>(null);
  const [isFs,setIsFs]=useState(false);
  // TOR-Overlay für 5 Sekunden einblenden, wenn sich die Tore erhöhen
  const [goalOverlay, setGoalOverlay] = useState<{show:boolean; side:'left'|'right'|'both'|null}>({ show:false, side:null });
  const prevGoalsRef = useRef<{left:number; right:number}>({ left: goals.left, right: goals.right });
  const goalTimerRef = useRef<any>(null);
  useEffect(()=>{
    const prev = prevGoalsRef.current;
    const incLeft = goals.left > prev.left;
    const incRight = goals.right > prev.right;
    if(incLeft || incRight){
      // Bestimme Seite, bei gleichzeitiger Erhöhung (sollte selten sein) zeige 'both'
      const side = incLeft && incRight ? 'both' : (incLeft ? 'left' : 'right');
      setGoalOverlay({ show:true, side });
      if(goalTimerRef.current) clearTimeout(goalTimerRef.current);
      goalTimerRef.current = setTimeout(()=> setGoalOverlay({ show:false, side:null }), 5000);
    }
    prevGoalsRef.current = { left: goals.left, right: goals.right };
    return ()=>{ /* kein cleanup hier notwendig */ };
  },[goals.left, goals.right]);
  // 40% kleiner: wir skalieren die Breite relativ runter (0.6)
  const scale = 0.6; // 60% der normalen Größe
  const enterFs = async()=>{
    try{
      const el = containerRef.current;
      if(!el) return;
      if(el.requestFullscreen){ await el.requestFullscreen(); setIsFs(true); }
      // Safari iOS: kein echtes Fullscreen API; wir machen Fallback via CSS (handled durch :fullscreen)
    }catch{}
  };
  const exitFs = async()=>{
    try{ if(document.fullscreenElement){ await document.exitFullscreen(); } setIsFs(false); }catch{}
  };
  useEffect(()=>{
    const h=()=> setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', h);
    return ()=> document.removeEventListener('fullscreenchange', h);
  },[]);
  const aspect = fieldWH ? `${fieldWH.w}/${fieldWH.h}` : '16/9';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        {!isFs ? (
          <button onClick={enterFs} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">Vollbild</button>
        ) : (
          <button onClick={exitFs} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">Vollbild beenden</button>
        )}
      </div>
      <div
        ref={containerRef}
        className={"relative border rounded bg-black shadow-inner overflow-hidden mx-auto " + (isFs? 'fixed inset-0 z-50 rounded-none border-0 mx-0':'')}
        style={isFs? { width: '100%', height: '100%' } : { aspectRatio: aspect, width: `${Math.round(100*scale)}%` }}
      >
        {!isFs && (
          <>
            <Image src={images[fieldIdx % images.length]} alt="Spielfeld" fill priority sizes="100vw" className="object-contain" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30 pointer-events-none" />
          </>
        )}
        {isFs && (
          <div className="absolute inset-0 flex flex-col text-white">
            {/* Oben: 25% Score/Infos */}
            <div style={{height:'25%'}} className="flex items-center justify-between px-4 md:px-6">
              <button onClick={exitFs} className="text-xs px-2 py-1 border rounded bg-white/10 hover:bg-white/20 text-white">Vollbild beenden</button>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-[11px] text-white/80">Tore Rot</div>
                  <div className="text-4xl md:text-6xl font-extrabold leading-none text-red-400">{goals.left}</div>
                  <div className="text-[11px] text-white/70 mt-1">Punkte: {scores.left}</div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-white/70">:</div>
                <div className="text-center">
                  <div className="text-[11px] text-white/80">Tore Blau</div>
                  <div className="text-4xl md:text-6xl font-extrabold leading-none text-blue-400">{goals.right}</div>
                  <div className="text-[11px] text-white/70 mt-1">Punkte: {scores.right}</div>
                </div>
              </div>
              <div className="w-16" />
            </div>
            {/* Unten: 75% – links Fragen, rechts Spielfeld */}
            <div style={{height:'75%'}} className="grid grid-cols-2 gap-4 px-4 md:px-6 pb-4">
              <div className="h-full overflow-auto">
                <div className="bg-white/10 border border-white/15 rounded p-3 md:p-4">
                  <div className="text-[11px] md:text-sm opacity-90 mb-1">Frage</div>
                  {current ? (
                    <>
                      <div className="text-base md:text-2xl font-medium mb-3">{current.text}</div>
            <div className="flex flex-col gap-3">
                        {current.options.map((opt,i)=>{
                          const picked = answerState.picked===i;
                          const showCorrect = answerState.correct!==null;
                          const isCorrect = i===current.correct;
              // +200% Größe im Vollbild
              const base='text-left px-6 py-4 rounded border text-base md:text-2xl transition-colors';
                          let cls=base+' border-white/20 bg-white/10 hover:bg-white/15 text-white';
                          if(showCorrect){
                            if(isCorrect) cls=base+' border-green-500 bg-green-600/20 text-green-200 font-semibold';
                            else if(picked && !isCorrect) cls=base+' border-red-500 bg-red-600/20 text-red-200';
                            else cls=base+' border-white/10 bg-white/5 text-white/70';
                          } else if(picked){
                            cls=base+' border-blue-400 bg-blue-500/20 text-blue-100';
                          }
                          return <button key={i} disabled={locked || showCorrect} onClick={()=>onAnswer(i)} className={cls}>{opt}</button>;
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-[12px] text-white/80">Keine Frage</div>
                  )}
                </div>
              </div>
              <div className="h-full relative">
                <Image src={images[fieldIdx % images.length]} alt="Spielfeld" fill priority sizes="100vw" className="object-contain" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30 pointer-events-none" />
              </div>
            </div>
          </div>
        )}
  {/* TOR-Overlay, sichtbar in normaler und Vollbild-Ansicht */}
        {goalOverlay.show && (
          <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center text-white text-center">
            <div className="text-6xl md:text-7xl font-extrabold tracking-widest drop-shadow">TOR!!!</div>
            <div className="mt-4 text-2xl md:text-4xl font-bold">
              <span className="text-red-400">{goals.left}</span>
              <span className="mx-4 text-white/80">:</span>
              <span className="text-blue-400">{goals.right}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Daten aus Lobby/Exercise laden
async function fetchLobby(lobbyId: string){
  try{
    const r = await fetch(`/api/fussball/lobbies/${lobbyId}/join`);
    const j = await r.json();
    if(j?.success) return j.lobby as { id:string; title:string; lessonId?:string };
  }catch{}
  throw new Error('Lobby nicht gefunden');
}

type ExerciseApi = { success:boolean; exercise?: { _id:string; title:string; type:string; content?: any; questions?: Array<any> } };

async function fetchExercise(lessonId: string){
  const r = await fetch(`/api/exercises?lessonId=${encodeURIComponent(lessonId)}`);
  const j: ExerciseApi = await r.json();
  if(!j.success || !j.exercise) throw new Error('Übung nicht gefunden');
  return j.exercise;
}

function buildQuestionsFromExercise(exercise: NonNullable<ExerciseApi['exercise']>): { title?:string; items: MCQuestion[] }{
  const items: MCQuestion[] = [];
  const title = exercise.title;
  // 1) content.blocks (kanonisch in unseren Minigames)
  const blocks = Array.isArray(exercise?.content?.blocks) ? exercise.content.blocks as Array<Record<string, unknown>> : [];
  if(blocks.length){
    blocks.forEach((b, idx)=>{
      // Frage-Text
      const text = String((b as any).question ?? (b as any).prompt ?? (b as any).title ?? '').trim();
      let answersRaw: any = (b as any).answers ?? (b as any).options ?? (b as any).choices ?? (b as any).alternatives ?? (b as any).antworten;
      if(!Array.isArray(answersRaw)) answersRaw = [];
      const answers = (answersRaw as any[]).map(a=> typeof a==='string'? a: String((a && (a as any).text) ?? (a as any)?.answer ?? (a as any)?.value ?? (a as any)?.label ?? (a as any)?.title ?? '')).map(s=>s.trim()).filter(Boolean);
      if(!text || answers.length < 2) return;
      // Korrekt-Index
  let correct = 0;
      const flagged = (answersRaw as any[]).map(a=> Boolean((a as any)?.correct || (a as any)?.isCorrect || (a as any)?.right || (a as any)?.valid));
      const flaggedIdx = flagged.findIndex(v=> v);
      if(flaggedIdx>=0) correct = flaggedIdx;
      else {
        const cIdx = (b as any).correctIndex ?? (b as any).correct;
        if(typeof cIdx==='number' && Number.isFinite(cIdx)) correct = Math.max(0, Math.min(answers.length-1, Math.floor(cIdx)));
      }
  // Begrenze auf max. 4 Optionen, stelle sicher, dass die korrekte enthalten ist
  const limitedA = [answers[correct], ...answers.filter((_,i)=> i!==correct)].filter(Boolean);
  const uniqueLimitedA = Array.from(new Set(limitedA)).slice(0,4);
  const correctLimited = uniqueLimitedA.length ? 0 : 0;
  items.push({ id:`cb${idx}`, text, options: uniqueLimitedA, correct: correctLimited });
    });
    return { title, items };
  }
  // 2) exercise.questions (MC-Pool)
  const qs = Array.isArray(exercise.questions)? exercise.questions : [];
  qs.forEach((qRaw, idx)=>{
    const q = qRaw as any;
    const text = String(q.question ?? q.prompt ?? q.title ?? '').trim();
    if(!text) return;
    let options: string[] = Array.isArray(q.allAnswers) && q.allAnswers.length? [...q.allAnswers] : [];
    if(options.length === 0){
      const pool = new Set<string>();
      if(q.correctAnswer) pool.add(String(q.correctAnswer));
      (q.correctAnswers||[]).forEach((a:any)=> pool.add(String(a)));
      (q.wrongAnswers||[]).forEach((a:any)=> pool.add(String(a)));
      options = Array.from(pool);
    }
  if(options.length < 2) return;
  let correctAnswer: string = String(q.correctAnswer || (q.correctAnswers && q.correctAnswers[0]) || options[0] || '');
  // Stelle sicher, dass correctAnswer enthalten ist und begrenze auf 4
  const base = Array.from(new Set([correctAnswer, ...options].filter(Boolean)));
  const limited = base.slice(0,4);
  // Korrektindex neu auf 0 setzen (da correctAnswer vorn einsortiert)
  const correct = limited.length ? 0 : 0;
  items.push({ id:`q${idx}`, text, options: limited, correct });
  });
  return { title, items };
}

// Ende
