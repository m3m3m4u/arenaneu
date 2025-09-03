import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  name: string;
  password: string;
  email?: string;
  completedLessons: string[];
  stars: number;
  role: 'learner' | 'author' | 'admin' | 'teacher';
  ownerTeacher?: mongoose.Types.ObjectId; // Lehrer, der diesen Lernenden angelegt hat
  class?: mongoose.Types.ObjectId; // Klasse (TeacherClass)
  createdAt: Date;
  updatedAt: Date;
  lastOnline?: Date;
  tokenVersion?: number; // Inkrement für Session-Invalidierung (bei Passwort-Reset etc.)
  // Aggregierte Statistik: Anzahl Fragen insgesamt und wie viele beim ersten Versuch korrekt
  firstTryCorrectTotal?: number;
  totalQuestionsTotal?: number;
  // Pro Lektion gespeicherte erste-Versuch Statistik
  lessonStats?: Array<{ lessonId: string; firstTryCorrect: number; total: number }>;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, trim: true },
  completedLessons: [{ type: String }],
  stars: { type: Number, default: 0 },
  role: { type: String, enum: ['learner','author','admin','teacher'], default: 'learner', index: true },
  ownerTeacher: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  class: { type: Schema.Types.ObjectId, ref: 'TeacherClass', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastOnline: { type: Date, default: Date.now, index: true }
  , firstTryCorrectTotal: { type: Number, default: 0 }
  , totalQuestionsTotal: { type: Number, default: 0 }
  , lessonStats: [{ lessonId: { type: String, index: true }, firstTryCorrect: Number, total: Number }]
  , tokenVersion: { type: Number, default: 0 }
});

UserSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
UserSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('User')) {
    mongoose.deleteModel('User');
  }
} catch { /* ignore */ }
export default mongoose.model<IUser>('User', UserSchema);
