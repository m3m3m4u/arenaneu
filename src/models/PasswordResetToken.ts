import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordResetToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string; // Hash des Tokens (nicht im Klartext speichern)
  expiresAt: Date;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Automatisch alte Tokens aufräumen (TTL Index Alternative)
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

try { if(mongoose.modelNames().includes('PasswordResetToken')) { mongoose.deleteModel('PasswordResetToken'); } } catch {}

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);
