import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { jlptFail, type PaperInput } from '../../shared/jlpt';
import {
  MAX_SHIKEN_MEDIA_BYTES,
  SHIKEN_UPLOAD_TTL_MS,
  SHIKEN_MEDIA_TYPES,
  shikenMediaInputFields,
  type ShikenMediaInput,
  type ShikenMediaResult,
  type ShikenMediaUploadResult,
} from './shikenMediaValidators';

export function validateMediaInput(input: ShikenMediaInput) {
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.clientKey))
    jlptFail('VALIDATION', 'Use uma chave de mídia de 8 a 128 caracteres.');
  if (!(SHIKEN_MEDIA_TYPES as readonly string[]).includes(input.contentType))
    jlptFail('VALIDATION', 'Formato de mídia não suportado.');
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > MAX_SHIKEN_MEDIA_BYTES
  )
    jlptFail('VALIDATION', 'A mídia deve ter entre 1 byte e 8 MiB.');
  if (!/^[a-f0-9]{64}$/.test(input.sha256))
    jlptFail(
      'VALIDATION',
      'Informe o SHA-256 hexadecimal minúsculo do arquivo.',
    );
}

export function mediaResult(row: Doc<'shikenMedia'>): ShikenMediaResult {
  return {
    id: row._id,
    clientKey: row.clientKey,
    contentType: row.contentType,
    byteLength: row.byteLength,
    sha256: row.sha256,
    status: row.storageId && row.url ? 'ready' : 'pending',
    url: row.url ?? null,
  };
}

export async function hashHex(value: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(value).buffer,
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function storageDigestHex(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  // Some storage adapters (including convex-test) expose the digest as base64.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return '';
  const bytes = atob(value);
  return Array.from(bytes, (byte) =>
    byte.charCodeAt(0).toString(16).padStart(2, '0'),
  ).join('');
}

export const reserve = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    ...shikenMediaInputFields,
    tokenHash: v.string(),
  },
  handler: async (ctx, { tokenIdentifier, tokenHash, ...input }) => {
    validateMediaInput(input);
    const owner = await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) =>
        q.eq('tokenIdentifier', tokenIdentifier),
      )
      .unique();
    const ownerId =
      owner?._id ?? (await ctx.db.insert('users', { tokenIdentifier }));
    const existing = await ctx.db
      .query('shikenMedia')
      .withIndex('by_ownerId_and_clientKey', (q) =>
        q.eq('ownerId', ownerId).eq('clientKey', input.clientKey),
      )
      .unique();
    if (
      existing &&
      (existing.sha256 !== input.sha256 ||
        existing.byteLength !== input.byteLength ||
        existing.contentType !== input.contentType)
    )
      jlptFail(
        'CONFLICT',
        'Esta chave de mídia já foi usada com outro arquivo. Reutilize o arquivo original.',
      );
    if (existing?.storageId) return existing;
    const uploadExpiresAt = Date.now() + SHIKEN_UPLOAD_TTL_MS;
    if (existing) {
      await ctx.db.patch('shikenMedia', existing._id, {
        tokenHash,
        uploadExpiresAt,
      });
      return { ...existing, tokenHash, uploadExpiresAt };
    }
    const id = await ctx.db.insert('shikenMedia', {
      ...input,
      ownerId,
      tokenHash,
      uploadExpiresAt,
      createdAt: Date.now(),
    });
    return (await ctx.db.get('shikenMedia', id))!;
  },
});

export const prepare = internalAction({
  args: { tokenIdentifier: v.string(), ...shikenMediaInputFields },
  handler: async (ctx, args): Promise<ShikenMediaUploadResult> => {
    validateMediaInput(args);
    const site = new URL(process.env.CONVEX_SITE_URL ?? '');
    if (site.protocol !== 'https:' || site.username || site.password)
      throw new Error('Upload de mídia indisponível.');
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    const tokenHash = await hashHex(new TextEncoder().encode(token));
    const row = await ctx.runMutation(internal.shikenMedia.reserve, {
      ...args,
      tokenHash,
    });
    const result = mediaResult(row);
    return {
      ...result,
      upload:
        result.status === 'ready'
          ? null
          : {
              url: new URL(`/shiken-media-upload/${token}`, site).href,
              method: 'POST',
              contentType: result.contentType,
              expiresAt: row.uploadExpiresAt,
            },
    };
  },
});

