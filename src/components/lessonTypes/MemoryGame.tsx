"use client";
import { useSession } from 'next-auth/react';
import type { Lesson } from './types';
import { finalizeLesson } from '../../lib/lessonCompletion';
import { useState, useEffect } from 'react';
import { useMemorySetup } from './memory/useMemorySetup';
import { useMemoryGame } from './memory/useMemoryGame';
import type { MemoryCard } from './memory/types';
import { resolveMediaPath, canonicalizeMediaPath, buildMediaFallbacks } from '../../lib/media';

interface Props { lesson: Lesson; onCompleted: () => void; completedLessons: string[]; setCompletedLessons?: (v: string[] | ((p:string[])=>string[]))=>void }
export default function MemoryGame({ lesson, onCompleted, completedLessons, setCompletedLessons }: Props){
  const { data: session } = useSession();
  const content = (lesson.content||{}) as any;
  const { initialPairs, cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock } = useMemorySetup({ content, lessonId: lesson._id });
  const { handleFlip, restart } = useMemoryGame({ cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock });
  const [marking, setMarking] = useState(false);
  const isAlreadyDone = completedLessons.includes(lesson._id);

  useEffect(()=>{ if(finished && !isAlreadyDone){ (async()=>{ try{ const username=session?.user?.username; setMarking(true); await finalizeLesson({ username, lessonId: lesson._id, courseId: lesson.courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); if(setCompletedLessons){ setCompletedLessons(prev=> prev.includes(lesson._id)? prev : [...prev, lesson._id]); } } finally { setMarking(false); onCompleted(); } })(); } },[finished, isAlreadyDone, lesson._id, lesson.courseId, lesson.type, onCompleted, session?.user?.username, setCompletedLessons]);

  const renderCardFace=(card:MemoryCard)=>{ 
    const mediaExt = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)(\?|$)/i;
    const looksLikeUploads = /(\/)?(medien\/uploads|uploads)\//i.test(card.value);
    const isMediaCandidate = mediaExt.test(card.value) || looksLikeUploads;
  const canonical = isMediaCandidate ? (card.value.includes('/medien/uploads/') ? card.value : (canonicalizeMediaPath(card.value) || card.value)) : card.value;
  const p = isMediaCandidate ? resolveMediaPath(canonical) : canonical;
    const looksLikeImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(canonical);
    if(isMediaCandidate && looksLikeImage) return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <img 
          src={p} 
          alt="" 
          className="max-w-full max-h-full object-contain" 
          onError={(e)=>{ 
            const el=e.currentTarget as HTMLImageElement; 
            const name=(canonical.split('/').pop()||'');
            if(name){
              const fallbacks = buildMediaFallbacks(canonical);
              let idx = Number(el.dataset.fidx||'0');
              // Überspringe identischen aktuellen Pfad
              while(idx < fallbacks.length && fallbacks[idx] === el.src){ idx++; }
              if(idx < fallbacks.length){
                el.dataset.fidx = String(idx+1);
                el.src = fallbacks[idx];
                return;
              }
            }
            else {
              el.replaceWith(Object.assign(document.createElement('div'), { className: 'text-[10px] text-red-600 text-center px-1', innerText: name? `Fehlt: ${name}`: 'Bild fehlt' }));
            }
          }} 
        />
      </div>
    ); 
    const looksLikeAudio = /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(canonical);
    if(isMediaCandidate && looksLikeAudio) return (
      <audio controls className="w-full h-full">
        {(()=>{ const name=(canonical.split('/').pop()||''); return name? <source src={resolveMediaPath(name)}/> : null; })()}
        <source src={p}/>
      </audio>
    ); 
    return <span className="text-xs p-1 break-words leading-tight text-center block">{canonical}</span>; 
  };

  // Farben für Paar-Zuordnung (max 8 Paare genutzt)
  const pairColorStyles = [
    { border:'border-blue-500', bg:'bg-blue-50', text:'text-blue-800' },
    { border:'border-green-500', bg:'bg-green-50', text:'text-green-800' },
    { border:'border-purple-500', bg:'bg-purple-50', text:'text-purple-800' },
    { border:'border-amber-500', bg:'bg-amber-50', text:'text-amber-800' },
    { border:'border-pink-500', bg:'bg-pink-50', text:'text-pink-800' },
    { border:'border-indigo-500', bg:'bg-indigo-50', text:'text-indigo-800' },
    { border:'border-teal-500', bg:'bg-teal-50', text:'text-teal-800' },
    { border:'border-cyan-500', bg:'bg-cyan-50', text:'text-cyan-800' },
  ];

  return <div>
    {initialPairs.length===0 && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">Keine Memory-Paare vorhanden.</div>}
    <div className="grid gap-4" style={{gridTemplateColumns:`repeat(${Math.min(4, Math.ceil(Math.sqrt(cards.length||1)))}, minmax(0,1fr))`}}>
      {cards.map((card,idx)=>{ 
        const flipped= card.flipped||card.matched; 
        const style = card.matched? pairColorStyles[card.pair % pairColorStyles.length]: null;
        return <button 
          key={card.id} 
          onClick={()=>handleFlip(idx)} 
          disabled={card.flipped||card.matched||lock} 
          className={`relative h-32 md:h-40 border rounded-lg flex items-center justify-center transition-transform duration-300 ${flipped?'shadow-inner':'shadow hover:shadow-md'} ${style?`${style.border} ${style.bg}`:'border-gray-200 bg-white'}`}
        >
          {flipped ? <div className={`w-full h-full flex items-center justify-center p-2 ${style?style.text:''}`}>{renderCardFace(card)}</div>: <div className="w-full h-full flex items-center justify-center font-semibold text-gray-500 select-none">🧠</div>}
        </button>; 
      })}
    </div>
    <div className="mt-6 flex items-center gap-4 flex-wrap">
  {finished ? <span className="text-green-600 font-medium">✔️ Alle Paare gefunden!</span>: <span className="text-gray-600 text-sm">Finde alle Paare.</span>}
  <span className="text-sm text-gray-500">Paare: {initialPairs.length}</span>
      <span className="text-sm text-gray-500">Züge: {moves}</span>
      <button onClick={restart} className="text-xs px-3 py-1 border rounded hover:bg-gray-50">Neu mischen</button>
      {marking && <span className="text-sm text-gray-500">Speichere Abschluss…</span>}
    </div>
  </div>;
}
