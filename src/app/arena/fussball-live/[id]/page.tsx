"use client";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';

interface MCQuestion { id:string; text:string; options:string[]; correct:number; }

// Dummy Fragen – später via API / WebSocket ersetzen
const DUMMY_QUESTIONS: MCQuestion[] = [
  { id:'q1', text:'Wie viele Spieler pro Team auf dem Feld?', options:['9','10','11','12'], correct:2 },
  { id:'q2', text:'Was ist ein Abseits?', options:['Fehlstart','Regelverstoß bei Pass nach vorn','Tor-Aus','Handspiel'], correct:1 },
  { id:'q3', text:'Eckstoß erfolgt von …', options:['Mittellinie','Seitenaus','Ecke','Torraum'], correct:2 },
  { id:'q4', text:'Wie lang ist ein Spiel (regulär)?', options:['2x30','2x35','2x40','2x45'], correct:3 },
];

export default function FussballLivePage(){
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // Später: Fragen / Spielfeld-Kontext via WS holen
  const [questions] = useState<MCQuestion[]>(DUMMY_QUESTIONS);
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

  useEffect(()=>{ pickNext(); },[pickNext]);

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
        </div>
        <div className="text-xs text-gray-500 flex gap-4">
          <span>Fragen: {stats.asked}</span>
          <span>Korrekt: {stats.correct}</span>
          <span>Falsch: {stats.wrong}</span>
        </div>
        <div className="ml-auto text-xs"><a href="/arena/fussball2" className="text-blue-600 hover:underline">Zur Lobby</a></div>
      </header>
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
            ) : <div className="text-sm text-gray-500">Lade nächste Frage…</div>}
          </div>
          <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-xs leading-relaxed">
            Gewichtete Wiederholung aktiv: Falsch beantwortete Fragen tauchen wahrscheinlicher erneut auf. Diese Logik ist lokal – später serverseitig synchronisiert.
          </div>
        </div>
        {/* Rechte Spalte: Spielfeld Platzhalter */}
        <div className="relative border rounded bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 shadow-inner aspect-[16/9] overflow-hidden">
          <Pitch />
          <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/40 text-white backdrop-blur">
            Platzhalter Spielfeld
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

// Einfaches Canvas / SVG Spielfeld
function Pitch(){
  return (
    <svg viewBox="0 0 1200 675" className="absolute inset-0 w-full h-full">
      <rect x="0" y="0" width="1200" height="675" fill="#0a7d2b" />
      <rect x="10" y="10" width="1180" height="655" fill="none" stroke="#fff" strokeWidth="8" />
      <line x1="600" y1="10" x2="600" y2="665" stroke="#fff" strokeWidth="6" />
      <circle cx="600" cy="337.5" r="80" stroke="#fff" strokeWidth="6" fill="none" />
      <circle cx="600" cy="337.5" r="6" fill="#fff" />
      <rect x="10" y="187.5" width="160" height="300" stroke="#fff" strokeWidth="6" fill="none" />
      <rect x="1030" y="187.5" width="160" height="300" stroke="#fff" strokeWidth="6" fill="none" />
      <rect x="10" y="247.5" width="60" height="180" stroke="#fff" strokeWidth="6" fill="none" />
      <rect x="1130" y="247.5" width="60" height="180" stroke="#fff" strokeWidth="6" fill="none" />
      <circle cx="170" cy="337.5" r="6" fill="#fff" />
      <circle cx="1030" cy="337.5" r="6" fill="#fff" />
    </svg>
  );
}
