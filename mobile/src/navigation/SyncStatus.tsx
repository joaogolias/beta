import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Action, Notice } from '../alphabet/ui';
import { useOfflineStatus } from '../offline/hooks';
import { palette } from '../theme';

/** Pending writes remain durable until the owner chooses how to resolve a conflict. */
export function SyncStatus() {
  const status = useOfflineStatus();
  const [choice, setChoice] = useState<'device' | 'cloud' | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLabel = `${status.pending} ${status.pending === 1 ? 'atividade pendente' : 'atividades pendentes'}`;

  async function resolve() {
    if (!choice || resolving) return;
    setResolving(true);
    setError(null);
    try {
      await status.resolveConflict(choice);
      setChoice(null);
    } catch {
      setError(
        'Não foi possível resolver agora. Suas alterações continuam neste aparelho.',
      );
    } finally {
      setResolving(false);
    }
  }

  if (
    status.ready &&
    status.online &&
    !status.offlineMode &&
    !status.pending &&
    !status.syncing &&
    status.lastSyncedAt !== null &&
    !status.error &&
    !status.conflict
  ) {
    return (
      <Text accessibilityLiveRegion="polite" style={styles.saved}>
        ✓ Tudo sincronizado
      </Text>
    );
  }

  return (
    <View style={styles.panel}>
      <Text accessibilityLiveRegion="polite" style={styles.title}>
        {status.conflict
          ? 'Vamos conferir uma pendência'
          : !status.ready
            ? 'Preparando seu espaço'
            : status.offlineMode && !status.switchingMode
              ? 'Modo offline'
              : status.online && !status.lastSyncedAt && !status.error
                ? 'Baixando sua biblioteca…'
                : status.syncing
                  ? 'Sincronizando…'
                  : !status.online
                    ? 'Conexão interrompida'
                    : status.pending
                      ? pendingLabel
                      : 'A sincronização precisa de atenção'}
      </Text>
      <Text style={styles.detail}>
        {status.conflict
          ? status.conflict.message
          : !status.ready
            ? 'Estamos preparando os dados deste aparelho.'
            : status.offlineMode
              ? `${status.pending ? `${pendingLabel} neste aparelho. ` : ''}Benkyou e Shiken disponíveis com o conteúdo baixado. Use a engrenagem para sincronizar e voltar online.`
              : !status.online
                ? 'Ative o modo offline na engrenagem para continuar seus estudos. Cadastro e edição precisam de internet.'
                : status.pending
                  ? `${pendingLabel} ${status.pending === 1 ? 'salva' : 'salvas'} neste aparelho. Enviando seu progresso…`
                  : 'Preparando o conteúdo para seus próximos estudos.'}
      </Text>
      {status.error && !status.conflict && (
        <Notice error>{status.error}</Notice>
      )}
      {status.conflict && status.online ? (
        <View style={styles.actions}>
          {status.conflict.canForce && (
            <Action
              label="Usar alterações deste aparelho"
              onPress={() => setChoice('device')}
            />
          )}
          <Action
            secondary
            label="Usar versão da nuvem"
            onPress={() => setChoice('cloud')}
          />
        </View>
      ) : status.online &&
        !status.offlineMode &&
        !status.syncing &&
        (status.pending > 0 || status.error) ? (
        <Pressable
          accessibilityRole="button"
          onPress={status.retry}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Tentar sincronizar</Text>
        </Pressable>
      ) : null}
      <Modal
        visible={choice !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !resolving && setChoice(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.dialogTitle}>
              {choice === 'cloud'
                ? 'Descartar as alterações pendentes?'
                : 'Priorizar este aparelho?'}
            </Text>
            <Text style={styles.dialogCopy}>
              {choice === 'cloud'
                ? `As ${status.pending} alterações ainda não sincronizadas deste aparelho serão descartadas, incluindo respostas de estudo e edições. Em seguida, vamos carregar a versão da nuvem. Esta ação não pode ser desfeita.`
                : status.conflict?.kind === 'session'
                  ? 'A sessão de estudo ativa na nuvem será encerrada para receber a sessão deste aparelho. As respostas já sincronizadas serão preservadas. As outras alterações pendentes continuarão na fila.'
                  : 'A versão deste card na nuvem será substituída pelas alterações deste aparelho. As outras alterações pendentes continuarão na fila.'}
            </Text>
            {error && <Notice error>{error}</Notice>}
            <Action
              label={
                choice === 'cloud'
                  ? 'Descartar pendências e usar a nuvem'
                  : 'Confirmar alterações deste aparelho'
              }
              busy={resolving}
              onPress={() => void resolve()}
            />
            <Action
              secondary
              label="Continuar sem resolver agora"
              disabled={resolving}
              onPress={() => setChoice(null)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  saved: { color: palette.muted, fontSize: 11, textAlign: 'right' },
  panel: {
    padding: 14,
    gap: 7,
    borderRadius: 16,
    backgroundColor: palette.mountainSoft,
  },
  title: { color: palette.mountainDeep, fontSize: 14, fontWeight: '700' },
  detail: { color: palette.mountainDeep, fontSize: 12, lineHeight: 19 },
  actions: { gap: 8, marginTop: 5 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { color: palette.blue, fontSize: 13, fontWeight: '700' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 40, 0.55)',
    padding: 24,
    justifyContent: 'center',
  },
  dialog: {
    padding: 22,
    gap: 16,
    backgroundColor: palette.surface,
    borderRadius: 24,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
  },
  dialogTitle: {
    color: palette.ink,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
  },
  dialogCopy: { color: palette.muted, fontSize: 15, lineHeight: 23 },
});
