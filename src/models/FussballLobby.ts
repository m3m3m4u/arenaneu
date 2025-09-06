import mongoose, { Schema, Document } from 'mongoose';

export interface IFussballPlayer {
  userId: string;
  username: string;
  joinedAt: number;
  side: 'left'|'right';
  ready: boolean;
  score: number;
}

export interface IFussballLobby extends Document {
  id: string; // kurze Lobby-ID
  lessonId?: string;
  title: string;
  createdAt: number;
  lastActivity: number;
  hostUserId: string;
  status: 'waiting'|'active'|'finished'|'aborted';
  players: IFussballPlayer[];
  // Spielzustand (synchronisiert)
  scores?: { left:number; right:number };
  goals?: { left:number; right:number };
  fieldIdx?: number;
  turn?: 'left'|'right';
}

const PlayerSchema = new Schema<IFussballPlayer>({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  joinedAt: { type: Number, required: true },
  side: { type: String, enum: ['left','right'], required: true },
  ready: { type: Boolean, default: false },
  score: { type: Number, default: 0 },
}, { _id: false });

const LobbySchema = new Schema<IFussballLobby>({
  id: { type: String, required: true, unique: true, index: true },
  lessonId: { type: String },
  title: { type: String, required: true },
  createdAt: { type: Number, required: true, index: true },
  lastActivity: { type: Number, required: true, index: true },
  hostUserId: { type: String, required: true },
  status: { type: String, enum: ['waiting','active','finished','aborted'], default: 'waiting', index: true },
  players: { type: [PlayerSchema], default: [] },
  scores: { type: Object, default: { left:0, right:0 } },
  goals: { type: Object, default: { left:0, right:0 } },
  fieldIdx: { type: Number, default: 3 },
  turn: { type: String, enum: ['left','right'], default: 'left' },
});

// Sicherstellen, dass Modell nicht doppelt registriert wird (Hot-Reload in Dev)
export default (mongoose.models.FussballLobby as mongoose.Model<IFussballLobby>) || mongoose.model<IFussballLobby>('FussballLobby', LobbySchema);
