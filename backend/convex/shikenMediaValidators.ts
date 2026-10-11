import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const MAX_SHIKEN_MEDIA_BYTES = 8 * 1024 * 1024;
export const SHIKEN_UPLOAD_TTL_MS = 60 * 60 * 1000;
export const SHIKEN_MEDIA_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export const shikenMediaInputFields = {
  clientKey: v.string(),
  contentType: v.string(),
  byteLength: v.number(),
  sha256: v.string(),
};
export type ShikenMediaInput = {
  clientKey: string;
  contentType: string;
  byteLength: number;
  sha256: string;
};
export type ShikenMediaResult = ShikenMediaInput & {
  id: string;
  status: 'pending' | 'ready';
  url: string | null;
};
export type ShikenMediaUploadResult = ShikenMediaResult & {
  upload: null | {
    url: string;
    method: 'POST';
    contentType: string;
    expiresAt: number;
  };
};
export const shikenMediaTable = defineTable({
  ...shikenMediaInputFields,
  ownerId: v.id('users'),
  tokenHash: v.string(),
  uploadExpiresAt: v.number(),
  storageId: v.optional(v.id('_storage')),
  url: v.optional(v.string()),
  createdAt: v.number(),
  uploadedAt: v.optional(v.number()),
})
  .index('by_ownerId_and_clientKey', ['ownerId', 'clientKey'])
  .index('by_tokenHash', ['tokenHash'])
  .index('by_url', ['url']);
