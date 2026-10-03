import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOfflineStatus } from '../offline/hooks';
import { palette } from '../theme';

export function SettingsControl() {
  const [visible, setVisible] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeInFlight = useRef(false);
  const {
    ready,
    online,
    offlineMode,
    switchingMode,
    modeError,
    pending,
    conflict,
    setOfflineMode,
  } = useOfflineStatus();
  const busy = changing || switchingMode;
  async function changeMode(enabled: boolean) {
    if (!ready || busy || changeInFlight.current) return;
    changeInFlight.current = true;
    setChanging(true);
    setError(null);
    try {
      await setOfflineMode(enabled);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível mudar de modo. Tente novamente.',
      );
    } finally {
      changeInFlight.current = false;
      setChanging(false);
    }
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir configurações"
        accessibilityHint="Permite entrar no modo offline ou sincronizar seus estudos."
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
      >
        <Text style={styles.gearIcon} accessible={false}>
          ⚙︎
        </Text>
        {offlineMode && <View style={styles.offlineDot} />}
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>
                Configurações
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar configurações"
                onPress={() => setVisible(false)}
                style={styles.close}
              >
                <Text style={styles.closeLabel}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.modeRow}>
                <View style={styles.modeCopy}>
                  <Text style={styles.label}>Modo offline</Text>
                  <Text style={styles.note}>
                    {offlineMode
                      ? 'Estude no seu ritmo, sem conexão.'
                      : 'Sua biblioteca acompanha as novidades online.'}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Modo offline"
                  accessibilityHint="Ao desligar, seus estudos são sincronizados antes de voltar online."
                  accessibilityState={{ disabled: !ready || busy, busy }}
                  value={offlineMode}
                  disabled={!ready || busy}
                  onValueChange={(enabled) => {
                    void changeMode(enabled);
                  }}
                  trackColor={{ false: palette.line, true: palette.blue }}
                  thumbColor={palette.surface}
                />
              </View>
              <Text style={styles.body}>
                No offline, você pode estudar no Benkyou e fazer simulados no
                Shiken com o conteúdo já salvo neste aparelho. Criar e editar
                itens exige estar online.
              </Text>
              <Text style={styles.note}>
                Áudios e imagens precisam ter sido baixados antes para funcionar
                sem internet.
              </Text>
              <View style={styles.status}>
                <Text style={styles.statusTitle}>
                  {offlineMode
                    ? 'Você escolhe quando voltar'
                    : online
                      ? 'Conectado'
                      : 'Sem conexão no momento'}
                </Text>
                <Text style={styles.note}>
                  {offlineMode
                    ? 'Mesmo quando a internet voltar, o modo offline continua ligado até você sair por aqui.'
                    : 'Você também pode ativar o modo offline antes de sair de casa.'}
                </Text>
                <Text style={styles.pending} accessibilityLiveRegion="polite">
                  {pending > 0
                    ? `${pending} ${pending === 1 ? 'ação de estudo aguardando envio' : 'ações de estudo aguardando envio'}.`
                    : 'Nenhum estudo aguardando envio.'}
                </Text>
              </View>
              {conflict && (
                <Text style={styles.error} accessibilityRole="alert">
                  Há uma alteração para revisar na sincronização. Feche as
                  configurações e escolha como resolver no aviso da tela.
                </Text>
              )}
              {(error || modeError) && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error || modeError}
                </Text>
              )}
              {offlineMode && (
                <>
                  {!online && (
                    <Text style={styles.note}>
                      Conecte à internet para sincronizar e voltar online.
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sincronizar e voltar online"
                    accessibilityState={{ disabled: !ready || busy, busy }}
                    disabled={!ready || busy}
                    onPress={() => {
                      void changeMode(false);
                    }}
                    style={[
                      styles.primary,
                      (!ready || busy) && styles.disabled,
                    ]}
                  >
                    {busy && <ActivityIndicator color={palette.surface} />}
                    <Text style={styles.primaryLabel}>
                      {busy
                        ? 'Sincronizando seus estudos…'
                        : 'Sincronizar e voltar online'}
                    </Text>
                  </Pressable>
                </>
              )}
              {!offlineMode && busy && (
                <ActivityIndicator color={palette.blue} />
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  gearIcon: { fontSize: 24, lineHeight: 30, color: palette.blueDeep },
  offlineDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.blue,
  },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: 'rgba(17,30,60,0.38)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '94%',
    alignSelf: 'center',
    backgroundColor: palette.surface,
    borderRadius: 26,
    overflow: 'hidden',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  title: { fontSize: 22, fontWeight: '700', color: palette.ink },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { fontSize: 18, color: palette.muted },
  content: { padding: 22, gap: 18 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  modeCopy: { flex: 1, gap: 5 },
  label: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  body: { color: palette.ink, fontSize: 14, lineHeight: 22 },
  note: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  status: {
    borderRadius: 18,
    padding: 16,
    gap: 8,
    backgroundColor: palette.blueSoft,
  },
  statusTitle: { color: palette.blueDeep, fontWeight: '700', fontSize: 15 },
  pending: {
    color: palette.blueDeep,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  error: { color: palette.error, fontSize: 13, lineHeight: 20 },
  primary: {
    minHeight: 50,
    backgroundColor: palette.blue,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  primaryLabel: {
    color: palette.surface,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    flexShrink: 1,
  },
  disabled: { opacity: 0.5 },
});
