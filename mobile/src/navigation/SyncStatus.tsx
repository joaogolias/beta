import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, Notice } from '../alphabet/ui';
import { AppModal } from '../environment/AppEnvironment';
import { useOfflineStatus } from '../offline/hooks';
import { palette } from '../theme';

type Work = 'refresh' | 'resolve';
type Failure = { message: string; lastSyncedAt: number | null };

const indicators = {
  synced: { symbol: '✓', background: '#34794C', foreground: '#FFFFFF' },
  pending: { symbol: '↻', background: '#E4BF4F', foreground: '#4B3B13' },
  error: { symbol: '!', background: palette.error, foreground: '#FFFFFF' },
};

/** A stable header control; synchronization details appear only on request. */
export function SyncStatus() {
  const status = useOfflineStatus();
  const [visible, setVisible] = useState(false);
  const [choice, setChoice] = useState<'device' | 'cloud' | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inFlight = useRef(false);
  const busy = work !== null || status.syncing || status.switchingMode;
  // A later successful automatic sync also clears an older manual failure.
  const manualError =
    failure?.lastSyncedAt === status.lastSyncedAt ? failure?.message : null;
  const error = manualError || status.error || status.modeError;
  const synced =
    status.ready &&
    status.online &&
    !status.offlineMode &&
    !busy &&
    status.pending === 0 &&
    status.lastSyncedAt !== null;
  const tone =
    status.conflict || error ? 'error' : synced ? 'synced' : 'pending';
  const indicator = indicators[tone];
  const pendingLabel =
    status.pending === 0
      ? 'Nenhuma atividade pendente'
      : `${status.pending} ${status.pending === 1 ? 'atividade pendente' : 'atividades pendentes'}`;
  const stateLabel = status.conflict
    ? 'Conflito de sincronização'
    : error
      ? 'Erro de sincronização'
      : !status.ready
        ? 'Preparando biblioteca'
        : busy
          ? 'Sincronizando'
          : status.offlineMode
            ? 'Modo offline'
            : !status.online
              ? 'Sem conexão'
              : status.pending > 0
                ? pendingLabel
                : synced
                  ? 'Tudo sincronizado'
                  : 'Aguardando primeira sincronização';

  async function perform(kind: Work, action: () => Promise<void>) {
    if (busy || inFlight.current) return false;
    inFlight.current = true;
    setWork(kind);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setFailure({
        message:
          cause instanceof Error
            ? cause.message
            : 'Não foi possível sincronizar agora. Suas atividades continuam neste aparelho.',
        lastSyncedAt: status.lastSyncedAt,
      });
      return false;
    } finally {
      inFlight.current = false;
      setWork(null);
    }
  }

  async function refresh() {
    if (!status.ready || !status.online || status.conflict) return;
    await perform(
      'refresh',
      status.offlineMode ? () => status.setOfflineMode(false) : status.refresh,
    );
  }

  async function resolve() {
    if (
      !choice ||
      !status.ready ||
      !status.online ||
      !status.conflict ||
      (choice === 'device' && !status.conflict.canForce)
    ) {
      return;
    }
    if (await perform('resolve', () => status.resolveConflict(choice))) {
      setChoice(null);
    }
  }

  function close() {
    if (work === 'resolve') return;
    if (choice) setChoice(null);
    else setVisible(false);
  }

  const confirmLabel =
    choice === 'cloud'
      ? status.offlineMode
        ? 'Descartar pendências e voltar online'
        : 'Descartar pendências e usar a nuvem'
      : status.offlineMode
        ? 'Usar este aparelho e voltar online'
        : 'Confirmar alterações deste aparelho';

  return (
    <>
      <Pressable
        testID="sync-status-indicator"
        accessibilityRole="button"
        accessibilityLabel={`Sincronização: ${stateLabel}. Ver detalhes`}
        accessibilityHint="Mostra a última sincronização, pendências e opções de sincronização."
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}
      >
        <View
          style={[styles.indicator, { backgroundColor: indicator.background }]}
        >
          <Text
            accessible={false}
            allowFontScaling={false}
            style={[styles.symbol, { color: indicator.foreground }]}
          >
            {indicator.symbol}
          </Text>
        </View>
      </Pressable>
      <AppModal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>
                {choice ? 'Confirmar resolução' : 'Sincronização'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  choice ? 'Voltar aos detalhes' : 'Fechar sincronização'
                }
                disabled={work === 'resolve'}
                accessibilityState={{ disabled: work === 'resolve' }}
                onPress={close}
                style={styles.close}
              >
                <Text style={styles.closeLabel} accessible={false}>
                  {choice ? '‹' : '✕'}
                </Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              {choice ? (
                <>
                  <Text style={styles.statusTitle}>
                    {choice === 'cloud'
                      ? 'Descartar as atividades pendentes?'
                      : 'Priorizar este aparelho?'}
                  </Text>
                  <Text style={styles.body}>
                    {choice === 'cloud'
                      ? `As ${status.pending} atividades ainda não sincronizadas deste aparelho serão descartadas, incluindo respostas de estudo e edições. Em seguida, vamos carregar a versão da nuvem. Esta ação não pode ser desfeita.`
                      : status.conflict?.kind === 'session'
                        ? 'A sessão de estudo ativa na nuvem será encerrada para receber a sessão deste aparelho. As respostas já sincronizadas serão preservadas. As outras atividades pendentes continuarão na fila.'
                        : 'A versão deste card na nuvem será substituída pelas alterações deste aparelho. As outras atividades pendentes continuarão na fila.'}
                  </Text>
                  {status.offlineMode && (
                    <Text style={styles.body}>
                      Ao confirmar, vamos resolver a pendência, sincronizar e
                      desligar o modo offline.
                    </Text>
                  )}
                  {!status.conflict && (
                    <Notice>
                      A pendência já foi resolvida. Volte aos detalhes para
                      conferir.
                    </Notice>
                  )}
                  {!status.online && (
                    <Notice>Conecte-se à internet antes de confirmar.</Notice>
                  )}
                  {manualError && <Notice error>{manualError}</Notice>}
                  <Action
                    label={confirmLabel}
                    busy={work === 'resolve'}
                    disabled={
                      !status.ready ||
                      !status.online ||
                      busy ||
                      !status.conflict ||
                      (choice === 'device' && !status.conflict.canForce)
                    }
                    onPress={() => void resolve()}
                  />
                  <Action
                    secondary
                    label="Cancelar e manter pendências"
                    disabled={work === 'resolve'}
                    onPress={() => setChoice(null)}
                  />
                </>
              ) : (
                <>
                  <View style={styles.stateRow}>
                    <View
                      style={[
                        styles.indicator,
                        { backgroundColor: indicator.background },
                      ]}
                    >
                      <Text
                        accessible={false}
                        allowFontScaling={false}
                        style={[styles.symbol, { color: indicator.foreground }]}
                      >
                        {indicator.symbol}
                      </Text>
                    </View>
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.statusTitle}
                    >
                      {stateLabel}
                    </Text>
                  </View>
                  <View style={styles.facts}>
                    <Text style={styles.factLabel}>Última sincronização</Text>
                    <Text style={styles.body}>
                      {status.lastSyncedAt === null
                        ? 'Ainda não concluída'
                        : new Date(status.lastSyncedAt).toLocaleString(
                            'pt-BR',
                            {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            },
                          )}
                    </Text>
                    <Text style={styles.factLabel}>Neste aparelho</Text>
                    <Text style={styles.body}>{pendingLabel}</Text>
                  </View>
                  <Text style={styles.body}>
                    {status.offlineMode
                      ? 'O modo offline continua ligado até você escolher voltar online. Suas atividades ficam salvas neste aparelho.'
                      : !status.online
                        ? 'Sem conexão no momento. Suas atividades salvas serão enviadas quando a conexão voltar.'
                        : status.pending > 0
                          ? 'Suas atividades estão salvas neste aparelho e aguardam envio.'
                          : synced
                            ? 'Todas as atividades deste aparelho foram sincronizadas. Puxe a lista para baixo para atualizar os catálogos.'
                            : 'Estamos preparando e atualizando o conteúdo deste aparelho.'}
                  </Text>
                  {status.conflict ? (
                    <>
                      <Notice>{status.conflict.message}</Notice>
                      {manualError && <Notice error>{manualError}</Notice>}
                      {status.offlineMode && (
                        <Text style={styles.body}>
                          Para voltar online, escolha como resolver esta
                          pendência. Você poderá confirmar ou cancelar antes de
                          alterar qualquer dado.
                        </Text>
                      )}
                      {!status.online && (
                        <Notice>
                          Conecte-se à internet para resolver esta pendência.
                        </Notice>
                      )}
                      {status.conflict.canForce && (
                        <Action
                          label="Usar alterações deste aparelho"
                          disabled={!status.ready || !status.online || busy}
                          onPress={() => {
                            setFailure(null);
                            setChoice('device');
                          }}
                        />
                      )}
                      <Action
                        secondary
                        label="Usar versão da nuvem"
                        disabled={!status.ready || !status.online || busy}
                        onPress={() => {
                          setFailure(null);
                          setChoice('cloud');
                        }}
                      />
                    </>
                  ) : (
                    <>
                      {error && <Notice error>{error}</Notice>}
                      <Action
                        label={
                          status.offlineMode
                            ? 'Sincronizar e voltar online'
                            : status.pending > 0
                              ? 'Sincronizar agora'
                              : 'Atualizar agora'
                        }
                        busy={work === 'refresh'}
                        disabled={!status.ready || !status.online || busy}
                        onPress={() => void refresh()}
                      />
                      {status.offlineMode && !status.online && (
                        <Text style={styles.note}>
                          Conecte-se à internet para sincronizar e voltar
                          online.
                        </Text>
                      )}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  indicator: {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: palette.scrim,
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
    gap: 12,
    paddingLeft: 22,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: palette.ink },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { fontSize: 21, color: palette.muted },
  content: { padding: 22, gap: 18 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusTitle: {
    flexShrink: 1,
    color: palette.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  facts: {
    backgroundColor: palette.stoneSoft,
    borderRadius: 16,
    padding: 16,
    gap: 7,
  },
  factLabel: { color: palette.stoneDeep, fontSize: 12, fontWeight: '700' },
  body: { color: palette.ink, fontSize: 14, lineHeight: 22 },
  note: { color: palette.muted, fontSize: 13, lineHeight: 20 },
});
