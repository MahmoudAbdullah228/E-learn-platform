import mongoose from 'mongoose';

// One cross-process migration lease per provider asset; never a playback credential cache.
const schema = new mongoose.Schema({
  _id: { type: String, required: true, maxlength: 255 },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VideoPlaybackLease = mongoose.model('VideoPlaybackLease', schema);
