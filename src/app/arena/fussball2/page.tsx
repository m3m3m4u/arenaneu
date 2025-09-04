"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface LobbyListItem { id:string; title:string; players:{userId:string;username:string;side:string;ready:boolean}[]; createdAt:number; }

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
  const [lobby,setLobby] = useState<any>(null);
  const [error,setError] = useState<string|undefined>();

  async function createLobby(){
    setCreating(true); setError(undefined);
    try {
      const res = await fetch('/api/fussball/lobbies',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, lessonId }) });
      const j = await res.json();
      if(!j.success){ setError(j.error||'Fehler'); } else { setLobby(j.lobby); }
  loadList();
    } catch(e:any){ setError(String(e)); }
    finally { setCreating(false); }
  }

  if(lobby){
    return (
      <main className="max-w-3xl mx-auto p-4 flex flex-col gap-6">
        <h1 className="text-2xl font-bold">⚽ Fußball Lobby</h1>
        <div className="rounded border bg-white shadow p-4 flex flex-col gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-600">Spiel Titel</div>
            <div className="text-lg font-bold">{lobby.title}</div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-gray-600">Spieler</div>
            <ul className="text-sm flex flex-col gap-1">
              {lobby.players.map((p:any)=>(<li key={p.userId} className="flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-gray-900 text-white text-[10px] uppercase">{p.side}</span><span>{p.username}</span>{p.ready && <span className="text-green-600 font-semibold text-xs">bereit</span>}</li>))}
            </ul>
            {lobby.status==='waiting' && <div className="text-xs text-amber-600">Warte auf zweiten Spieler…</div>}
            {lobby.status==='active' && <div className="text-xs text-green-600">Spiel startet…</div>}
          </div>
          <div className="flex gap-3">
            <button onClick={()=> setLobby(null)} className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm">Zurück</button>
            <button disabled className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm opacity-60 cursor-not-allowed">Start (kommt später)</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-4 flex flex-col gap-8">
      <h1 className="text-2xl font-bold flex items-center gap-3">⚽ Fußball Matchmaking <span className="text-sm font-normal text-gray-500">(Prototyp)</span></h1>
      <section className="rounded border bg-white shadow p-4 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Neues Spiel erstellen</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Titel
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Mein Fußballspiel" className="border rounded px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Lesson / Übung ID (optional)
            <input value={lessonId} onChange={e=>setLessonId(e.target.value)} placeholder="lessonId" className="border rounded px-2 py-1 text-sm" />
          </label>
        </div>
        <div className="flex gap-3 items-center">
          <button disabled={creating || !session} onClick={createLobby} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed">{creating? 'Erstelle…':'Lobby erstellen'}</button>
          {!session && <span className="text-xs text-red-600">Login benötigt</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </section>
      <section className="rounded border bg-white shadow p-4 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Offene Lobbys</h2>
        <div className="flex flex-col gap-3">
          {list.length? list.map((l:LobbyListItem)=>(
            <div key={l.id} className="border rounded p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex-1">
                <div className="font-semibold text-sm">{l.title}</div>
                <div className="text-[11px] text-gray-500">Spieler: {l.players.map((p)=>p.username).join(', ')||'—'}</div>
              </div>
              <button onClick={()=> setLobby(l)} className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold">Beitreten (Mock)</button>
            </div>
          )): <div className="text-xs text-gray-500">{loadingList? 'Lade…':'Keine offenen Lobbys'}</div>}
        </div>
      </section>
    </main>
  );
}