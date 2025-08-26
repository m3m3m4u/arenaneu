"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';
import { useEffect, useState, useRef } from 'react';
import { resolveMediaPath, buildMediaFallbacks, isImagePath, isAudioPath } from '@/lib/media';

export interface MatchingEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  matchingText: string; setMatchingText: (v: string)=>void;
  matchingBlocksPreview: Array<Array<{ left: string; right: string }>>;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function MatchingEditor({ lesson, title, setTitle, category, setCategory, matchingText, setMatchingText, matchingBlocksPreview, handleSave, saving, returnToExercises }: MatchingEditorProps) {
  const minPairsOk = matchingBlocksPreview.some(b => b.length >= 2);
  const canSave = title.trim() && minPairsOk;
  // Medien Status
  type MStatus = { exists:boolean|null; checking:boolean; resolved?:string };
  const [mediaStatus, setMediaStatus] = useState<Record<string,MStatus>>({});
  const pending = useRef<Set<string>>(new Set());
  // Medien aus Preview extrahieren
  const allMedias = Array.from(new Set(matchingBlocksPreview.flatMap(block => block.flatMap(p=>[p.left,p.right]))
    .filter(v=>/\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)(?=($|\?|#))/i.test(v.trim()))));
  useEffect(()=>{
    setMediaStatus(prev=>{
      const next: typeof prev = {};
      allMedias.forEach(m=>{ next[m] = prev[m] || { exists:null, checking:false }; });
      return next;
    });
    allMedias.forEach(m=>{
      if(pending.current.has(m)) return;
      if(mediaStatus[m]?.exists!=null || mediaStatus[m]?.checking) return;
      setMediaStatus(prev=> ({ ...prev, [m]: { ...(prev[m]||{exists:null}), checking:true } }));
      const run = async()=>{
        pending.current.add(m);
        try {
          const candidates = buildMediaFallbacks(m);
          let found=false; let resolved:string|undefined;
          for(const c of candidates){
            try{ const head=await fetch(c,{method:'HEAD'}); if(head.ok){found=true; resolved=c; break;} if(head.status===405){ const getR=await fetch(c,{method:'GET',cache:'no-store'}); if(getR.ok){found=true; resolved=c; break;} } }catch{}
          }
          setMediaStatus(prev=> ({ ...prev, [m]: { exists:found, checking:false, resolved } }));
        }finally{ pending.current.delete(m); }
      };
      run();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingBlocksPreview]);
  const icon = (m:string)=>{ const st=mediaStatus[m]; if(!st) return <span className="text-gray-300" title="unbekannt">○</span>; if(st.checking) return <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full text-blue-400" title="prüfe"/>; if(st.exists) return <span className="text-green-600" title={`gefunden: ${st.resolved}`}>✔</span>; if(st.exists===false) return <span className="text-red-600" title="nicht gefunden">✖</span>; return null; };
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🔗 Matching-Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">🔗 Paare eingeben</h3>
          <textarea value={matchingText} onChange={e => setMatchingText(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder={'1+2|3\n1-1|0\n1+8|9\n\n2+5|7\n1+2|3\n1-1|0'} />
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <span className="text-sm text-gray-500">Vorschau automatisch.</span>
            <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 space-y-1">
            <p>• Blöcke durch Leerzeile trennen, Zeile: LINKS|RECHTS</p>
            <p>• 2–5 Paare pro Block.</p>
            <p>• Medien: Dateiname (auto → /uploads/…), Pfad (/uploads/…), oder absolute URL; Bilder *.jpg/png/gif/webp, Audio *.mp3/wav/ogg/m4a</p>
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-2">👁️ Vorschau</h3>
          {matchingBlocksPreview.length === 0 ? <div className="text-gray-500">Keine Blöcke.</div> : (
            <div className="space-y-3">
              {matchingBlocksPreview.map((block, bi) => (
                <div key={bi} className="border rounded p-3 bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">Aufgabe {bi + 1}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {block.map((p, idx) => {
                      const entries = [ { side:'L', val:p.left }, { side:'R', val:p.right } ];
                      return <li key={idx} className="flex flex-col gap-1">
                        <div className="flex flex-wrap gap-4 items-start">
                          {entries.map((e,i)=>{
                            const mediaLike = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)(?=($|\?|#))/i.test(e.val.trim());
                            if(!mediaLike) return <span key={i}><strong>{e.side==='L'? '◀':''}{e.val}{e.side==='R'? '▶':''}</strong></span>;
                            const resolved = mediaStatus[e.val]?.resolved || resolveMediaPath(e.val);
                            const preview = mediaStatus[e.val]?.exists && mediaStatus[e.val]?.resolved;
                            return <span key={i} className="flex items-center gap-1 max-w-[220px]">
                              <strong>{e.side==='L'? '◀':''}{e.val}{e.side==='R'? '▶':''}</strong> {icon(e.val)}
                              {preview && isImagePath(resolved) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolved} alt="img" className="h-10 w-10 object-contain border rounded bg-white" />
                              )}
                              {preview && isAudioPath(resolved) && (
                                <audio src={resolved} className="h-8" controls />
                              )}
                            </span>;
                          })}
                        </div>
                      </li>;
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {allMedias.length>0 && (
            <div className="mt-4 text-[10px] text-gray-500 flex flex-wrap gap-3">
              <span>Medien erkannt: {allMedias.length}</span>
              <span>✔ vorhanden: {allMedias.filter(m=>mediaStatus[m]?.exists).length}</span>
              <span>✖ fehlend: {allMedias.filter(m=>mediaStatus[m]?.exists===false).length}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
