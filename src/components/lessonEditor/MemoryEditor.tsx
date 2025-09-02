"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';
import { resolveMediaPath, canonicalizeMediaPath, buildMediaFallbacks } from '@/lib/media';

interface MemoryPair { a: { kind: string; value: string }; b: { kind: string; value: string }; }

export interface MemoryEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  memoryRaw: string; setMemoryRaw: (v: string)=>void;
  memoryPairs: MemoryPair[];
  memoryWarnings: string[]; memoryErrors: string[];
  parseMemoryClient: (raw: string)=>void;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

function MemoryCardSide({ side }: { side: { kind: string; value: string } }) {
  const mediaExt = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a)(\?|$)/i;
  const looksLikeUploads = /(\/)?(medien\/uploads|uploads)\//i.test(side.value);
  const isMediaCandidate = mediaExt.test(side.value) || looksLikeUploads;
  const canonical = isMediaCandidate ? (side.value.includes('/medien/uploads/') ? side.value : (canonicalizeMediaPath(side.value) || side.value)) : side.value;
  const p = isMediaCandidate ? resolveMediaPath(canonical) : canonical;
  const looksLikeImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(canonical);
  const looksLikeAudio = /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(canonical);
  if (isMediaCandidate && looksLikeImage) return <div className="h-16 flex items-center justify-center bg-white rounded p-1"><img src={p} alt="" className="max-h-full max-w-full object-contain" onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(canonical.split('/').pop()||''); if(name){ const fallbacks = buildMediaFallbacks(name); let idx = Number(el.dataset.fidx||'0'); if(idx < fallbacks.length){ el.dataset.fidx=String(idx+1); el.src = fallbacks[idx]; return; } } el.replaceWith(Object.assign(document.createElement('div'), { className:'text-[10px] text-red-600 text-center break-words', innerText: name?`Fehlt: ${name}`:'Bild fehlt' })); }} /></div>;
  if (isMediaCandidate && looksLikeAudio) return <div className="h-16 flex items-center justify-center bg-white rounded p-1 w-full"><audio controls className="w-full"><source src={p} /></audio></div>;
  // Reiner Text bleibt exakt wie eingegeben
  return <div className="h-16 flex items-center justify-center text-center p-1 break-words">{canonical}</div>;
}

export default function MemoryEditor({ lesson, title, setTitle, category, setCategory, memoryRaw, setMemoryRaw, memoryPairs, memoryWarnings, memoryErrors, parseMemoryClient, handleSave, saving, returnToExercises }: MemoryEditorProps) {
  const canSave = title.trim() && memoryErrors.length === 0 && memoryPairs.length >= 4 && memoryPairs.length <= 8;
  return (
  <main className="max-w-6xl mx-auto mt-6 sm:mt-10 p-4 sm:p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🧠 Memory-Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6 flex flex-col">
          <h3 className="font-semibold mb-4">🧠 Paare eingeben</h3>
          <textarea value={memoryRaw} onChange={e => { setMemoryRaw(e.target.value); parseMemoryClient(e.target.value); }} className="w-full h-72 p-3 border rounded font-mono text-sm" placeholder={'Text|Bild.png\nZahl 1|1.mp3'} />
          <div className="mt-3 text-xs flex flex-wrap gap-3 text-gray-500">
            <span>Gefundene Paare: {memoryPairs.length}</span>
            {memoryPairs.length > 0 && memoryPairs.length < 4 && <span className="text-red-600">Mind. 4 Paare</span>}
            {memoryPairs.length >= 4 && memoryPairs.length <= 8 && <span className="text-green-600">Anzahl ok</span>}
          </div>
          {memoryWarnings.length > 0 && <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 space-y-1 max-h-32 overflow-auto">{memoryWarnings.map((w,i) => <div key={i}>• {w}</div>)}</div>}
          {memoryErrors.length > 0 && <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700 space-y-1">{memoryErrors.map((e,i) => <div key={i}>✖ {e}</div>)}</div>}
          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
            <button onClick={() => parseMemoryClient(memoryRaw)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Vorschau aktualisieren</button>
          </div>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
            <p>Format: LINKS|RECHTS • 4–8 Paare • Medien: *.jpg/png/gif/webp oder *.mp3/wav/ogg/m4a oder URL.</p>
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau ({memoryPairs.length})</h3>
          {memoryPairs.length === 0 ? <div className="text-gray-400 text-sm">Keine gültigen Paare.</div> : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {memoryPairs.map((p,i) => (
                <div key={i} className="border rounded p-2 bg-gray-50 text-xs flex flex-col gap-1">
                  <MemoryCardSide side={p.a} />
                  <div className="text-center text-gray-400 text-[10px]">↕</div>
                  <MemoryCardSide side={p.b} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
