// Keep every spent token until the family expires or is revoked. At this
// boundary the user must sign in again; never evict hashes to keep rotating.
export const MAX_REFRESH_ROTATIONS = 4096;
