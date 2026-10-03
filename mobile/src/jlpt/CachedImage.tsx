import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { Notice, ui } from '../alphabet/ui';
import { getCachedMedia } from './media';
import { mediaUrl } from './mediaPolicy';
import { useOfflineStatus } from '../offline/hooks';

export function CachedImage({
  url,
  style,
  accessibilityLabel = 'Ilustração da questão',
}: {
  url: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const { online, offlineMode, switchingMode } = useOfflineStatus();
  const canFetch = online && !offlineMode && !switchingMode;
  const [source, setSource] = useState<{
    url: string;
    uri: string;
    cached: boolean;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.5);
  useEffect(() => {
    let current = true;
    void getCachedMedia(url)
      .then((cached) => {
        if (current) {
          setFailed(!cached && !canFetch ? url : null);
          setSource(
            cached
              ? { url, uri: cached.uri, cached: true }
              : canFetch
                ? { url, uri: mediaUrl(url), cached: false }
                : null,
          );
        }
      })
      .catch(() => {
        if (current) setFailed(url);
      });
    return () => {
      current = false;
    };
  }, [url, canFetch]);
  return (
    <View style={ui.stack}>
      {source?.url === url && (source.cached || canFetch) && (
        <Image
          source={{ uri: source.uri }}
          accessibilityLabel={accessibilityLabel}
          resizeMode="contain"
          style={[{ width: '100%', aspectRatio: ratio }, style]}
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          onError={() => setFailed(url)}
        />
      )}
      {failed === url && (
        <Notice error>
          Não foi possível abrir a ilustração. Baixe as mídias desta prova com
          internet antes de estudar offline.
        </Notice>
      )}
    </View>
  );
}
