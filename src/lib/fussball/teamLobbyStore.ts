import { MAX_LOBBY_AGE_MS, INACTIVE_TIMEOUT_MS } from './types';
import dbConnect from '@/lib/db';
import TeamLobbyModel, { IFussballTeamLobby } from '@/models/FussballTeamLobby';

interface LobbyRecord {
  id: string;
  lessonId?: string;
  title: string;
  createdAt: number;
  lastActivity: number;
  hostUserId: string;
  status: 'waiting'|'active'|'finished'|'aborted';
  players: Array<{ userId:string; username:string; joinedAt:number; side:'left'|'right'; ready:boolean; score:number }>;
  scores?: { left:number; right:number };
  goals?: { left:number; right:number };
  fieldIdx?: number;
  turn?: 'left'|'right';
}

const lobbies = new Map<string, LobbyRecord>();
let useDb = true;
try { if(!process.env.MONGODB_URI) useDb = false; } catch { useDb = false; }

// Letzte Antwortzeitpunkte je Lobby/Spieler (nur im Speicher, beeinflusst Multiplikator)
const lastAnswers = new Map<string, Map<string, number>>();
const nowMs = () => Date.now();
function touchAnswer(lobbyId: string, userId: string){
  let m = lastAnswers.get(lobbyId); if(!m){ m = new Map(); lastAnswers.set(lobbyId, m); }
  m.set(userId, nowMs());
}
function pruneAnswers(lobbyId: string, players: LobbyRecord['players']){
  const m = lastAnswers.get(lobbyId); if(!m) return;
  const ids = new Set(players.map(p=>p.userId));
  for(const uid of Array.from(m.keys())) if(!ids.has(uid)) m.delete(uid);
}
function countActivePlayers(lobbyId: string, players: LobbyRecord['players']): number{
  const m = lastAnswers.get(lobbyId);
  const THRESH = 30_000; const now = nowMs();
  if(!m){ return 0; }
  let c = 0; for(const p of players){ const ts = m.get(p.userId); if(ts && (now - ts) <= THRESH) c++; }
  return c;
}

function genId(){ return Math.random().toString(36).slice(2,10); }

export async function createLobby(hostUserId: string, username: string, title: string, lessonId?: string){
  const id = genId();
  const rec: LobbyRecord = {
    id,
    lessonId,
    title: title || 'Fußball Team Match',
    createdAt: Date.now(),
    hostUserId,
    status: 'waiting',
    // Host ist automatisch bereit und startet auf Team "left"
    players: [ { userId: hostUserId, username, joinedAt: Date.now(), side: 'left', ready: true, score:0 } ],
    lastActivity: Date.now(),
    scores: { left:0, right:0 },
    goals: { left:0, right:0 },
    fieldIdx: 3,
    turn: 'left'
  };
  if(useDb){
    try{ await dbConnect(); await TeamLobbyModel.create(rec as unknown as IFussballTeamLobby); } catch { lobbies.set(id, rec); }
  } else { lobbies.set(id, rec); }
  // Host initial als aktiv werten
  touchAnswer(id, hostUserId);
  return rec;
}

export async function getLobby(id: string){
  if(useDb){ try{ await dbConnect(); const doc = await TeamLobbyModel.findOne({ id }).lean(); return doc as unknown as LobbyRecord | undefined; } catch{} }
  return lobbies.get(id);
}

export async function joinLobby(id: string, userId: string, username: string){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  if(lobby.status !== 'waiting') return { error:'ALREADY_STARTED' } as const;
  if(lobby.players.find(p=>p.userId===userId)) return { lobby } as const;
  // Team-Balancing: weise dem kleineren Team zu (bei Gleichstand zufällig)
  const leftCount = lobby.players.filter(p=>p.side==='left').length;
  const rightCount = lobby.players.filter(p=>p.side==='right').length;
  let side: 'left'|'right' = 'left';
  if(leftCount < rightCount) side = 'left';
  else if(rightCount < leftCount) side = 'right';
  else side = Math.random() < 0.5 ? 'left' : 'right';
  lobby.players.push({ userId, username, joinedAt: Date.now(), side, ready:true, score:0 });
  lobby.lastActivity = Date.now();
  touchAnswer(id, userId);
  // Kein Autostart mehr: Start ausschließlich durch Host via explizite Aktion
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.updateOne({ id }, { $set: { players: lobby.players, lastActivity: lobby.lastActivity } }); } catch{ /* ignore */ } }
  else { lobbies.set(id, lobby); }
  return { lobby } as const;
}

