import mongoose, { Schema } from 'mongoose';

export interface ICounter {
  _id: string;  // e.g. "lpoNo_2025"
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounter>('Counter', counterSchema);
