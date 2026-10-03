import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Notice, ui } from '../alphabet/ui';
import { downloadMedia, getCachedMedia, type CachedMedia } from './media.web';
import { assertMediaDownloadAllowed } from './mediaPolicy';
import { useOfflineStatus } from '../offline/hooks';

type ListeningPlayerProps = {
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
  const audio = useRef<HTMLAudioElement>(null);
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
              : 'Não foi possível abrir o áudio.',
          );
      })
      .finally(() => {
        if (current) setChecking(false);
      });
    return () => {
      current = false;
    };
  }, [url]);
  useEffect(() => {
    if (disabled) audio.current?.pause();
  }, [disabled]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) audio.current?.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  async function download(force = false) {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    audio.current?.pause();
    try {
      const assertCanDownload = () =>
        assertMediaDownloadAllowed(assertCanEditLibrary);
      assertCanDownload();
      setMedia(await downloadMedia(url, { force, assertCanDownload }));
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
          <Text style={ui.note}>
            Áudio baixado · disponível offline neste navegador
          </Text>
          <audio
            ref={audio}
            src={media.uri}
            controls
            preload="metadata"
            aria-label="Áudio da questão de escuta"
            aria-disabled={disabled || downloading}
            onPlay={() => {
              if (disabled || downloading) audio.current?.pause();
            }}
            onError={() =>
              setError(
                'O navegador não conseguiu reproduzir este arquivo. Confira o formato e baixe uma nova cópia.',
              )
            }
            style={{
              width: '100%',
              opacity: disabled ? 0.5 : 1,
              pointerEvents: disabled || downloading ? 'none' : 'auto',
            }}
          />
          <Text style={ui.note}>
            Use os controles para ouvir, pausar ou repetir. O áudio não começa
            sozinho.
          </Text>
        </>
      ) : (
        <>
          <Text style={ui.note}>
            {checking
              ? 'Conferindo o áudio salvo…'
              : 'Baixe o áudio com internet antes de responder. Depois, ele fica disponível sem conexão.'}
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
      {error && (
        <>
          <Notice error>{error}</Notice>
          {media && (
            <Action
              secondary
              label="Baixar áudio novamente"
              disabled={disabled || !canDownload}
              busy={downloading}
              onPress={() => {
                void download(true);
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
