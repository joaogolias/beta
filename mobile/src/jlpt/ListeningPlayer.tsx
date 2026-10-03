import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { Action, Notice, ui } from '../alphabet/ui';
import { downloadMedia, getCachedMedia, type CachedMedia } from './media';
import { assertMediaDownloadAllowed, playbackTime } from './mediaPolicy';
import { useOfflineStatus } from '../offline/hooks';

export type ListeningPlayerProps = {
  url: string;
  questionId?: string;
  disabled?: boolean;
};

export function ListeningPlayer(props: ListeningPlayerProps) {
  return (
    <QuestionAudio key={`${props.questionId ?? ''}:${props.url}`} {...props} />
  );
}

function QuestionAudio({ url, disabled = false }: ListeningPlayerProps) {
  const { online, offlineMode, switchingMode, assertCanEditLibrary } =
    useOfflineStatus();
  const canDownload = online && !offlineMode && !switchingMode;
  const [media, setMedia] = useState<CachedMedia | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let current = true;
    void getCachedMedia(url)
      .then((value) => {
        if (current) setMedia(value);
      })
      .catch((cause) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível acessar o áudio.',
          );
      })
      .finally(() => {
        if (current) setChecking(false);
      });
    return () => {
      current = false;
    };
  }, [url]);
  async function download(force = false) {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const assertCanDownload = () =>
        assertMediaDownloadAllowed(assertCanEditLibrary);
      assertCanDownload();
      const downloaded = await downloadMedia(url, { force, assertCanDownload });
      setMedia(downloaded);
      setGeneration((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível baixar o áudio.',
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <View style={ui.inset}>
      <Text accessibilityRole="header" style={ui.subtitle}>
        聴解 · Escuta
      </Text>
      {media ? (
        <>
          <Text style={ui.note}>Áudio baixado · disponível offline</Text>
          <Playback
            key={generation}
            uri={media.uri}
            disabled={disabled || downloading}
            downloadDisabled={!canDownload}
            onRetry={() => {
              void download(true);
            }}
          />
        </>
      ) : (
        <>
          <Text style={ui.note}>
            {checking
              ? 'Conferindo o áudio salvo…'
              : 'Baixe o áudio com internet antes de responder. Depois, ele fica disponível neste aparelho sem conexão.'}
          </Text>
          <Action
            label="Baixar áudio para ouvir"
            busy={downloading}
            disabled={disabled || checking || !canDownload}
            onPress={() => {
              void download();
            }}
          />
        </>
      )}
      {!canDownload && !media && !checking && (
        <Text style={ui.note}>
          Conecte à internet e saia do modo offline nas configurações para
          baixar este áudio.
        </Text>
      )}
      {error && <Notice error>{error}</Notice>}
    </View>
  );
}

function Playback({
  uri,
  disabled,
  downloadDisabled,
  onRetry,
}: {
  uri: string;
  disabled: boolean;
  downloadDisabled: boolean;
  onRetry: () => void;
}) {
  const player = useAudioPlayer(uri, { updateInterval: 300 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ended =
    status.didJustFinish ||
    (status.duration > 0 && status.currentTime >= status.duration - 0.1);
  useEffect(() => {
    if (disabled) player.pause();
  }, [disabled, player]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => subscription.remove();
  }, [player]);
  async function play(restart: boolean) {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      });
      if (restart) await player.seekTo(0);
      player.play();
    } catch {
      setError(
        'Não foi possível reproduzir o áudio. Tente novamente ou baixe uma nova cópia.',
      );
    } finally {
      setBusy(false);
    }
  }
  const playbackError =
    error ??
    (status.error
      ? 'O áudio não abriu. Confira o arquivo e baixe uma nova cópia.'
      : null);
  return (
    <View style={ui.stack}>
      <Text style={ui.note}>
        {playbackTime(status.currentTime)} / {playbackTime(status.duration)}
      </Text>
      <Action
        label={
          status.playing
            ? 'Pausar áudio'
            : ended
              ? 'Ouvir novamente'
              : status.currentTime > 0
                ? 'Continuar áudio'
                : 'Ouvir áudio'
        }
        disabled={disabled || !status.isLoaded || Boolean(status.error)}
        busy={busy || (!status.isLoaded && !status.error)}
        onPress={() => {
          if (status.playing) player.pause();
          else void play(ended);
        }}
      />
      {!ended && status.currentTime > 0 && (
        <Action
          secondary
          label="Ouvir desde o início"
          disabled={disabled || busy}
          onPress={() => {
            void play(true);
          }}
        />
      )}
      {playbackError && (
        <>
          <Notice error>{playbackError}</Notice>
          <Action
            secondary
            label="Baixar áudio novamente"
            disabled={disabled || downloadDisabled}
            onPress={onRetry}
          />
        </>
      )}
      <Text style={ui.note}>
        A repetição é manual. O áudio não começa sozinho.
      </Text>
    </View>
  );
}
