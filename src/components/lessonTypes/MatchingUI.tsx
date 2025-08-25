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
  const renderOption = (value:string)=>{ 
    const p = resolveMediaPath(value);
    if(isImagePath(p)) return <div className="w-full flex items-center justify-center">
      <img 
        src={p} 
        alt="" 
        className="max-h-36 w-auto object-contain border rounded bg-white"
        onError={(e)=>{ 
          const el=e.currentTarget as HTMLImageElement; 
          const name=(p.split('/').pop()||''); 
          if(name){
            const fallbacks = buildMediaFallbacks(name);
            let idx = Number(el.dataset.fidx||'0');
            if(idx < fallbacks.length){ el.dataset.fidx=String(idx+1); el.src = fallbacks[idx]; return; }
          }
          el.replaceWith(Object.assign(document.createElement('div'), { className:'text-[10px] text-red-600 text-center break-words p-1', innerText: name?`Fehlt: ${name}`:'Bild fehlt' }));
        }}
      />
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
  return <div className="grid grid-cols-2 gap-6">
    <div className="space-y-2">{leftOptions.map(l=>{ const matchedRight= matched[l]; const isErr= errorPair?.left===l; const color = leftColor(l); const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors'; const cls= matchedRight? `${base} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: (selectedLeft===l)? `${base} border-blue-500 bg-blue-50 bg-white`: `${base} border-gray-200 bg-white hover:bg-gray-50`; return <button key={l} onClick={()=>handleLeftClick(l)} disabled={Boolean(matchedRight)} className={cls} aria-label={l}>{renderOption(l)}</button>; })}</div>
    <div className="space-y-2">{rightOptions.map(r=>{ const isUsed=isRightMatched(r); const isErr= errorPair?.right===r; const color = rightColor(r); const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors'; const cls= isUsed? `${base} ${color?`${color.border} ${color.bg} ${color.text}`:'border-green-500 bg-green-50 text-green-800'} cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: `${base} border-gray-200 bg-white hover:bg-gray-50`; return <button key={r} onClick={()=>handleRightClick(r)} disabled={isUsed} className={cls} aria-label={r}>{renderOption(r)}</button>; })}</div>
  </div>;
}
