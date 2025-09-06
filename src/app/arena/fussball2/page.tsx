"use client";
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface LobbyListItem { id:string; title:string; lessonId?:string; hostUserId?:string; players:{userId:string;username:string;side:string;ready:boolean}[]; createdAt:number; }

interface LobbyApiResponse { success:boolean; lobbies: LobbyListItem[] }

export default function FussballLobbyPage(){
  const { data: session } = useSession();
  const [list,setList] = useState<LobbyListItem[]>([]);
  const [loadingList,setLoadingList] = useState(false);
  const loadList = useCallback(async()=>{
    setLoadingList(true);
    try { const r = await fetch('/api/fussball/lobbies'); const j:LobbyApiResponse = await r.json(); if(j.success) setList(j.lobbies||[]); } catch{} finally { setLoadingList(false); }
  },[]);
  useEffect(()=>{ loadList(); const h=setInterval(loadList,5000); return ()=> clearInterval(h); },[loadList]);
  const [creating,setCreating] = useState(false);
  const [title,setTitle] = useState('');
  const [lessonId,setLessonId] = useState('');
  const [lockExercise,setLockExercise] = useState(false);
  const [exercises,setExercises] = useState<Array<{ _id:string; title:string; category?:string }>>([]);
  const [lobby,setLobby] = useState<any>(null);
  const [joining,setJoining] = useState(false);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState<string|undefined>();
  const router = useRouter();

  // Load exercises (reuse /api/exercises like snake-live)
  useEffect(()=>{
    let alive=true; (async()=>{ try{ const r=await fetch('/api/exercises'); const j=await r.json(); if(!alive) return; if(j.success){ const list=(j.exercises||[]).map((e:any)=>({_id:e._id,title:e.title,category:e.category})); setExercises(list); } }catch{} })();
    return ()=>{ alive=false; };
  },[]);

  const selectedExercise = useMemo(()=> exercises.find(e=> e._id===lessonId), [exercises, lessonId]);

  async function createLobby(){
    setCreating(true); setError(undefined);
    try {
      const res = await fetch('/api/fussball/lobbies',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, lessonId }) });
      const j = await res.json();
      if(!j.success){ setError(j.error||'Fehler'); } else {
        setLobby(j.lobby);
        // Host automatisch bereit (Server setzt ready=true)
        const meId = (session as any)?.user?.id || (session as any)?.user?._id;
        if(meId && j.lobby.players?.find((p:any)=> p.userId===String(meId) && p.ready)){
          setReady(true);
        }
      }
  loadList();
    } catch(e:any){ setError(String(e)); }
    finally { setCreating(false); }
  }

  async function join(id:string){
    if(joining) return; setJoining(true); setError(undefined);
    try { const r=await fetch(`/api/fussball/lobbies/${id}/join`, { method:'POST' }); const j=await r.json(); if(!j.success) setError(j.error||'Join fehlgeschlagen'); else setLobby(j.lobby); }
    catch(e:any){ setError(String(e)); }
    finally { setJoining(false); }
  }

  async function deleteLobby(id:string){
    setError(undefined);
    try {
      const r = await fetch(`/api/fussball/lobbies/${id}/delete`, { method:'POST' });
      const j = await r.json();
      if(!j.success){ setError(j.error||'Löschen fehlgeschlagen'); }
      await loadList();
    } catch(e:any){ setError(String(e)); }
  }

  async function toggleReady(){
    if(!lobby) return; setError(undefined);
    try { const r=await fetch(`/api/fussball/lobbies/${lobby.id}/ready`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ready: !ready }) }); const j=await r.json(); if(!j.success) setError(j.error||'Ready fehlgeschlagen'); else { setLobby(j.lobby); setReady(!ready); } }
    catch(e:any){ setError(String(e)); }
  }

  async function leave(){
    if(!lobby) return;
    try { await fetch(`/api/fussball/lobbies/${lobby.id}/leave`, { method:'POST' }); }
    finally { setLobby(null); setReady(false); }
    loadList();
  }

  // When a lobby is active, poll its state (to reflect other player ready toggles)
  useEffect(()=>{
    if(!lobby?.id) return; let alive=true; const tick=async()=>{ try{ const r=await fetch(`/api/fussball/lobbies/${lobby.id}/join`); const j=await r.json(); if(!alive) return; if(j.success){ setLobby((prev:any)=> prev? { ...prev, ...j.lobby }: j.lobby); } }catch{} };
    const iv=setInterval(tick, 4000); tick(); return ()=>{ alive=false; clearInterval(iv); };
  },[lobby?.id]);

  // Redirect if lobby active (beide ready) -> Spielseite
  useEffect(()=>{
    if(lobby?.status==='active'){
      router.push(`/arena/fussball-live/${lobby.id}`);
    }
  },[lobby?.status, lobby?.id, router]);

  if(lobby){
    return (
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-6">
        <h1 className="text-2xl font-bold">⚽ Fußball Lobby</h1>
        <div className="rounded border bg-white shadow p-4 flex flex-col gap-4 max-w-5xl">
          <div>
            <div className="text-sm font-semibold text-gray-600">Spiel Titel</div>
            <div className="text-lg font-bold">{lobby.title}</div>
          </div>
          {lobby.lessonId && (
            <div>
              <div className="text-sm font-semibold text-gray-600">Übung</div>
              <div className="text-sm text-gray-800">{selectedExercise?.title || exercises.find(e=> e._id===lobby.lessonId)?.title || lobby.lessonId}</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-gray-600">Spieler</div>
            <ul className="text-sm flex flex-col gap-1">
              {lobby.players.map((p:any)=>(<li key={p.userId} className="flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-gray-900 text-white text-[10px] uppercase">{p.side}</span><span>{p.username}</span>{p.ready && <span className="text-green-600 font-semibold text-xs">bereit</span>}</li>))}
            </ul>
            {lobby.status==='waiting' && <div className="text-xs text-amber-600">Warte auf zweiten Spieler…</div>}
            {lobby.status==='active' && <div className="text-xs text-green-600">Spiel startet…</div>}
            <div className="text-[10px] text-gray-500 mt-1">Lobby ID: <span className="font-mono select-all">{lobby.id}</span></div>
            {lobby.status==='active' && (
              <a href={`/arena/fussball-live/${lobby.id}`} className="inline-block mt-1 px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">Zum Spiel »</a>
            )}
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            <button onClick={leave} className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm">Verlassen</button>
            <button onClick={toggleReady} className={`px-3 py-1.5 rounded text-sm font-semibold ${ready? 'bg-green-600 text-white hover:bg-green-700':'bg-amber-500 text-black hover:bg-amber-400'}`}>{ready? 'Bereit ✓':'Bereit?'}</button>
            <button disabled className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm opacity-60 cursor-not-allowed">Start (später automatisch)</button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-8">
      <h1 className="text-2xl font-bold flex items-center gap-3">⚽ Fußball Matchmaking <span className="text-sm font-normal text-gray-500">(Prototyp)</span></h1>
      <section className="rounded border bg-white shadow p-4 flex flex-col gap-4 max-w-5xl">
        <h2 className="text-lg font-semibold">Neues Spiel erstellen</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm col-span-1">Titel
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Mein Fußballspiel" className="border rounded px-2 py-1 text-sm" />
          </label>
          <div className="flex flex-col gap-1 text-sm col-span-2">
            <span>Übung auswählen (Pflicht)</span>
            {!lockExercise && (
              <select value={lessonId} onChange={e=>setLessonId(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="">— bitte auswählen —</option>
                {exercises.map(ex=> <option key={ex._id} value={ex._id}>{ex.title}</option>)}
              </select>
            )}
            {lockExercise && (
              <div className="text-xs text-gray-700">{selectedExercise?.title || '—'}</div>
            )}
            <div className="flex gap-2 items-center mt-1">
              <label className="text-xs flex items-center gap-1 cursor-pointer select-none"><input type="checkbox" checked={lockExercise} onChange={e=>setLockExercise(e.target.checked)} /> Auswahl sperren</label>
              {lessonId && !lockExercise && <button onClick={()=>setLockExercise(true)} className="text-[10px] px-2 py-0.5 border rounded bg-gray-50 hover:bg-gray-100">Sperren</button>}
              {lockExercise && <button onClick={()=>setLockExercise(false)} className="text-[10px] px-2 py-0.5 border rounded bg-gray-50 hover:bg-gray-100">Ändern</button>}
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button disabled={creating || !session || !lessonId} onClick={createLobby} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed">{creating? 'Erstelle…':'Lobby erstellen'}</button>
          {!session && <span className="text-xs text-red-600">Login benötigt</span>}
          {!lessonId && <span className="text-xs text-red-600">Bitte eine Übung wählen</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </section>
      <section className="rounded border bg-white shadow p-4 flex flex-col gap-4 max-w-5xl">
        <h2 className="text-lg font-semibold">Offene Lobbys</h2>
        <div className="flex flex-col gap-3">
          {list.length? list.map((l:LobbyListItem)=>(
            <div key={l.id} className="border rounded p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" title={l.title}>{l.title}</div>
                <div className="text-[11px] text-gray-500 truncate">Spieler: {l.players.map((p)=>p.username).join(', ')||'—'}</div>
                {l.lessonId && <div className="text-[10px] text-indigo-600 truncate">Übung: {exercises.find(e=> e._id===l.lessonId)?.title || l.lessonId}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button disabled={!session || joining} onClick={()=> join(l.id)} className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed">{joining? '…':'Beitreten'}</button>
                {session && (String((session as any)?.user?.id || (session as any)?.user?._id) === String(l.hostUserId)) && (
                  <button onClick={()=> deleteLobby(l.id)} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs">Löschen</button>
                )}
              </div>
            </div>
          )): <div className="text-xs text-gray-500">{loadingList? 'Lade…':'Keine offenen Lobbys'}</div>}
        </div>
      </section>
    </main>
  );
}