import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { IbexMascot } from '../brand/IbexMascot';
import { RockTexture } from '../brand/RockTexture';
import { palette } from '../theme';
import { useStreak } from './Provider';
import { isStreakNativeAvailable, requestStreakWidgetPin } from './native';

export function StreakCard() {
  const streak = useStreak();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [widgetMessage, setWidgetMessage] = useState<string | null>(null);
  if (!streak.ready && !streak.error) return null;
  return (
    <View style={styles.card}>
      <RockTexture />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${streak.currentStreak} ${streak.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'} com a Betinha. ${streak.error ? 'A sequência precisa de atenção. ' : ''}Ver sequência e lembretes`}
        onPress={() => setExpanded(!expanded)}
        style={styles.heading}
      >
        <IbexMascot size={104} mood={streak.mood} />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>SEQUÊNCIA COM A BETINHA</Text>
          <Text style={styles.count}>
            {streak.currentStreak}{' '}
            {streak.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
          </Text>
          <Text style={styles.caption}>
            {streak.restartedToday
              ? 'A sequência anterior acabou. Hoje começa uma nova.'
              : streak.mood === 'sad'
                ? 'Sua sequência acabou. Vamos recomeçar juntos.'
                : streak.mood === 'angry'
                  ? 'Ainda dá tempo de manter sua sequência hoje.'
                  : streak.activeToday
                    ? 'Hoje já conta. Continue no seu ritmo.'
                    : 'Um novo dia, mais um passo.'}
          </Text>
        </View>
        <Text style={[styles.expand, streak.error && styles.errorIndicator]}>
          {expanded ? '−' : streak.error ? '!' : '+'}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.details}>
          <Text style={styles.caption}>
            Seu recorde: {streak.bestStreak}{' '}
            {streak.bestStreak === 1 ? 'dia' : 'dias'}. Abra o app todos os dias
            para manter sua sequência. Cada dia conta uma vez, mesmo offline.
          </Text>
          {isStreakNativeAvailable() ? (
            <>
              <View style={styles.reminder}>
                <View style={styles.copy}>
                  <Text style={styles.label}>Lembrete diário</Text>
                  <Text style={styles.caption}>
                    Por volta das 19h, só se você ainda não abriu o app hoje.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Receber lembrete diário"
                  value={streak.remindersEnabled}
                  disabled={busy}
                  onValueChange={(enabled) => {
                    setBusy(true);
                    void streak
                      .setReminders(enabled)
                      .finally(() => setBusy(false));
                  }}
                  trackColor={{ true: palette.primary, false: palette.line }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.widget}
                onPress={() => {
                  void requestStreakWidgetPin()
                    .then((requested) =>
                      setWidgetMessage(
                        requested
                          ? 'Confirme no Android para adicionar o contador.'
                          : 'Na tela inicial do celular, toque e segure uma área vazia, escolha Widgets e procure beta.',
                      ),
                    )
                    .catch(() =>
                      setWidgetMessage(
                        'Na tela inicial do celular, abra Widgets e procure beta.',
                      ),
                    );
                }}
              >
                <Text style={styles.widgetLabel}>
                  Adicionar contador à tela inicial ↗
                </Text>
              </Pressable>
              {widgetMessage && (
                <Text accessibilityLiveRegion="polite" style={styles.caption}>
                  {widgetMessage}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.caption}>
              O contador da tela inicial e os lembretes ficam disponíveis no APK
              Android atualizado.
            </Text>
          )}
          {streak.pending > 0 && (
            <Text style={styles.caption}>
              Salvo neste aparelho. Sincroniza ao conectar.
            </Text>
          )}
          {streak.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {streak.error}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.secondarySoft,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  heading: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    minHeight: 72,
  },
  copy: { flex: 1, gap: 4 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: palette.secondaryDeep,
  },
  count: { fontSize: 23, fontWeight: '900', color: palette.ink },
  caption: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  expand: {
    color: palette.secondary,
    fontSize: 24,
    width: 18,
    textAlign: 'center',
  },
  errorIndicator: { color: palette.error },
  details: {
    gap: 14,
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingTop: 14,
  },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  widget: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: palette.surface,
    borderRadius: 12,
  },
  widgetLabel: { color: palette.stoneDeep, fontSize: 13, fontWeight: '700' },
  error: { color: palette.error, fontSize: 12, lineHeight: 18 },
});
