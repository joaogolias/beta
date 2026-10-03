/* eslint-disable import/no-duplicates -- Exercise native and web implementations separately; Expo's lint resolver prefers web for both imports. */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CachedImage } from './CachedImage';
import { ListeningPlayer } from './ListeningPlayer';
import { ListeningPlayer as WebListeningPlayer } from './ListeningPlayer.web';

const media = vi.hoisted(() => ({
  getCachedMedia: vi.fn(),
  downloadMedia: vi.fn(),
}));
const playback = vi.hoisted(() => ({
  player: { pause: vi.fn(), play: vi.fn(), seekTo: vi.fn() },
  status: {
    isLoaded: true,
    duration: 10,
    currentTime: 0,
    error: null as string | null,
    playing: false,
    didJustFinish: false,
  },
}));
vi.mock('./media', () => media);
vi.mock('./media.web', () => media);
vi.mock('expo-audio', () => ({
  setAudioModeAsync: vi.fn(),
  useAudioPlayer: () => playback.player,
  useAudioPlayerStatus: () => playback.status,
}));
vi.mock('../offline/hooks', () => ({
  useOfflineStatus: () => ({
    ...status,
    assertCanEditLibrary: () => {
      if (!status.online || status.offlineMode || status.switchingMode)
        throw new Error('offline');
    },
  }),
}));
vi.mock('../alphabet/ui', () => ({
  Action: 'Action',
  Notice: 'Notice',
  ui: {},
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Text: 'Text',
  View: 'View',
  Image: 'Image',
}));

let status: { online: boolean; offlineMode: boolean; switchingMode: boolean };
let tree: ReactTestRenderer;
const url = 'https://example.test/question.mp3';
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    hidden: false,
  });
  status = { online: true, offlineMode: false, switchingMode: false };
  playback.status.error = null;
  media.getCachedMedia.mockReset().mockResolvedValue(null);
  media.downloadMedia.mockReset();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

test('switching offline removes an already visible remote image while cache lookup is pending', async () => {
  await act(async () => {
    tree = create(<CachedImage url={url} />);
  });
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Ilustração da questão' }).props
      .source.uri,
  ).toBe(url);
  media.getCachedMedia.mockImplementationOnce(() => new Promise(() => {}));
  status.offlineMode = true;
  await act(async () => {
    tree.update(<CachedImage url={url} />);
  });
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Ilustração da questão' }),
  ).toHaveLength(0);
});

test('a cached image remains visible without a connection', async () => {
  status.offlineMode = true;
  status.online = false;
  media.getCachedMedia.mockResolvedValue({
    uri: 'file:///image.png',
    bytes: 20,
  });
  await act(async () => {
    tree = create(<CachedImage url={url} />);
  });
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Ilustração da questão' }).props
      .source.uri,
  ).toBe('file:///image.png');
});

test.each([ListeningPlayer, WebListeningPlayer])(
  'an offline audio player blocks initial downloads and still guards a stale tap',
  async (Player) => {
    status.offlineMode = true;
    await act(async () => {
      tree = create(<Player url={url} />);
    });
    const button = tree.root.findByProps({ label: 'Baixar áudio para ouvir' });
    expect(button.props.disabled).toBe(true);
    await act(async () => {
      button.props.onPress();
    });
    expect(media.downloadMedia).not.toHaveBeenCalled();
  },
);

test('cached native audio can play offline but cannot request a replacement', async () => {
  status.offlineMode = true;
  status.online = false;
  media.getCachedMedia.mockResolvedValue({
    uri: 'file:///audio.mp3',
    bytes: 20,
  });
  await act(async () => {
    tree = create(<ListeningPlayer url={url} />);
  });
  expect(tree.root.findByProps({ label: 'Ouvir áudio' }).props.disabled).toBe(
    false,
  );
  playback.status.error = 'corrupt';
  await act(async () => {
    tree.update(<ListeningPlayer url={url} />);
  });
  expect(
    tree.root.findByProps({ label: 'Baixar áudio novamente' }).props.disabled,
  ).toBe(true);
});

test('cached browser audio remains enabled offline and blocks download retries', async () => {
  status.offlineMode = true;
  status.online = false;
  media.getCachedMedia.mockResolvedValue({
    uri: 'blob:cached-audio',
    bytes: 20,
  });
  await act(async () => {
    tree = create(<WebListeningPlayer url={url} />);
  });
  const audio = tree.root.findByProps({
    'aria-label': 'Áudio da questão de escuta',
  });
  expect(audio.props['aria-disabled']).toBe(false);
  await act(async () => {
    audio.props.onError();
  });
  const retry = tree.root.findByProps({ label: 'Baixar áudio novamente' });
  expect(retry.props.disabled).toBe(true);
  await act(async () => {
    retry.props.onPress();
  });
  expect(media.downloadMedia).not.toHaveBeenCalled();
});
