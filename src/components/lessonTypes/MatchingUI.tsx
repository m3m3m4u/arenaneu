"use client";
import { useState, useEffect } from 'react';
import { resolveMediaPath, isImagePath, isAudioPath, buildMediaFallbacks } from '../../lib/media';

interface MatchingProps { question: { allAnswers: string[]; correctAnswers?: string[] }; onSolved: () => void; }
export default function MatchingUI({ question, onSolved }: MatchingProps){
  const [leftOptions, setLeftOptions] = useState<string[]>([]);
  const [rightOptions, setRightOptions] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string,string>>({});
  const [errorPair, setErrorPair] = useState<{ left: string; right: string } | null>(null);
  // Zoom State (ESC schließt)
  const [zoomSrc, setZoomSrc] = useState<string|null>(null);
  useEffect(()=>{ if(!zoomSrc) return; const h=(e:KeyboardEvent)=>{ if(e.key==='Escape') setZoomSrc(null); }; window.addEventListener('keydown',h); return ()=> window.removeEventListener('keydown',h); },[zoomSrc]);
  const renderOption = (value:string)=>{ 
    const p = resolveMediaPath(value);
    if(isImagePath(p)) return <div className="relative group w-full h-full flex items-center justify-center overflow-hidden">
      <img
        src={p}
        alt="Bild"
        className="max-h-full max-w-full w-auto h-auto object-contain select-none pointer-events-none"
        draggable={false}
        onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(p.split('/').pop()||''); if(name){ const fallbacks = buildMediaFallbacks(name); let idx = Number(el.dataset.fidx||'0'); if(idx < fallbacks.length){ el.dataset.fidx=String(idx+1); el.src = fallbacks[idx]; return; } } el.replaceWith(Object.assign(document.createElement('div'), { className:'text-[10px] text-red-600 text-center break-words p-1', innerText: name?`Fehlt: ${name}`:'Bild fehlt' })); }}
      />
      <button
        type="button"
        aria-label="Bild vergrößern"
        onClick={(e)=>{ e.stopPropagation(); setZoomSrc(p); }}
        onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        className="absolute top-1 right-1 bg-black/55 hover:bg-black/75 text-white rounded p-1 opacity-85 group-hover:opacity-100 transition-opacity"
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
  const handleLeftClick=(l:string)=>{ if(matched[l]) return; setSelectedLeft(prev=> prev===l? null: l); };
  const handleRightClick=(r:string)=>{ if(!selectedLeft) return; const rightUsed = Object.values(matched).includes(r); if(rightUsed) return; const l= selectedLeft; if(isCorrectPair(l,r)){ setMatched(prev=>({...prev, [l]:r})); setSelectedLeft(null); } else { setErrorPair({ left:l, right:r }); setTimeout(()=> setErrorPair(null),700); setSelectedLeft(null); } };
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
  const [vertical,setVertical] = useState(false); // Layout-Umschaltung

  // Layout Präferenz laden (und auf kleinen Screens initial vertikal)
  useEffect(()=>{
    try {
      const saved = localStorage.getItem('matchingLayout');
      if(saved === 'vertical') setVertical(true);
      else if(saved === 'horizontal') setVertical(false);
      else {
        if(typeof window !== 'undefined' && window.innerWidth < 640){ setVertical(true); }
      }
    } catch {}
  }, []);
  const toggleLayout=()=> setVertical(v=>{ const next=!v; try{ localStorage.setItem('matchingLayout', next? 'vertical':'horizontal'); }catch{} return next; });
  const Wrapper: React.FC<{children:React.ReactNode}> = ({children}) => fullscreen ? (
    <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm overflow-auto p-4 md:p-8"><div className="max-w-6xl mx-auto">{children}</div></div>
  ) : <>{children}</>;
  const adaptiveText=(val:string)=>{
    const len = val.length;
    if(isImagePath(val) || isAudioPath(val)) return '';
  if(len <= 20) return 'text-lg md:text-xl';
  if(len <= 60) return 'text-base';
  return 'text-sm';
  };
  return <Wrapper>
    <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
      <div className="space-y-1">
  <h3 className="font-semibold text-base text-gray-700 md:text-lg">Zuordnung</h3>
  <p className="text-xs md:text-sm text-gray-500 leading-snug max-w-xl">Verbinde linke und rechte Elemente, die zusammengehören. Gefundene Paare erhalten dieselbe Farbe. Du kannst das Layout umschalten (nebeneinander oder oben/unten).</p>
      </div>
      <div>
        <div className="flex gap-2">
          <button onClick={toggleLayout} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50" title="Layout umschalten">
            {vertical? 'Layout: Vertikal' : 'Layout: Horizontal'}
          </button>
          <button onClick={()=>setFullscreen(f=>!f)} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">{fullscreen? 'Schließen':'Vollbild'}</button>
        </div>
      </div>
    </div>
    {vertical ? (
      <div className="flex flex-col gap-10">
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Links</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {leftOptions.map(l=>{ const matchedRight= matched[l]; const isErr= errorPair?.left===l; const color = leftColor(l); const isImg = isImagePath(resolveMediaPath(l)); const base='w-full aspect-square flex items-center justify-center border rounded transition-colors overflow-hidden'; const pad = isImg? 'p-1' : 'p-2 md:p-4'; const clsBase = `${base} ${pad}`; const cls= matchedRight? `${clsBase} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${clsBase} border-red-500 bg-red-50 text-red-800`: (selectedLeft===l)? `${clsBase} border-blue-500 bg-blue-50`: `${clsBase} border-gray-200 bg-white hover:bg-gray-50`; return <button key={l} onClick={()=>handleLeftClick(l)} disabled={Boolean(matchedRight)} className={cls} aria-label={l}><div className={`w-full h-full text-center break-words ${adaptiveText(l)}`}>{renderOption(l)}</div></button>; })}
          </div>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Rechts</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {rightOptions.map(r=>{ const isUsed=isRightMatched(r); const isErr= errorPair?.right===r; const color = rightColor(r); const isImg = isImagePath(resolveMediaPath(r)); const base='w-full aspect-square flex items-center justify-center border rounded transition-colors overflow-hidden'; const pad = isImg? 'p-1' : 'p-2 md:p-4'; const clsBase = `${base} ${pad}`; const cls= isUsed? `${clsBase} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${clsBase} border-red-500 bg-red-50 text-red-800`: `${clsBase} border-gray-200 bg-white hover:bg-gray-50`; return <button key={r} onClick={()=>handleRightClick(r)} disabled={isUsed} className={cls} aria-label={r}><div className={`w-full h-full text-center break-words ${adaptiveText(r)}`}>{renderOption(r)}</div></button>; })}
          </div>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">{leftOptions.map(l=>{ const matchedRight= matched[l]; const isErr= errorPair?.left===l; const color = leftColor(l); const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors'; const cls= matchedRight? `${base} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: (selectedLeft===l)? `${base} border-blue-500 bg-blue-50 bg-white`: `${base} border-gray-200 bg-white hover:bg-gray-50`; return <button key={l} onClick={()=>handleLeftClick(l)} disabled={Boolean(matchedRight)} className={cls} aria-label={l}><div className={`w-full text-center break-words ${adaptiveText(l)}`}>{renderOption(l)}</div></button>; })}</div>
        <div className="space-y-2">{rightOptions.map(r=>{ const isUsed=isRightMatched(r); const isErr= errorPair?.right===r; const color = rightColor(r); const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors'; const cls= isUsed? `${base} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: `${base} border-gray-200 bg-white hover:bg-gray-50`; return <button key={r} onClick={()=>handleRightClick(r)} disabled={isUsed} className={cls} aria-label={r}><div className={`w-full text-center break-words ${adaptiveText(r)}`}>{renderOption(r)}</div></button>; })}</div>
      </div>
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
  </Wrapper>;
}
