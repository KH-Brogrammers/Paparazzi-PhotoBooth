import mongoose, { Schema, Document } from 'mongoose';

export interface IScreen extends Document {
  screenId: string;
  label: string;
  position?: {
    left: number;
    top: number;
  };
  resolution?: {
    width: number;
    height: number;
  };
  isPrimary: boolean;
  isAvailable: boolean;
  isCollageScreen: boolean;
  rotation: number; // 0, 90, -90
  collagePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ScreenSchema: Schema = new Schema(
  {
    screenId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
    },
    position: {
      left: { type: Number },
      top: { type: Number },
    },
    resolution: {
      width: { type: Number },
      height: { type: Number },
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isCollageScreen: {
      type: Boolean,
      default: false,
    },
    rotation: {
      type: Number,
      default: 0,
      enum: [0, 90, -90],
    },
    collagePosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      width: { type: Number },
      height: { type: Number },
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const Screen = mongoose.model<IScreen>('Screen', ScreenSchema);
