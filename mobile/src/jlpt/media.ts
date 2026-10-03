import { Directory, File, Paths } from 'expo-file-system';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import {
  MAX_MEDIA_BYTES,
  MEDIA_TIMEOUT_MS,
  mediaExtension,
  mediaUrl,
  validateMediaSize,
  type CachedMedia,
  type DownloadOptions,
} from './mediaPolicy';
export type { CachedMedia } from './mediaPolicy';

type Manifest = { url: string; bytes: number; version: 1 };
const downloads = new Map<string, Promise<CachedMedia>>();

async function location(url: string) {
  const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, url);
  const directory = new Directory(Paths.document, 'jlpt-media-v1');
  return {
    directory,
    file: new File(directory, `${key}${mediaExtension(url)}`),
    manifest: new File(directory, `${key}.json`),
    temporary: new File(directory, `${key}.partial`),
  };
}

export async function getCachedMedia(
  value: string,
): Promise<CachedMedia | null> {
  const url = mediaUrl(value);
  const { file, manifest } = await location(url);
  if (!file.exists || !manifest.exists) return null;
  try {
    const saved: Manifest = JSON.parse(await manifest.text());
    if (saved.version !== 1 || saved.url !== url || saved.bytes !== file.size)
      return null;
    validateMediaSize(saved.bytes);
    return { uri: file.uri, bytes: saved.bytes };
  } catch {
    return null;
  }
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
  const cached = await getCachedMedia(url);
  if (cached && !options.force) return cached;
  const { directory, file, manifest, temporary } = await location(url);
  // The user may have enabled offline while the cache lookup was pending.
  options.assertCanDownload?.();
  directory.create({ intermediates: true, idempotent: true });
  if (temporary.exists) temporary.delete();
  const controller = new AbortController();
  let tooLarge = false;
  const timeout = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);
  try {
    const downloaded = await File.downloadFileAsync(url, temporary, {
      signal: controller.signal,
      onProgress({ bytesWritten, totalBytes }) {
        if (bytesWritten > MAX_MEDIA_BYTES || totalBytes > MAX_MEDIA_BYTES) {
          tooLarge = true;
          controller.abort();
        }
      },
    });
    validateMediaSize(downloaded.size);
    const bytes = downloaded.size;
    // Android can leave a partial download on failure. Only the completed file
    // plus matching manifest counts as available after an app restart.
    await downloaded.move(file, { overwrite: true });
    manifest.write(
      JSON.stringify({ version: 1, url, bytes } satisfies Manifest),
    );
    const verified = await getCachedMedia(url);
    if (!verified)
      throw new Error('Não foi possível confirmar a gravação da mídia.');
    return verified;
  } catch (cause) {
    if (tooLarge)
      throw new Error(
        'A mídia ultrapassa 64 MB. Use um arquivo menor nesta questão.',
      );
    if (
      cause instanceof Error &&
      (cause.message.includes('vazio') || cause.message.includes('64 MB'))
    )
      throw cause;
    throw new Error(
      'Não foi possível baixar a mídia. Conecte à internet e tente novamente; confira também o endereço cadastrado.',
    );
  } finally {
    clearTimeout(timeout);
    // Use a fresh reference: moving a File changes that object's URI.
    const partial = (await location(url)).temporary;
    if (partial.exists) partial.delete();
  }
}
