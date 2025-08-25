import mongoose, { Schema, Document } from 'mongoose';

export interface IDbConnEvent extends Document {
  kind: 'connect' | 'disconnect' | 'selfHeal' | 'warn' | 'hardCut';
  active?: number;           // Anzahl aktiver Verbindungen zum Zeitpunkt
  maxObserved?: number;      // globaler Höchstwert (zum Zeitpunkt)
  message?: string;          // Zusatzinfo
  createdAt: Date;
}

const DbConnEventSchema = new Schema<IDbConnEvent>({
  kind: { type: String, required: true, index: true },
  active: { type: Number },
  maxObserved: { type: Number },
  message: { type: String },
  createdAt: { type: Date, default: Date.now, index: true }
});

try {
  if (mongoose.modelNames().includes('DbConnEvent')) {
    mongoose.deleteModel('DbConnEvent');
  }
} catch {}

export default mongoose.model<IDbConnEvent>('DbConnEvent', DbConnEventSchema);
