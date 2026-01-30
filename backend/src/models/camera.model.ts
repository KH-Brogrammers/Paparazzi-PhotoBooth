import mongoose, { Schema, Document } from 'mongoose';

export interface ICamera extends Document {
  cameraId: string;
  cameraLabel: string;
  serialNumber: number;
  isActive: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CameraSchema: Schema = new Schema({
  cameraId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  cameraLabel: {
    type: String,
    required: true
  },
  serialNumber: {
    type: Number,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export const Camera = mongoose.model<ICamera>('Camera', CameraSchema);
