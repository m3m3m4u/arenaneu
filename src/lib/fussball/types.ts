export interface FussballLobbyConfig {
  lessonId?: string; // optional: Verknüpfung mit Übung / Lesson
  title: string;
  createdAt: number;
  hostUserId: string;
  status: 'waiting' | 'active' | 'finished' | 'aborted';
  players: FussballPlayerInfo[];
}

export interface FussballPlayerInfo {
  userId: string;
  username: string;
  joinedAt: number;
  side: 'left' | 'right';
  ready: boolean;
  score: number;
}

export interface FussballClientMessage {
  type: 'create' | 'join' | 'leave' | 'ready' | 'input' | 'ping' | 'setTitle';
  lobbyId?: string;
  payload?: any;
}

export interface FussballServerMessage {
  type: 'lobby' | 'state' | 'error' | 'pong';
  lobbyId?: string;
  payload?: any;
  error?: string;
}

export interface FussballGameState {
  lobbyId: string;
  startedAt: number | null;
  ball: { x:number;y:number;vx:number;vy:number;r:number };
  players: Record<string,{ x:number;y:number;vx:number;vy:number;side:'left'|'right';username:string;lastInput:number }>; // keyed by userId
  score: { left:number; right:number };
  lastUpdate: number;
}

export const MAX_LOBBY_AGE_MS = 1000*60*45;
export const INACTIVE_TIMEOUT_MS = 1000*60*10;