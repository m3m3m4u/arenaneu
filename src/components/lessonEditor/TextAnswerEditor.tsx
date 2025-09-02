"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';
import { Dispatch, SetStateAction, useState, useEffect, useRef } from 'react';
import { resolveMediaPath, buildMediaFallbacks, isImagePath, isAudioPath } from '@/lib/media';

export interface TextAnswerEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  setLesson: Dispatch<SetStateAction<Lesson | null>>;
  saving: boolean; setSaving: Dispatch<SetStateAction<boolean>>;
  returnToExercises: boolean;
}

interface Block { question: string; answers: string[]; media?: string }

export default function TextAnswerEditor({ lesson, title, setTitle, category, setCategory, setLesson, saving, setSaving, returnToExercises }: TextAnswerEditorProps) {
  const c = (lesson.content || {}) as any;
  const [raw, setRaw] = useState<string>(String(c.raw || ''));
  const [caseSensitive, setCaseSensitive] = useState<boolean>(!!c.caseSensitive);
  const [allowReveal, setAllowReveal] = useState<boolean>(!!c.allowReveal);
  const parseBlocks = (text: string): Block[] => text.replace(/\r/g,'').split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean).map(b=>{
    const lines = b.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    if (!lines.length) return null;
    let first = lines[0];
    let media: string | undefined;
    const m = first.match(/^(.+?)\s*\[(.+?)\]$/);
    if (m) { first = m[1].trim(); media = m[2].trim(); }
    const answers = lines.slice(1);
    if (!first || answers.length===0) return null;
    return { question: first, answers, media } as Block;
  }).filter(Boolean) as Block[];
  const blocks = parseBlocks(raw);
  const canSave = title.trim() && blocks.length>0;

  // Medien-Existenzprüfung
  const [mediaStatus, setMediaStatus] = useState<Record<string,{exists:boolean|null; checking:boolean; resolved?:string}>>({});
  const pendingChecks = useRef<Set<string>>(new Set());
  useEffect(()=>{
    const medias = Array.from(new Set(blocks.map(b=>b.media).filter(Boolean))) as string[];
    // Entferne veraltete Einträge
    setMediaStatus(prev=>{ const next: typeof prev = {}; medias.forEach(m=>{ if(prev[m]) next[m]=prev[m]; else next[m]={ exists:null, checking:false }; }); return next; });
    // Starte Checks für neue oder Unbekannte
    medias.forEach(m=>{
      if(pendingChecks.current.has(m)) return;
      setMediaStatus(prev=> prev[m]?.exists==null && !prev[m].checking ? ({ ...prev, [m]: { ...prev[m], checking:true } }) : prev);
      const doCheck = async()=>{
        pendingChecks.current.add(m);
        try {
          const candidates = buildMediaFallbacks(m); // inklusive resolvter Varianten
          let found = false; let resolved:string|undefined;
          for(const candidate of candidates){
            try {
              const head = await fetch(candidate, { method:'HEAD' });
              if(head.ok){ found=true; resolved=candidate; break; }
              if(head.status===405 || head.status===501){ // Fallback falls HEAD nicht erlaubt
                const getResp = await fetch(candidate, { method:'GET', cache:'no-store' });
                if(getResp.ok){ found=true; resolved=candidate; break; }
              }
            } catch {}
          }
          setMediaStatus(prev=> ({ ...prev, [m]: { exists: found, checking:false, resolved } }));
        } finally {
          pendingChecks.current.delete(m);
        }
      };
      doCheck();
    });
  }, [blocks]);

  const statusIcon = (m?:string) => {
    if(!m) return null;
    const st = mediaStatus[m];
    if(!st) return <span className="text-gray-300" title="Noch nicht geprüft">○</span>;
    if(st.checking) return <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full text-blue-400" title="Prüfe..." />;
    if(st.exists) return <span className="text-green-600" title={`Gefunden: ${st.resolved}`}>✔</span>;
    if(st.exists===false) return <span className="text-red-600" title="Nicht gefunden (prüfe Dateiname/Pfad)">✖</span>;
    return null;
  };

  const saveWithParsed = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        type: lesson.type,
        content: {
          raw,
          blocks: blocks.map(b=>({ question: b.question, answers: b.answers, media: b.media })),
          caseSensitive,
          allowReveal,
          question: blocks[0].question,
          answer: blocks[0].answers[0]
        }
      };
      const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lesson._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.lesson) setLesson(data.lesson);
      } else {
        console.error('Speichern fehlgeschlagen');
      }
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
  <main className="max-w-6xl mx-auto mt-6 sm:mt-10 p-4 sm:p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">✍️ Text-Antwort Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6 space-y-4">
          <h3 className="font-semibold">✍️ Fragen & Antworten (Blöcke)</h3>
          <p className="text-xs text-gray-600">Jeder Block: erste Zeile Frage optional mit <code className="bg-gray-100 px-1 rounded">[media.jpg]</code> oder <code className="bg-gray-100 px-1 rounded">[audio.mp3]</code>, folgende Zeilen = korrekte Antworten. Leerzeile trennt Blöcke. Medien werden automatisch auf Existenz geprüft (✔ / ✖).</p>
          <textarea value={raw} onChange={e=>setRaw(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder={'Was ist die Hauptstadt von Frankreich? [paris.jpg]\nParis\n\nNenne eine Primzahl kleiner als 5\n2\n3\n5'} />
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={caseSensitive} onChange={e=>setCaseSensitive(e.target.checked)} /> Groß-/Kleinschreibung beachten</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={allowReveal} onChange={e=>setAllowReveal(e.target.checked)} /> Spieler darf Lösung anzeigen (Frage kommt am Ende erneut)</label>
          </div>
          <div>
            <button onClick={saveWithParsed} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
        </div>
        <div className="bg-white border rounded p-6 space-y-4">
          <h3 className="font-semibold">👁️ Vorschau ({blocks.length})</h3>
          {blocks.length===0 && <div className="text-gray-400 text-sm">Keine gültigen Blöcke.</div>}
          {blocks.length>0 && (
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              {blocks.map((b,i)=>(
                <li key={i} className="bg-gray-50 border rounded p-3">
                  <div className="font-medium mb-1 flex items-center gap-2">
                    {b.question}
                    {b.media && (
                      <>
                        <span className="text-xs text-blue-600 break-all flex items-center gap-1">📎 {b.media} {statusIcon(b.media)}</span>
                        {mediaStatus[b.media]?.exists && mediaStatus[b.media]?.resolved && isImagePath(mediaStatus[b.media].resolved as string) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaStatus[b.media].resolved} alt="preview" className="max-h-10 max-w-16 object-contain border rounded bg-white" />
                        )}
                        {mediaStatus[b.media]?.exists && mediaStatus[b.media]?.resolved && isAudioPath(mediaStatus[b.media].resolved as string) && (
                          <audio src={mediaStatus[b.media].resolved} className="h-8" controls />
                        )}
                      </>
                    )}
                  </div>
                  <ul className="list-disc pl-5 text-xs text-gray-700 space-y-0.5">
                    {b.answers.map((a,ai)=><li key={ai}><code className="bg-white border px-1 rounded">{a}</code></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <div className="text-[10px] text-gray-500 flex flex-wrap gap-4">
            <span>Ø Antworten: {blocks.length? Math.round(blocks.reduce((s,b)=>s+b.answers.length,0)/blocks.length):0}</span>
            <span>Case: {caseSensitive? 'sensitiv':'ignoriert'}</span>
            {allowReveal && <span>Lösung anzeigen erlaubt</span>}
            <span>Speichern aktiviert wenn mindestens 1 Block</span>
          </div>
        </div>
      </div>
    </main>
  );
}
