import mongoose from 'mongoose';

const videoAssetStateSchema = new mongoose.Schema({
  _id: { type: String, maxlength: 255 },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

export const VideoAssetState = mongoose.model('VideoAssetState', videoAssetStateSchema);
