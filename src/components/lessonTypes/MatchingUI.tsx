"use client";
import { useState, useEffect, useRef } from 'react';
import { useAntiGuessing, AntiGuessingOverlay } from './useAntiGuessing';
import { resolveMediaPath, isImagePath, isAudioPath, buildMediaFallbacks } from '../../lib/media';

interface MatchingProps { question: { allAnswers: string[]; correctAnswers?: string[] }; onSolved: () => void; onContinue?: () => void; }
export default function MatchingUI({ question, onSolved, onContinue }: MatchingProps){
  const antiGuess = useAntiGuessing({ maxWrongStreak:3, windowMs: 12000, cooldownMs: 6000 });
  const [leftOptions, setLeftOptions] = useState<string[]>([]);
  const [rightOptions, setRightOptions] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string,string>>({});
  const [errorPair, setErrorPair] = useState<{ left: string; right: string } | null>(null);
  // Zoom State (ESC schließt)
  const [zoomSrc, setZoomSrc] = useState<string|null>(null);
  useEffect(()=>{ if(!zoomSrc) return; const h=(e:KeyboardEvent)=>{ if(e.key==='Escape') setZoomSrc(null); }; window.addEventListener('keydown',h); return ()=> window.removeEventListener('keydown',h); },[zoomSrc]);
  // Dynamische Größenanpassung: misst verfügbare Buttonfläche und begrenzt Bild entsprechend
  const FittedImage: React.FC<{ src:string; alt:string }> = ({ src, alt }) => {
    const wrapRef = useRef<HTMLDivElement|null>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    useEffect(()=>{
      const el = wrapRef.current; if(!el) return;
      const ro = new ResizeObserver(entries=>{ for(const e of entries){ const r=e.contentRect; setBox({ w: r.width, h: r.height }); } });
      ro.observe(el); return ()=> ro.disconnect();
    },[]);
  const maxW = Math.max(0, box.w - 4); // kleinerer Puffer
  const maxH = Math.max(0, box.h - 4);
    return <div ref={wrapRef} className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none">
      <img
        src={src}
        alt={alt}
        draggable={false}
    className="object-contain block"
    style={{ maxWidth: maxW ? `${maxW}px` : '100%', maxHeight: maxH ? `${maxH}px` : '100%' }}
        onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(src.split('/').pop()||''); if(name){ const fallbacks = buildMediaFallbacks(name); let idx = Number(el.dataset.fidx||'0'); if(idx < fallbacks.length){ el.dataset.fidx=String(idx+1); el.src = fallbacks[idx]; return; } } el.replaceWith(Object.assign(document.createElement('div'), { className:'text-[10px] text-red-600 text-center break-words p-1', innerText: name?`Fehlt: ${name}`:'Bild fehlt' })); }}
      />
    </div>;
  };
  const renderOption = (value:string)=>{ 
    const p = resolveMediaPath(value);
    if(isImagePath(p)) return <div className="w-full h-full flex items-center justify-center relative">
        <FittedImage src={p} alt="Bild" />
        <button
          type="button"
          aria-label="Bild vergrößern"
          onClick={(e)=>{ e.stopPropagation(); setZoomSrc(p); }}
          onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
          className="absolute top-1 right-1 bg-black/55 hover:bg-black/75 text-white rounded p-1 opacity-85 hover:opacity-100 transition-opacity"
        >🔍</button>
      </div>;
    if(isAudioPath(p)) return <div className="w-full flex items-center justify-center">
      <audio controls className="w-full max-w-xs border rounded bg-white p-1">
        {(()=>{ const name=(p.split('/').pop()||''); return name? <source src={`/medien/uploads/${name}`}/> : null; })()}
        <source src={p}/>
        <source src={p.replace('/media/audio/','/uploads/')} />
      </audio>
    </div>;
    return <span className="break-words">{value}</span>; };
  useEffect(()=>{ const pairs=(question.correctAnswers||[]).map(k=>{ const [l,r]= String(k).split('=>'); return { l:(l||'').trim(), r:(r||'').trim() }; }).filter(p=>p.l&&p.r); const lefts=pairs.map(p=>p.l); const rights=pairs.map(p=>p.r); const shuffle=<T,>(arr:T[])=>arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); setLeftOptions(shuffle(lefts)); setRightOptions(shuffle(rights)); setMatched({}); setSelectedLeft(null); setErrorPair(null); },[question.correctAnswers]);
  const isCorrectPair=(l:string,r:string)=> (question.correctAnswers||[]).includes(`${l}=>${r}`);
  const allMatched= Object.keys(matched).length>0 && Object.keys(matched).length === (question.correctAnswers?.length||0);
  useEffect(()=>{ if(allMatched) onSolved(); },[allMatched,onSolved]);
  const handleLeftClick=(l:string)=>{ if(antiGuess.blocked) return; if(matched[l]) return; setSelectedLeft(prev=> prev===l? null: l); };
  const handleRightClick=(r:string)=>{ if(antiGuess.blocked) return; if(!selectedLeft) return; const rightUsed = Object.values(matched).includes(r); if(rightUsed) return; const l= selectedLeft; if(isCorrectPair(l,r)){ setMatched(prev=>({...prev, [l]:r})); setSelectedLeft(null); antiGuess.registerAnswer(true); } else { antiGuess.registerAnswer(false); setErrorPair({ left:l, right:r }); setTimeout(()=> setErrorPair(null),700); setSelectedLeft(null); } };
  const isLeftMatched=(l:string)=> Boolean(matched[l]); const isRightMatched=(r:string)=> Object.values(matched).includes(r);
  // Farbpalette für zusammengehörige Paare (Index anhand der korrekten Paarliste)
  const pairOrder = (question.correctAnswers||[]).map(p=>{ const [l,r]=p.split('=>'); return {l,lTrim:l.trim(), r:r.trim()}; });
  const pairIndex = (l:string,r:string)=> pairOrder.findIndex(p=>p.lTrim===l && p.r===r);
  const colorClasses = [
    { border:'border-blue-500', bg:'bg-blue-50', text:'text-blue-800' },
    { border:'border-green-500', bg:'bg-green-50', text:'text-green-800' },
    { border:'border-purple-500', bg:'bg-purple-50', text:'text-purple-800' },
    { border:'border-amber-500', bg:'bg-amber-50', text:'text-amber-800' },
    { border:'border-pink-500', bg:'bg-pink-50', text:'text-pink-800' },
    { border:'border-indigo-500', bg:'bg-indigo-50', text:'text-indigo-800' },
    { border:'border-teal-500', bg:'bg-teal-50', text:'text-teal-800' },
    { border:'border-cyan-500', bg:'bg-cyan-50', text:'text-cyan-800' },
  ];
  const leftColor = (l:string)=>{ const r= matched[l]; if(!r) return null; const idx = pairIndex(l,r); return idx>=0? colorClasses[idx % colorClasses.length]: null; };
  const rightColor = (r:string)=>{ const entry = Object.entries(matched).find(([l,rr])=> rr===r); if(!entry) return null; const [l,rr]=entry; const idx = pairIndex(l,rr); return idx>=0? colorClasses[idx % colorClasses.length]: null; };
  const [fullscreen,setFullscreen] = useState(false);
  const [vertical,setVertical] = useState(false); // deaktiviert (immer horizontal)
  const [isSmall, setIsSmall] = useState(false); // screen < md für kompakte 2-Spalten Ansicht

  // Responsive Breakpoint Überwachung
  useEffect(()=>{
    const update = () => {
      if (typeof window === 'undefined') return;
      const small = window.innerWidth < 768; // md
      setIsSmall(small);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  // Keine erzwungene Vertikal-Ansicht mehr: Auf kleinen Screens nutzen wir eine kompakte 2-Spalten Horizontal-Variante

  // Layout Präferenz laden (und auf kleinen Screens initial vertikal)
  useEffect(()=>{ try { localStorage.removeItem('matchingLayout'); } catch {} }, []);
  const toggleLayout=()=>{}; // deaktiviert
  const resetMatches=()=>{ if(antiGuess.blocked) return; setMatched({}); setSelectedLeft(null); setErrorPair(null); };
  const Wrapper: React.FC<{children:React.ReactNode}> = ({children}) => fullscreen ? (
    <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm overflow-auto p-4 md:p-8 flex flex-col">
      <div className="max-w-6xl w-full mx-auto flex-1 pb-6">{children}</div>
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-500">Gefundene Paare: {Object.keys(matched).length}/{question.correctAnswers?.length||0}</div>
        <div className="flex gap-2 ml-auto">
          {/* Layout-Umschalter entfernt */}
          <button onClick={()=>setFullscreen(false)} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">Schließen</button>
          {Object.keys(matched).length>0 && !allMatched && (
            <button onClick={resetMatches} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50" title="Zurücksetzen">Reset</button>
          )}
          {allMatched && onContinue && (
            <button onClick={onContinue} className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700">Weiter</button>
          )}
        </div>
      </div>
    </div>
  ) : <>{children}</>;
  const adaptiveText=(val:string)=>{
    const len = val.length;
    if(isImagePath(val) || isAudioPath(val)) return '';
  if(len <= 20) return 'text-lg md:text-xl';
  if(len <= 60) return 'text-base';
  return 'text-sm';
  };
  const totalPairs = question.correctAnswers?.length || 0;
  const matchedCount = Object.keys(matched).length;
  const progress = totalPairs? Math.round((matchedCount/totalPairs)*100) : 0;
  const effectiveVertical = false; // vertikales Layout deaktiviert
  return <Wrapper>
  {antiGuess.blocked && <AntiGuessingOverlay remainingMs={antiGuess.remainingMs} totalMs={antiGuess.cooldownMs} />}
    <div className="flex items-start justify-between mb-3 gap-4 flex-wrap relative">
      <div className="space-y-1">
  <h3 className="font-semibold text-base text-gray-700 md:text-lg">Zuordnung</h3>
  <p className="text-xs md:text-sm text-gray-500 leading-snug max-w-xl">Tippe zuerst links, dann rechts. Gefundene Paare erhalten eine Farbe. (Layout fix: nebeneinander)</p>
  <div className="mt-2 w-full max-w-xs">
    <div className="h-2 rounded bg-gray-200 overflow-hidden">
      <div className="h-full bg-green-500 transition-all" style={{width: `${progress}%`}} />
    </div>
    <div className="mt-1 text-[10px] tracking-wide text-gray-500">Fortschritt {matchedCount}/{totalPairs}</div>
  </div>
      </div>
      <div>
        <div className="flex gap-2">
          {/* Layout Toggle entfernt */}
          <button onClick={()=>setFullscreen(f=>!f)} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">{fullscreen? 'Schließen':'Vollbild'}</button>
          {Object.keys(matched).length>0 && !fullscreen && !allMatched && (
            <button onClick={resetMatches} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50" title="Zurücksetzen">Reset</button>
          )}
        </div>
      </div>
    </div>
  {/* Vertikales Layout entfernt, immer horizontales 2-Spalten Layout */}
      <div className="w-full flex flex-row gap-2 sm:gap-8 items-start">
        <div className="w-1/2 flex flex-col gap-2 sm:gap-3">
          {leftOptions.map(l=>{ const matchedRight= matched[l]; const isErr= errorPair?.left===l; const color = leftColor(l); const isImg = isImagePath(resolveMediaPath(l));
            const baseImg='relative group w-full h-20 sm:h-24 md:h-28 flex items-center justify-center border rounded transition-colors bg-white overflow-hidden';
            const baseText='w-full h-20 sm:h-24 md:h-28 px-2 sm:px-3 flex items-center justify-center border rounded transition-colors bg-white';
            const base = isImg? baseImg : baseText;
            const cls= matchedRight? `${base} animate-match ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800 animate-shake`: (selectedLeft===l)? `${base} border-blue-500 bg-blue-50`: `${base} border-gray-200 hover:bg-gray-50 active:scale-[0.97]`;
            return <button key={l} onClick={()=>handleLeftClick(l)} disabled={Boolean(matchedRight)} className={cls} aria-label={l}><div className={`w-full h-full flex items-center justify-center text-center break-words ${isImg?'':adaptiveText(l)}`}>{renderOption(l)}</div></button>; })}
        </div>
        <div className="w-1/2 flex flex-col gap-2 sm:gap-3">
          {rightOptions.map(r=>{ const isUsed=isRightMatched(r); const isErr= errorPair?.right===r; const color = rightColor(r); const isImg = isImagePath(resolveMediaPath(r));
            const baseImg='relative group w-full h-20 sm:h-24 md:h-28 flex items-center justify-center border rounded transition-colors bg-white overflow-hidden';
            const baseText='w-full h-20 sm:h-24 md:h-28 px-2 sm:px-3 flex items-center justify-center border rounded transition-colors bg-white';
            const base = isImg? baseImg : baseText;
            const cls= isUsed? `${base} animate-match ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800 animate-shake`: `${base} border-gray-200 hover:bg-gray-50 active:scale-[0.97]`;
            return <button key={r} onClick={()=>handleRightClick(r)} disabled={isUsed} className={cls} aria-label={r}><div className={`w-full h-full flex items-center justify-center text-center break-words ${isImg?'':adaptiveText(r)}`}>{renderOption(r)}</div></button>; })}
        </div>
  </div>
    {allMatched && !fullscreen && onContinue && (
      <div className="mt-6 hidden md:block">
        <button onClick={onContinue} className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700">Weiter</button>
      </div>
    )}
    {/* Bottom mobile control bar */}
    {!fullscreen && (
      <>
        <div className="md:hidden h-16" />{/* spacer so content not hidden */}
  <div className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t shadow flex items-center gap-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom,0)+0.5rem)]">
          <button onClick={()=>setFullscreen(true)} className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-gray-50" aria-label="Vollbild">Vollbild</button>
          {Object.keys(matched).length>0 && !allMatched && (
            <button onClick={resetMatches} className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-gray-50 ml-auto" aria-label="Zurücksetzen">Reset</button>
          )}
          {allMatched && onContinue && (
            <button onClick={onContinue} className="ml-auto bg-green-600 text-white rounded px-3 py-1.5 text-[11px] hover:bg-green-700">Weiter</button>
          )}
        </div>
      </>
    )}
    {zoomSrc && (
      <div
        className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
        onClick={()=>setZoomSrc(null)}
        onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
      >
        <img
          src={zoomSrc}
          alt="Zoom"
          className="max-w-full max-h-full object-contain rounded shadow-2xl select-none"
          draggable={false}
          onClick={(e)=>{ e.stopPropagation(); }}
          onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        />
        <button
          type="button"
          onClick={()=>setZoomSrc(null)}
          className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded px-3 py-1 text-sm"
        >Schließen (Esc)</button>
      </div>
    )}
    <style jsx global>{`
      @keyframes match-pulse { 0%{transform:scale(1);} 40%{transform:scale(1.04);} 100%{transform:scale(1);} }
      .animate-match { animation: match-pulse .35s ease-out; }
      @keyframes shake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-4px);} 40%{transform:translateX(4px);} 60%{transform:translateX(-3px);} 80%{transform:translateX(3px);} }
      .animate-shake { animation: shake .45s ease; }
    `}</style>
  </Wrapper>;
}
