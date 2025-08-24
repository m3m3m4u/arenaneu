import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExerciseAssignment extends Document {
  class: mongoose.Types.ObjectId;
  lesson: mongoose.Types.ObjectId; // Lesson marked as isExercise
  assignedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ExerciseAssignmentSchema = new Schema<IExerciseAssignment>({
  class: { type: Schema.Types.ObjectId, ref: 'TeacherClass', required: true, index: true },
  lesson: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

ExerciseAssignmentSchema.index({ class: 1, lesson: 1 }, { unique: true });

const ExerciseAssignment: Model<IExerciseAssignment> = mongoose.models.ExerciseAssignment || mongoose.model<IExerciseAssignment>('ExerciseAssignment', ExerciseAssignmentSchema);
export default ExerciseAssignment;