export async function updateReady(id: string, userId: string, ready: boolean){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  const p = lobby.players.find(p=>p.userId===userId); if(!p) return { error:'NOT_IN_LOBBY' } as const;
  p.ready = ready; lobby.lastActivity = Date.now();
  // Kein Autostart mehr über Ready-Status
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.updateOne({ id }, { $set: { players: lobby.players, status: lobby.status, lastActivity: lobby.lastActivity } }); } catch{} }
  else { lobbies.set(id, lobby); }
  return { lobby } as const;
}

export async function leaveLobby(id: string, userId: string){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  const idx = lobby.players.findIndex(p=>p.userId===userId);
  if(idx>=0){ lobby.players.splice(idx,1); lobby.lastActivity=Date.now(); }
  if(!lobby.players.length){ lobbies.delete(id); return { deleted:true } as const; }
  if(lobby.status==='active'){
    // Falls ein Team leer fällt, Spiel abbrechen
    const hasLeft = lobby.players.some(pl=>pl.side==='left');
    const hasRight = lobby.players.some(pl=>pl.side==='right');
    if(!hasLeft || !hasRight) lobby.status='aborted';
  }
  if(lobby.hostUserId===userId && lobby.players.length){ lobby.hostUserId = lobby.players[0].userId; }
  pruneAnswers(id, lobby.players);
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.updateOne({ id }, { $set: { players: lobby.players, status: lobby.status, lastActivity: lobby.lastActivity, hostUserId: lobby.hostUserId } }); } catch{} }
  else { lobbies.set(id, lobby); }
  return { lobby } as const;
}

export async function listOpenLobbies(){
  const now = Date.now();
  if(useDb){
    try{
      await dbConnect();
      const docs = await TeamLobbyModel.find({ status:'waiting', createdAt: { $gt: now - MAX_LOBBY_AGE_MS } }).sort({ createdAt: -1 }).lean();
      return docs.map((l:any)=> ({ id: l.id, title: l.title, lessonId: l.lessonId, hostUserId: l.hostUserId, players: (l.players||[]).map((p:any)=>({userId:p.userId,username:p.username,side:p.side,ready:p.ready})), createdAt: l.createdAt }));
    } catch {}
  }
  return Array.from(lobbies.values())
    .filter(l=> l.status==='waiting' && now - l.createdAt < MAX_LOBBY_AGE_MS)
    .map(l=> ({ id: l.id, title: l.title, lessonId: l.lessonId, hostUserId: l.hostUserId, players: l.players.map(p=>({userId:p.userId,username:p.username,side:p.side,ready:p.ready})), createdAt: l.createdAt }));
}

export async function getState(id: string){
  const lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  const scores = lobby.scores || { left:0, right:0 };
  const goals = lobby.goals || { left:0, right:0 };
  const fieldIdx = typeof lobby.fieldIdx==='number'? lobby.fieldIdx : 3;
  const turn = lobby.turn || 'left';
  return { state: { scores, goals, fieldIdx, turn } } as const;
}