export const get = internalQuery({
  args: { tokenIdentifier: v.string(), id: v.string() },
  handler: async (
    ctx,
    { tokenIdentifier, id },
  ): Promise<ShikenMediaResult | null> => {
    const mediaId = ctx.db.normalizeId('shikenMedia', id);
    if (!mediaId) return null;
    const owner = await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) =>
        q.eq('tokenIdentifier', tokenIdentifier),
      )
      .unique();
    if (!owner) return null;
    const row = await ctx.db.get('shikenMedia', mediaId);
    return row?.ownerId === owner._id ? mediaResult(row) : null;
  },
});

export const uploadTicket = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('shikenMedia')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    return row && row.uploadExpiresAt > Date.now() ? row : null;
  },
});

export const complete = internalMutation({
  args: {
    id: v.id('shikenMedia'),
    tokenHash: v.string(),
    storageId: v.id('_storage'),
  },
  handler: async (
    ctx,
    { id, tokenHash, storageId },
  ): Promise<ShikenMediaResult> => {
    const row = await ctx.db.get('shikenMedia', id);
    if (
      !row ||
      row.tokenHash !== tokenHash ||
      row.uploadExpiresAt <= Date.now()
    )
      jlptFail(
        'UNAVAILABLE',
        'O envio expirou. Solicite novamente com a mesma chave.',
      );
    if (row.storageId) {
      if (row.storageId !== storageId) await ctx.storage.delete(storageId);
      return mediaResult(row);
    }
    const metadata = await ctx.db.system.get(storageId);
    if (
      !metadata ||
      metadata.size !== row.byteLength ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== row.contentType) ||
      storageDigestHex(metadata.sha256) !== row.sha256
    )
      jlptFail(
        'VALIDATION',
        'O arquivo recebido não corresponde à mídia preparada.',
      );
    const url = await ctx.storage.getUrl(storageId);
    if (!url) jlptFail('UNAVAILABLE', 'Arquivo indisponível.');
    await ctx.db.patch('shikenMedia', id, {
      storageId,
      url,
      uploadedAt: Date.now(),
    });
    return mediaResult({ ...row, storageId, url });
  },
});

// After an ambiguous completion, never remove the file the receipt references.
export const discardUnclaimedUpload = internalMutation({
  args: { id: v.id('shikenMedia'), storageId: v.id('_storage') },
  handler: async (ctx, { id, storageId }) => {
    const row = await ctx.db.get('shikenMedia', id);
    if (row?.storageId !== storageId) await ctx.storage.delete(storageId);
  },
});

export async function validatePaperMediaForOwner(
  ctx: MutationCtx | QueryCtx,
  ownerId: Id<'users'>,
  paper: PaperInput,
) {
  const urls = new Map<string, 'audio/' | 'image/'>();
  for (const question of paper.questions) {
    for (const [url, type] of [
      [question.audioUrl, 'audio/'],
      [question.imageUrl, 'image/'],
    ] as const) {
      if (!url) continue;
      const existingType = urls.get(url.trim());
      if (existingType && existingType !== type)
        jlptFail('VALIDATION', 'Uma mesma mídia não pode ser áudio e imagem.');
      urls.set(url.trim(), type);
    }
  }
  for (const [url, type] of urls) {
    const row = await ctx.db
      .query('shikenMedia')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique();
    if (row) {
      if (row.ownerId !== ownerId || !row.storageId)
        jlptFail('UNAVAILABLE', 'Mídia indisponível para esta conta.');
      if (!row.contentType.startsWith(type))
        jlptFail(
          'VALIDATION',
          'O tipo da mídia não corresponde ao campo da questão.',
        );
      continue;
    }
    // External HTTPS references remain supported by the existing paper domain.
    // Our own storage, however, must always have an authenticated upload receipt.
    const parsed = new URL(url);
    const site = process.env.CONVEX_SITE_URL;
    if (
      site &&
      parsed.hostname === new URL(site).hostname.replace(/\.site$/, '.cloud') &&
      parsed.pathname.startsWith('/api/storage/')
    )
      jlptFail(
        'UNAVAILABLE',
        'Publique esta mídia pelo upload autorizado antes de vincular a prova.',
      );
  }
}
