import { FussballLobbyConfig, FussballPlayerInfo, MAX_LOBBY_AGE_MS, INACTIVE_TIMEOUT_MS } from './types';
import dbConnect from '@/lib/db';
import FussballLobbyModel, { IFussballLobby } from '@/models/FussballLobby';

interface LobbyRecord extends FussballLobbyConfig {
  id: string;
  lastActivity: number;
}

const lobbies = new Map<string, LobbyRecord>();
let useDb = true;
try { if(!process.env.MONGODB_URI) useDb = false; } catch { useDb = false; }

function genId(){ return Math.random().toString(36).slice(2,10); }

export async function createLobby(hostUserId: string, username: string, title: string, lessonId?: string){
  const id = genId();
  const rec: LobbyRecord = {
    id,
    lessonId,
    title: title || 'Fußball Match',
    createdAt: Date.now(),
    hostUserId,
    status: 'waiting',
  // Host ist automatisch bereit
  players: [ { userId: hostUserId, username, joinedAt: Date.now(), side: 'left', ready: true, score:0 } ],
    lastActivity: Date.now()
  };
  if(useDb){
    try {
      await dbConnect();
      await FussballLobbyModel.create(rec as unknown as IFussballLobby);
    } catch { /* fallback to memory */ lobbies.set(id, rec); }
  } else {
    lobbies.set(id, rec);
  }
  return rec;
}

export async function getLobby(id: string){
  if(useDb){
    try { await dbConnect(); const doc = await FussballLobbyModel.findOne({ id }).lean(); return doc as unknown as LobbyRecord | undefined; } catch { /* ignore */ }
  }
  return lobbies.get(id);
}

export async function joinLobby(id: string, userId: string, username: string){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error: 'NOT_FOUND' } as const;
  if(lobby.status !== 'waiting') return { error: 'ALREADY_STARTED' } as const;
  if(lobby.players.find(p=>p.userId===userId)) return { lobby } as const;
  if(lobby.players.length >= 2) return { error: 'FULL' } as const;
  const side: 'left'|'right' = lobby.players.some(p=>p.side==='left') ? 'right':'left';
  lobby.players.push({ userId, username, joinedAt: Date.now(), side, ready:true, score:0 });
  lobby.lastActivity = Date.now();
  // Wenn jetzt zwei Spieler drin sind (Host ist bereits ready), Spiel sofort starten
  if(lobby.players.length === 2 && lobby.players.every(p=>p.ready)){
    lobby.status = 'active';
  }
  if(useDb){
    try { await dbConnect(); await FussballLobbyModel.updateOne({ id }, { $set: { players: lobby.players, lastActivity: lobby.lastActivity, status: lobby.status } }); } catch { /* ignore */ }
  } else {
    lobbies.set(id, lobby);
  }
  return { lobby } as const;
}

export async function updateReady(id: string, userId: string, ready: boolean){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  const p = lobby.players.find(p=>p.userId===userId); if(!p) return { error:'NOT_IN_LOBBY' } as const;
  p.ready = ready; lobby.lastActivity = Date.now();
  if(lobby.players.length===2 && lobby.players.every(p=>p.ready) && lobby.status==='waiting'){
    lobby.status='active';
  }
  if(useDb){
    try { await dbConnect(); await FussballLobbyModel.updateOne({ id }, { $set: { players: lobby.players, status: lobby.status, lastActivity: lobby.lastActivity } }); } catch { /* ignore */ }
  } else {
    lobbies.set(id, lobby);
  }
  return { lobby } as const;
}

export async function leaveLobby(id: string, userId: string){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  const idx = lobby.players.findIndex(p=>p.userId===userId);
  if(idx>=0){ lobby.players.splice(idx,1); lobby.lastActivity=Date.now(); }
  if(!lobby.players.length){ lobbies.delete(id); return { deleted:true } as const; }
  if(lobby.status==='active'){ lobby.status='aborted'; }
  if(lobby.hostUserId===userId && lobby.players.length){ lobby.hostUserId = lobby.players[0].userId; }
  if(useDb){
    try { await dbConnect(); await FussballLobbyModel.updateOne({ id }, { $set: { players: lobby.players, status: lobby.status, lastActivity: lobby.lastActivity, hostUserId: lobby.hostUserId } }); } catch { /* ignore */ }
  } else {
    lobbies.set(id, lobby);
  }
  return { lobby } as const;
}

export async function listOpenLobbies(){
  const now = Date.now();
  if(useDb){
    try {
      await dbConnect();
      const docs = await FussballLobbyModel.find({ status:'waiting', createdAt: { $gt: now - MAX_LOBBY_AGE_MS } }).sort({ createdAt: -1 }).lean();
      return docs.map((l:any)=> ({ id: l.id, title: l.title, lessonId: l.lessonId, players: (l.players||[]).map((p:any)=>({userId:p.userId,username:p.username,side:p.side,ready:p.ready})), createdAt: l.createdAt }));
    } catch { /* fall back */ }
  }
  return Array.from(lobbies.values())
    .filter(l=> l.status==='waiting' && now - l.createdAt < MAX_LOBBY_AGE_MS)
    .map(l=> ({ id: l.id, title: l.title, lessonId: l.lessonId, players: l.players.map(p=>({userId:p.userId,username:p.username,side:p.side,ready:p.ready})), createdAt: l.createdAt }));
}

export function setTitle(id: string, userId: string, title: string){
  const lobby = lobbies.get(id); if(!lobby) return { error:'NOT_FOUND' } as const;
  if(lobby.hostUserId !== userId) return { error:'NO_PERMISSION' } as const;
  lobby.title = title.slice(0,60) || lobby.title; lobby.lastActivity = Date.now();
  return { lobby } as const;
}

// Periodic cleanup
setInterval(()=>{
  const now = Date.now();
  for(const [id,l] of lobbies){
    if(now - l.createdAt > MAX_LOBBY_AGE_MS) { lobbies.delete(id); continue; }
    if(l.status==='waiting' && now - l.lastActivity > INACTIVE_TIMEOUT_MS){ lobbies.delete(id); continue; }
  }
}, 60_000);

export type { LobbyRecord };