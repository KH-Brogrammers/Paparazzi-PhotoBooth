import mongoose, { Schema, Document } from 'mongoose';

export interface ICameraMapping extends Document {
  cameraId: string;
  cameraLabel: string;
  screenIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CameraMappingSchema: Schema = new Schema(
  {
    cameraId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cameraLabel: {
      type: String,
      required: true,
    },
    screenIds: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CameraMapping = mongoose.model<ICameraMapping>(
  'CameraMapping',
  CameraMappingSchema
);
