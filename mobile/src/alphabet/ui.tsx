import { palette } from '../theme';
import { Component, useRef, useState, type ReactNode } from 'react';
import { useConvexConnectionState } from '../offline/hooks';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { errorMessage, jlptLevels, type JlptLevel } from './form';
import { formatKanjiFaces, kanjiBackSections } from '../../../shared/kanji';

export function KanjiPreview({
  card,
}: {
  card: Parameters<typeof formatKanjiFaces>[0];
}) {
  const faces = formatKanjiFaces(card);
  return (
    <View style={ui.stack}>
      <View style={kanjiStyles.front}>
        <Text style={kanjiStyles.faceLabel}>FRENTE</Text>
        <Text
          selectable
          accessibilityLabel={`Kanji: ${faces.front || 'a preencher'}`}
          style={kanjiStyles.symbol}
        >
          {faces.front || '—'}
        </Text>
      </View>
      <View style={kanjiStyles.back}>
        <Text style={kanjiStyles.faceLabel}>VERSO</Text>
        {kanjiBackSections(card).map((section) => (
          <View key={section.key} style={kanjiStyles.section}>
            <Text style={kanjiStyles.sectionLabel}>{section.label}</Text>
            <Text
              selectable
              style={
                section.key === 'meanings'
                  ? kanjiStyles.meanings
                  : kanjiStyles.value
              }
            >
              {section.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const kanjiStyles = StyleSheet.create({
  front: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    backgroundColor: palette.stoneSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  back: {
    gap: 18,
    padding: 20,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  faceLabel: {
    alignSelf: 'flex-start',
    color: palette.stoneDeep,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  symbol: {
    fontSize: 96,
    lineHeight: 132,
    color: palette.primary,
    paddingVertical: 14,
  },
  section: { gap: 5 },
  sectionLabel: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  meanings: {
    color: palette.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  value: { color: palette.ink, fontSize: 19, lineHeight: 29 },
});

export function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        secondary && ui.secondaryButton,
        (disabled || busy) && ui.disabled,
        pressed && ui.pressed,
      ]}
    >
      {busy && (
        <ActivityIndicator
          color={secondary ? palette.stoneDeep : palette.surface}
        />
      )}
      <Text style={[ui.buttonText, secondary && ui.secondaryText]}>
        {busy ? 'Aguarde…' : label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      {hint && <Text style={ui.note}>{hint}</Text>}
      <TextInput
        {...props}
        accessibilityLabel={label}
        autoCorrect={false}
        autoCapitalize="none"
        placeholderTextColor={palette.muted}
        style={[ui.input, props.multiline && ui.multiline]}
      />
    </View>
  );
}

export function Panel({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <View style={ui.panel}>
      <Text accessibilityRole="header" style={ui.title}>
        {title}
      </Text>
      {detail && <Text style={ui.body}>{detail}</Text>}
      {children}
    </View>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <Text
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[ui.notice, error && ui.error]}
    >
      {children}
    </Text>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={ui.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={palette.primary} />
      <Text style={ui.body}>{label}</Text>
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
  disabled = false,
  multiple = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  multiple?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        ui.choice,
        selected && ui.selectedChoice,
        disabled && ui.disabled,
      ]}
    >
      <Text style={[ui.choiceText, selected && ui.selectedChoiceText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function LevelPicker({
  value,
  onChange,
  emptyLabel = 'Todos',
  disabled,
}: {
  value: JlptLevel | '';
  onChange: (level: JlptLevel | '') => void;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>Nível JLPT</Text>
      <View
        style={ui.row}
        accessibilityRole="radiogroup"
        accessibilityLabel="Nível JLPT"
      >
        <Choice
          label={emptyLabel}
          selected={!value}
          onPress={() => onChange('')}
          disabled={disabled}
        />
        {jlptLevels.map((level) => (
          <Choice
            key={level}
            label={level}
            selected={value === level}
            onPress={() => onChange(level)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

export function useCommand() {
  const { isWebSocketConnected } = useConvexConnectionState();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    if (!isWebSocketConnected) {
      setError(
        'Aguarde a conexão ou ative o modo offline na engrenagem para estudar. Seus dados foram mantidos.',
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export class ScreenBoundary extends Component<
  { children: ReactNode },
  { error: string | null; attempt: number }
> {
  state = { error: null as string | null, attempt: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error: errorMessage(error) };
  }
  render() {
    if (this.state.error)
      return (
        <Panel title="Não foi possível carregar">
          <Notice error>{this.state.error}</Notice>
          <Action
            label="Tentar novamente"
            onPress={() =>
              this.setState((state) => ({
                error: null,
                attempt: state.attempt + 1,
              }))
            }
          />
        </Panel>
      );
    return (
      <View key={this.state.attempt} style={ui.stack}>
        {this.props.children}
      </View>
    );
  }
}

export const ui = StyleSheet.create({
  panel: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderRadius: 24,
    padding: 20,
    gap: 18,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
  },
  stack: { gap: 18 },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: palette.ink,
    lineHeight: 35,
  },
  subtitle: {
    fontSize: 19,
    fontWeight: '700',
    color: palette.ink,
    lineHeight: 27,
  },
  body: { fontSize: 16, lineHeight: 25, color: palette.muted },
  note: { fontSize: 13, lineHeight: 20, color: palette.muted },
  label: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: palette.ink,
  },
  character: {
    fontSize: 64,
    lineHeight: 84,
    color: palette.primary,
    textAlign: 'center',
  },
  field: { gap: 7 },
  input: {
    minHeight: 52,
    fontSize: 16,
    color: palette.ink,
    padding: 13,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 12,
  },
  multiline: { minHeight: 105, textAlignVertical: 'top' },
  button: {
    minHeight: 50,
    backgroundColor: palette.primary,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: palette.stoneSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  secondaryText: { color: palette.stoneDeep },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 48,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: 'center',
  },
  selectedChoice: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  choiceText: { color: palette.muted, fontWeight: '600' },
  selectedChoiceText: { color: palette.primaryDeep },
  notice: {
    color: palette.stoneDeep,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: palette.stoneSoft,
    padding: 12,
    borderRadius: 12,
  },
  error: { color: palette.error, backgroundColor: palette.errorSoft },
  loading: { gap: 10, padding: 20, alignItems: 'center' },
  inset: {
    gap: 10,
    backgroundColor: palette.background,
    borderRadius: 14,
    padding: 16,
  },
  divider: { height: 1, backgroundColor: palette.line },
});
