import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { hashHex, mediaResult } from './shikenMedia';
import type { Id } from './_generated/dataModel';

const headers = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });

function prefix(bytes: Uint8Array, offset: number, value: string) {
  return Array.from(value).every(
    (letter, index) => bytes[offset + index] === letter.charCodeAt(0),
  );
}

/** Reject obvious type confusion; actual decoding is checked by the publishing job. */
export function matchesMediaSignature(bytes: Uint8Array, contentType: string) {
  if (bytes.length < 12) return false;
  switch (contentType) {
    case 'image/png':
      return [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => bytes[index] === byte,
      );
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/webp':
      return prefix(bytes, 0, 'RIFF') && prefix(bytes, 8, 'WEBP');
    case 'audio/wav':
      return prefix(bytes, 0, 'RIFF') && prefix(bytes, 8, 'WAVE');
    case 'audio/mp4':
      return prefix(bytes, 4, 'ftyp');
    case 'audio/ogg':
      return prefix(bytes, 0, 'OggS');
    case 'audio/flac':
      return prefix(bytes, 0, 'fLaC');
    case 'audio/aac':
      return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    case 'audio/mpeg':
      return (
        prefix(bytes, 0, 'ID3') ||
        (bytes[0] === 0xff &&
          (bytes[1] & 0xe0) === 0xe0 &&
          (bytes[1] & 0x06) !== 0)
      );
    default:
      return false;
  }
}

async function readBoundedBody(request: Request, expectedBytes: number) {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) !== expectedBytes)
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  // A single bounded allocation avoids accumulating a potentially unbounded body.
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expectedBytes) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  return offset === expectedBytes ? bytes : null;
}

export async function handleShikenMediaUpload(
  ctx: ActionCtx,
  request: Request,
) {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (request.method !== 'POST')
    return json({ error: 'Use POST com o arquivo binário.' }, 405);
  const token = new URL(request.url).pathname.split('/').at(-1) ?? '';
  if (!/^[a-f0-9]{64}$/.test(token))
    return json({ error: 'Envio indisponível.' }, 403);
  const tokenHash = await hashHex(new TextEncoder().encode(token));
  const ticket = await ctx.runQuery(internal.shikenMedia.uploadTicket, {
    tokenHash,
  });
  if (!ticket)
    return json(
      {
        error:
          'Envio expirado ou indisponível. Prepare novamente com a mesma chave.',
      },
      403,
    );
  if (request.headers.get('content-type')?.toLowerCase() !== ticket.contentType)
    return json({ error: 'Content-Type diferente do arquivo preparado.' }, 415);
  const bytes = await readBoundedBody(request, ticket.byteLength);
  if (!bytes)
    return json({ error: 'Tamanho do arquivo diferente do preparado.' }, 413);
  if ((await hashHex(bytes)) !== ticket.sha256)
    return json({ error: 'SHA-256 diferente do arquivo preparado.' }, 422);
  if (!matchesMediaSignature(bytes, ticket.contentType))
    return json(
      { error: 'O conteúdo não corresponde ao formato da mídia.' },
      415,
    );
  if (ticket.storageId) return json(mediaResult(ticket));
  let storageId: Id<'_storage'> | undefined;
  try {
    storageId = await ctx.storage.store(
      new Blob([bytes.buffer], { type: ticket.contentType }),
    );
    const result = await ctx.runMutation(internal.shikenMedia.complete, {
      id: ticket._id,
      tokenHash,
      storageId,
    });
    return json(result);
  } catch {
    if (storageId) {
      try {
        await ctx.runMutation(internal.shikenMedia.discardUnclaimedUpload, {
          id: ticket._id,
          storageId,
        });
      } catch {
        // The caller can recover through get_shiken_media after an uncertain response.
      }
    }
    return json(
      {
        error:
          'Não foi possível confirmar o envio. Consulte get_shiken_media antes de repetir.',
      },
      503,
    );
  }
}
