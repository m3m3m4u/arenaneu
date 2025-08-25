import { useMemo, useState, useEffect } from 'react';
import type { MemoryPair, MemoryCard } from './types';
import type { Lesson } from '../types';
import { canonicalizeMediaPath } from '@/lib/media';
import { parseMemory } from '@/lib/memory';

interface Params { content: any; lessonId: string; }

export function useMemorySetup({ content, lessonId }: Params){
  const initialPairs = useMemo(()=>{ 
    const mediaRegex = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)(\?|$)/i;
    const uploadsRegex = /(\/)?(medien\/uploads|uploads)\//i;
    const classify = (v:string): 'text'|'image'|'audio' => /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(v)?'audio':(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v)?'image':'text');
    let pairs: MemoryPair[] = Array.isArray(content.pairs)? content.pairs: [];
    pairs = pairs.filter(p=> p && p.a && p.b && typeof p.a.value==='string' && typeof p.b.value==='string');

    // Falls keine oder zu wenige Paare: raw neu parsen (Server hat evtl. nicht gespeichert oder fehlerhafte Struktur)
    if((!pairs.length || pairs.length < 4) && typeof content.raw==='string' && content.raw.trim()) {
      const parsed = parseMemory(content.raw);
      if(parsed.pairs.length) {
        pairs = parsed.pairs;
      }
    }

    // Transformiere Paare: nur Medien kanonisieren
    pairs = pairs.map(p=>{ 
      const aRaw=p.a.value; const bRaw=p.b.value;
      const aMedia = mediaRegex.test(aRaw) || uploadsRegex.test(aRaw);
      const bMedia = mediaRegex.test(bRaw) || uploadsRegex.test(bRaw);
      // Explizite Proxy-Pfade /medien/uploads/ NICHT umschreiben, sonst verlieren wir funktionierende Quelle
      const aVal = aMedia? (aRaw.includes('/medien/uploads/')? aRaw : (canonicalizeMediaPath(aRaw)||aRaw)): aRaw;
      const bVal = bMedia? (bRaw.includes('/medien/uploads/')? bRaw : (canonicalizeMediaPath(bRaw)||bRaw)): bRaw;
      return { a:{ ...p.a, kind: aMedia? classify(aVal): classify(aVal), value:aVal}, b:{ ...p.b, kind: bMedia? classify(bVal): classify(bVal), value:bVal} };
    });

    if(!pairs.length){ if(typeof window!=='undefined'){ console.warn('Memory: keine Paare gefunden. content:', content); } }
    return pairs.slice(0,8);
  },[content.pairs, content.raw]);
  const pairsKey = useMemo(()=> initialPairs.map(p=>`${p.a.value}|${p.b.value}`).join(';'),[initialPairs]);
  const [cards, setCards]= useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices]= useState<number[]>([]);
  const [moves, setMoves]= useState(0);
  const [finished, setFinished]= useState(false);
  const [lock, setLock]= useState(false);

  useEffect(()=>{ if(!initialPairs.length) return; const temp: MemoryCard[]=[]; initialPairs.forEach((p,idx)=>{ temp.push({ id:`p${idx}a`, pair:idx, side:'a', kind:p.a.kind, value:p.a.value, flipped:false, matched:false}); temp.push({ id:`p${idx}b`, pair:idx, side:'b', kind:p.b.kind, value:p.b.value, flipped:false, matched:false});}); for(let i=temp.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [temp[i], temp[j]]=[temp[j], temp[i]];} setCards(temp); setFlippedIndices([]); setMoves(0); setFinished(false); setLock(false); },[lessonId, pairsKey, initialPairs]);

  return { initialPairs, pairsKey, cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock };
}