export async function applyAnswer(id: string, isCorrect: boolean, answeredBy: 'left'|'right', userId?: string){
  const lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  if(userId){ touchAnswer(id, userId); }
  const target: 'left'|'right' = isCorrect ? answeredBy : (answeredBy==='left' ? 'right' : 'left');
  const scores = { left: lobby.scores?.left||0, right: lobby.scores?.right||0 };
  scores[target] += 1;
  const LEFT_GOAL_INDEX = 0; const RIGHT_GOAL_INDEX = 6; const NEUTRAL_INDEX = 3;
  const rawLead = scores.left - scores.right;
  // Dynamische Punktschwelle pro "Szene": Basis 3 Punkte, multipliziert mit aktiven Spielern und halbiert
  // Aktive Spieler: innerhalb der letzten 30s geantwortet
  const active = Math.max(1, countActivePlayers(id, lobby.players));
  let stepThreshold = Math.max(1, Math.ceil(3 * active / 2));
  const steps = Math.min(3, Math.floor(Math.abs(rawLead) / stepThreshold));
  let desiredIdx = NEUTRAL_INDEX;
  if(rawLead > 0) desiredIdx = Math.max(LEFT_GOAL_INDEX, NEUTRAL_INDEX - steps);
  else if(rawLead < 0) desiredIdx = Math.min(RIGHT_GOAL_INDEX, NEUTRAL_INDEX + steps);
  let goals = { left: lobby.goals?.left||0, right: lobby.goals?.right||0 };
  if(desiredIdx===LEFT_GOAL_INDEX || desiredIdx===RIGHT_GOAL_INDEX){
    if(desiredIdx===LEFT_GOAL_INDEX) goals.left += 1; else goals.right += 1;
    lobby.scores = { left:0, right:0 };
    lobby.fieldIdx = NEUTRAL_INDEX;
    lobby.goals = goals;
  } else {
    lobby.scores = scores;
    lobby.fieldIdx = desiredIdx;
  }
  lobby.turn = (answeredBy==='left' ? 'right':'left');
  lobby.lastActivity = Date.now();
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.updateOne({ id }, { $set: { scores: lobby.scores, goals: lobby.goals, fieldIdx: lobby.fieldIdx, turn: lobby.turn, lastActivity: lobby.lastActivity } }); } catch{} }
  else { lobbies.set(id, lobby); }
  return { state: { scores: lobby.scores!, goals: lobby.goals!, fieldIdx: lobby.fieldIdx!, turn: lobby.turn! } } as const;
}

export async function deleteLobbyByHost(id: string, userId: string){
  const lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  if(lobby.hostUserId !== userId) return { error:'NO_PERMISSION' } as const;
  if(lobby.status !== 'waiting') return { error:'NOT_ALLOWED' } as const;
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.deleteOne({ id, hostUserId: userId, status:'waiting' }); } catch{} }
  lobbies.delete(id);
  return { deleted:true } as const;
}

// Start nur durch Host und nur wenn beide Teams mindestens einen Spieler haben
export async function startLobby(id: string, userId: string){
  let lobby = await getLobby(id) as LobbyRecord | undefined; if(!lobby) return { error:'NOT_FOUND' } as const;
  if(lobby.hostUserId !== userId) return { error:'NO_PERMISSION' } as const;
  if(lobby.status !== 'waiting') return { error:'ALREADY_STARTED' } as const;
  const hasLeft = lobby.players.some(p=>p.side==='left');
  const hasRight = lobby.players.some(p=>p.side==='right');
  if(!hasLeft || !hasRight) return { error:'NEED_BOTH_TEAMS' } as const;
  lobby.status = 'active';
  lobby.lastActivity = Date.now();
  if(useDb){ try{ await dbConnect(); await TeamLobbyModel.updateOne({ id }, { $set: { status: lobby.status, lastActivity: lobby.lastActivity } }); } catch{} }
  else { lobbies.set(id, lobby); }
  return { lobby } as const;
}

setInterval(()=>{
  const now = Date.now();
  for(const [id,l] of lobbies){
    if(now - l.createdAt > MAX_LOBBY_AGE_MS) { lobbies.delete(id); continue; }
    if(l.status==='waiting' && now - l.lastActivity > INACTIVE_TIMEOUT_MS){ lobbies.delete(id); continue; }
  }
}, 60_000);

export type { LobbyRecord };
