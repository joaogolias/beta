export type CachedMedia = { uri: string; bytes: number };
export type DownloadOptions = {
  force?: boolean;
  assertCanDownload?: () => void;
};
export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
export const MEDIA_TIMEOUT_MS = 120_000;

export function assertMediaDownloadAllowed(assertOnline: () => void) {
  try {
    assertOnline();
  } catch {
    throw new Error(
      'Esta mídia ainda não está disponível offline. Conecte à internet e saia do modo offline nas configurações para baixá-la.',
    );
  }
}

/** Cached exams are ready offline without starting even a conditional download. */
export async function preparePaperMedia(
  urls: string[],
  {
    getCachedMedia,
    downloadMedia,
    assertOnline,
    onProgress,
  }: {
    getCachedMedia: (url: string) => Promise<CachedMedia | null>;
    downloadMedia: (
      url: string,
      options: DownloadOptions,
    ) => Promise<CachedMedia>;
    assertOnline: () => void;
    onProgress: (current: number, total: number) => void;
  },
) {
  for (let index = 0; index < urls.length; index += 1) {
    onProgress(index + 1, urls.length);
    if (await getCachedMedia(urls[index])) continue;
    const assertCanDownload = () => assertMediaDownloadAllowed(assertOnline);
    assertCanDownload();
    await downloadMedia(urls[index], { assertCanDownload });
  }
}

export function mediaUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      'O endereço da mídia é inválido. Edite a questão e informe uma URL HTTPS.',
    );
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('A mídia precisa de um endereço HTTPS sem credenciais.');
  url.hash = '';
  return url.href;
}

export function validateMediaSize(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error(
      'O arquivo veio vazio. Confira a mídia cadastrada nesta questão.',
    );
  if (size > MAX_MEDIA_BYTES)
    throw new Error(
      'A mídia ultrapassa 64 MB. Use um arquivo menor nesta questão.',
    );
}

export function mediaExtension(url: string) {
  return (
    new URL(url).pathname
      .match(/\.(mp3|m4a|aac|wav|ogg|opus|flac|mp4|webm|png|jpe?g|webp)$/i)?.[0]
      .toLowerCase() ?? '.media'
  );
}

export function playbackTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
