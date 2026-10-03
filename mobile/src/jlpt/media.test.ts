/* eslint-disable import/no-duplicates -- Exercise native and web implementations separately; Expo's lint resolver prefers web for both imports. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadMedia, getCachedMedia } from './media';
import { downloadMedia as downloadWebMedia } from './media.web';
import {
  MAX_MEDIA_BYTES,
  mediaUrl,
  playbackTime,
  preparePaperMedia,
} from './mediaPolicy';

const mock = vi.hoisted(() => ({
  files: new Map<string, { bytes: number; text?: string }>(),
  download: vi.fn(),
}));
vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash('sha256').update(value).digest('hex'),
  };
});
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/');
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/');
    }
    get exists() {
      return mock.files.has(this.uri);
    }
    get size() {
      return mock.files.get(this.uri)?.bytes ?? 0;
    }
    async text() {
      return mock.files.get(this.uri)?.text ?? '';
    }
    write(text: string) {
      mock.files.set(this.uri, { bytes: text.length, text });
    }
    delete() {
      mock.files.delete(this.uri);
    }
    async move(target: File) {
      const data = mock.files.get(this.uri);
      if (!data) throw new Error('Missing file');
      mock.files.set(target.uri, data);
      mock.files.delete(this.uri);
      this.uri = target.uri;
    }
    static downloadFileAsync = mock.download;
  }
  return { Directory, File, Paths: { document: 'file:///documents' } };
});

const source = 'https://media.example.test/question-1.mp3';
type Target = {
  uri: string;
  size: number;
  move(target: Target): Promise<void>;
};
beforeEach(() => {
  mock.files.clear();
  mock.download.mockReset();
  mock.download.mockImplementation(async (_url: string, target: Target) => {
    mock.files.set(target.uri, { bytes: 2048 });
    return target;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('JLPT media persistence', () => {
  it('prepares a fully cached exam offline without invoking any downloader', async () => {
    await downloadMedia(source);
    mock.download.mockClear();
    const download = vi.fn(downloadMedia);
    const assertOnline = vi.fn(() => {
      throw new Error('offline');
    });
    await preparePaperMedia([source], {
      getCachedMedia,
      downloadMedia: download,
      assertOnline,
      onProgress: vi.fn(),
    });
    expect(download).not.toHaveBeenCalled();
    expect(mock.download).not.toHaveBeenCalled();
    expect(assertOnline).not.toHaveBeenCalled();
  });

  it('explains missing offline media instead of attempting a request', async () => {
    await expect(
      preparePaperMedia([source], {
        getCachedMedia,
        downloadMedia,
        assertOnline: () => {
          throw new Error('offline');
        },
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('ainda não está disponível offline');
    expect(mock.download).not.toHaveBeenCalled();
  });

  it('rechecks mode after asynchronous disk lookups and before starting native HTTP', async () => {
    let online = true;
    const assertCanDownload = vi.fn(() => {
      if (!online) throw new Error('offline');
    });
    const download = downloadMedia(source, { assertCanDownload });
    online = false;
    await expect(download).rejects.toThrow('offline');
    expect(mock.download).not.toHaveBeenCalled();
    expect(assertCanDownload).toHaveBeenCalledOnce();
  });

  it('rechecks mode after browser cache lookup before fetching remote media', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined }),
    });
    await expect(
      downloadWebMedia(source, {
        assertCanDownload: () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports availability only after a complete file and matching manifest are saved, including a cold restart', async () => {
    expect(await getCachedMedia(source)).toBeNull();
    const media = await downloadMedia(source);
    expect(media.bytes).toBe(2048);
    expect(media.uri).toMatch(
      /^file:\/\/\/documents\/jlpt-media-v1\/[a-f0-9]{64}\.mp3$/,
    );
    expect(await getCachedMedia(source)).toEqual(media);
    vi.resetModules();
    const restarted = await import('./media');
    expect(await restarted.getCachedMedia(source)).toEqual(media);
    expect(mock.download).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent requests and reuses verified downloads without network', async () => {
    const [first, second] = await Promise.all([
      downloadMedia(source),
      downloadMedia(source),
    ]);
    expect(first).toEqual(second);
    expect(mock.download).toHaveBeenCalledOnce();
    mock.download.mockRejectedValue(new Error('offline'));
    expect(await downloadMedia(source)).toEqual(first);
  });

  it('does not keep an interrupted Android partial download or claim offline readiness', async () => {
    mock.download.mockImplementationOnce(
      async (_url: string, target: Target) => {
        mock.files.set(target.uri, { bytes: 100 });
        throw new Error('connection dropped');
      },
    );
    await expect(downloadMedia(source)).rejects.toThrow('internet');
    expect(await getCachedMedia(source)).toBeNull();
    expect([...mock.files.keys()].some((key) => key.endsWith('.partial'))).toBe(
      false,
    );
    expect((await downloadMedia(source)).bytes).toBe(2048);
  });

  it('preserves the previous complete download when a refresh fails', async () => {
    const initial = await downloadMedia(source);
    mock.download.mockRejectedValueOnce(new Error('offline'));
    await expect(downloadMedia(source, { force: true })).rejects.toThrow(
      'internet',
    );
    expect(await getCachedMedia(source)).toEqual(initial);
  });

  it('rejects missing, altered or orphaned files after restart', async () => {
    const media = await downloadMedia(source);
    mock.files.set(media.uri, { bytes: 17 });
    expect(await getCachedMedia(source)).toBeNull();
    mock.files.delete(media.uri);
    expect(await getCachedMedia(source)).toBeNull();
    mock.files.set(media.uri, { bytes: 2048 });
    for (const key of mock.files.keys())
      if (key.endsWith('.json')) mock.files.delete(key);
    expect(await getCachedMedia(source)).toBeNull();
  });

  it('rejects empty and oversized downloads without a completed cache entry', async () => {
    mock.download.mockImplementationOnce(
      async (_url: string, target: Target) => {
        mock.files.set(target.uri, { bytes: 0 });
        return target;
      },
    );
    await expect(downloadMedia(source)).rejects.toThrow('vazio');
    mock.download.mockImplementationOnce(
      async (
        _url: string,
        target: Target,
        options: {
          onProgress(progress: {
            bytesWritten: number;
            totalBytes: number;
          }): void;
          signal: AbortSignal;
        },
      ) => {
        mock.files.set(target.uri, { bytes: 100 });
        options.onProgress({
          bytesWritten: 100,
          totalBytes: MAX_MEDIA_BYTES + 1,
        });
        expect(options.signal.aborted).toBe(true);
        throw new Error('aborted');
      },
    );
    await expect(downloadMedia(source)).rejects.toThrow('64 MB');
    expect(await getCachedMedia(source)).toBeNull();
  });

  it('accepts HTTPS only and never interprets credentials or local paths as downloadable media', () => {
    for (const value of [
      'file:///secret',
      'http://media.test/a.mp3',
      'https://user:password@media.test/a.mp3',
      'not a url',
    ])
      expect(() => downloadMedia(value)).toThrow();
    expect(mediaUrl(`${source}#fragment`)).toBe(source);
    expect(mock.download).not.toHaveBeenCalled();
  });

  it('formats loading and playback times without NaN or negative progress', () => {
    expect(playbackTime(Number.NaN)).toBe('0:00');
    expect(playbackTime(-1)).toBe('0:00');
    expect(playbackTime(65.7)).toBe('1:05');
  });
});
