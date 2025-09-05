import mongoose, { Schema, models, model } from 'mongoose';

export interface FussballPlayerDoc {
  userId: string;
  username: string;
  joinedAt: Date;
  side: 'left' | 'right';
  ready: boolean;
  score: number;
}

export interface FussballLobbyDoc {
  _id: mongoose.Types.ObjectId;
  title: string;
  lessonId?: string;
  createdAt: Date;
  hostUserId: string;
  status: 'waiting' | 'active' | 'finished' | 'aborted';
  players: FussballPlayerDoc[];
  lastActivity: Date;
}

const PlayerSchema = new Schema<FussballPlayerDoc>({
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  joinedAt: { type: Date, required: true, default: () => new Date() },
  side: { type: String, enum: ['left', 'right'], required: true },
  ready: { type: Boolean, required: true, default: false },
  score: { type: Number, required: true, default: 0 },
}, { _id: false });

const LobbySchema = new Schema<FussballLobbyDoc>({
  title: { type: String, required: true },
  lessonId: { type: String },
  createdAt: { type: Date, required: true, default: () => new Date() },
  hostUserId: { type: String, required: true },
  status: { type: String, enum: ['waiting','active','finished','aborted'], required: true, default: 'waiting', index: true },
  players: { type: [PlayerSchema], required: true, default: [] },
  lastActivity: { type: Date, required: true, default: () => new Date(), index: true },
});

LobbySchema.index({ status: 1, createdAt: -1 });
LobbySchema.index({ lastActivity: -1 });

const FussballLobbyModel = models.FussballLobby || model<FussballLobbyDoc>('FussballLobby', LobbySchema);

export default FussballLobbyModel;
