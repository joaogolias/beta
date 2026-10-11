import {
  MAX_MEDIA_BYTES,
  MEDIA_TIMEOUT_MS,
  mediaUrl,
  validateMediaSize,
  type CachedMedia,
  type DownloadOptions,
} from './mediaPolicy';
export type { CachedMedia } from './mediaPolicy';

const CACHE_NAME = 'beta-jlpt-media-v1';
const objects = new Map<string, CachedMedia>();
const downloads = new Map<string, Promise<CachedMedia>>();

async function cache() {
  if (typeof caches === 'undefined')
    throw new Error(
      'Este navegador não oferece armazenamento offline de áudio. Use o app Android ou abra a prévia em localhost.',
    );
  return caches.open(CACHE_NAME);
}

export async function getCachedMedia(
  value: string,
): Promise<CachedMedia | null> {
  const url = mediaUrl(value);
  const response = await (await cache()).match(url);
  if (!response || !response.ok) return null;
  const blob = await response.blob();
  const expected = Number(response.headers.get('x-babel-media-bytes'));
  if (expected !== blob.size) return null;
  try {
    validateMediaSize(blob.size);
  } catch {
    return null;
  }
  let item = objects.get(url);
  if (!item || item.bytes !== blob.size) {
    if (item) URL.revokeObjectURL(item.uri);
    item = { uri: URL.createObjectURL(blob), bytes: blob.size };
    objects.set(url, item);
  }
  return item;
}

export function downloadMedia(
  value: string,
  options: DownloadOptions = {},
): Promise<CachedMedia> {
  const url = mediaUrl(value);
  const pending = downloads.get(url);
  if (pending) return pending;
  const operation = download(url, options).finally(() => downloads.delete(url));
  downloads.set(url, operation);
  return operation;
}

async function download(
  url: string,
  options: DownloadOptions,
): Promise<CachedMedia> {
  const saved = await getCachedMedia(url);
  if (saved && !options.force) return saved;
  const storage = await cache();
  // Check at the network boundary, after asynchronous cache lookups.
  options.assertCanDownload?.();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok || !response.body)
      throw new Error('Download indisponível.');
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_MEDIA_BYTES)
      throw new Error('A mídia ultrapassa 64 MB.');
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_MEDIA_BYTES)
          throw new Error('A mídia ultrapassa 64 MB.');
        chunks.push(new Uint8Array(next.value));
      }
    } finally {
      await reader.cancel();
    }
    validateMediaSize(size);
    const blob = new Blob(chunks, {
      type: response.headers.get('content-type') ?? 'application/octet-stream',
    });
    // Cache Storage commits only the complete response, never an interrupted body.
    await storage.put(
      url,
      new Response(blob, {
        headers: {
          'content-type': blob.type,
          'x-babel-media-bytes': String(blob.size),
        },
      }),
    );
    const old = objects.get(url);
    if (old) URL.revokeObjectURL(old.uri);
    objects.delete(url);
    const verified = await getCachedMedia(url);
    if (!verified) throw new Error('Não foi possível confirmar a gravação.');
    return verified;
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.includes('64 MB') || cause.message.includes('vazio'))
    )
      throw cause;
    throw new Error(
      'Não foi possível baixar a mídia. Confira sua conexão e o endereço. Na prévia web, o servidor do arquivo também precisa permitir o download pelo navegador (CORS).',
    );
  } finally {
    clearTimeout(timeout);
  }
}
