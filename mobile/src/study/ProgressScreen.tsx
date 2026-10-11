import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type {
  ProgressCategory,
  ProgressLevel,
  ProgressOverview,
} from '../../../shared/studyProgress';
import { useQuery } from '../offline/hooks';
import {
  Action,
  Choice,
  LevelPicker,
  Loading,
  Notice,
  ui,
} from '../alphabet/ui';
import { CategoryPicker } from '../vocabulary/CategoryPicker';
import { palette } from '../theme';
import { RockTexture } from '../brand/RockTexture';

const categories = {
  all: 'Todos os cards',
  alphabet: '漢字 · Kanji',
  vocabulary: '言葉 · Kotoba',
  grammar: '文法 · Bunpou',
  exam: '試験 · Shiken',
};

function percent(value: number | null) {
  return value === null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function ProgressScreen({
  onStudy,
  onLibrary,
}: {
  onStudy: () => void;
  onLibrary: () => void;
}) {
  const [category, setCategory] = useState<ProgressCategory>('all');
  const [level, setLevel] = useState<ProgressLevel | ''>('');
  const [archived, setArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const stats = useQuery(api.studyProgress.overview, {
    category,
    archived,
    ...(level ? { level } : {}),
  });
  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>SHINCHOKU / PROGRESSO</Text>
        <Text accessibilityRole="header" style={styles.title}>
          進捗
        </Text>
        <Text style={styles.intro}>
          Cada encontro{'\n'}deixa uma lembrança.
        </Text>
      </View>
      <View style={styles.filters}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajustar filtros do progresso"
          accessibilityState={{ expanded: showFilters }}
          onPress={() => setShowFilters((value) => !value)}
          style={styles.filterToggle}
        >
          <View style={styles.filterSummary}>
            <Text style={styles.filterCategory}>{categories[category]}</Text>
            <Text style={styles.filterDetail}>
              {level || 'Todos os níveis'} ·{' '}
              {archived ? 'Arquivados' : 'Ativos'}
            </Text>
          </View>
          <Text style={styles.filterAction}>
            {showFilters ? 'Fechar −' : 'Ajustar +'}
          </Text>
        </Pressable>
        {showFilters && (
          <View style={styles.filterControls}>
            <CategoryPicker value={category} onChange={setCategory} />
            <LevelPicker value={level} onChange={setLevel} />
            <View
              style={ui.row}
              accessibilityRole="radiogroup"
              accessibilityLabel="Situação dos cards"
            >
              <Choice
                label="Ativos"
                selected={!archived}
                onPress={() => setArchived(false)}
              />
              <Choice
                label="Arquivados"
                selected={archived}
                onPress={() => setArchived(true)}
              />
            </View>
          </View>
        )}
      </View>
      {stats === undefined ? (
        <Loading label="Carregando seu progresso…" />
      ) : (
        <ProgressSummary stats={stats} archived={archived} />
      )}
      <Text style={ui.note}>
        O histórico de cada card fica nos detalhes, em Kanji, Kotoba ou Bunpou.
        Os filtros usam a classificação atual dos cards. Seus simulados têm um
        histórico próprio em Shiken.
      </Text>
      <Action label="勉強 · Mais uma rodada" onPress={onStudy} />
      <Action secondary label="Explorar minha biblioteca" onPress={onLibrary} />
    </View>
  );
}

export function ProgressSummary({
  stats,
  archived,
}: {
  stats: ProgressOverview;
  archived: boolean;
}) {
  return (
    <>
      <View style={styles.hero}>
        <RockTexture tone="dark" />
        <Text style={styles.heroEyebrow}>
          {archived ? 'MEMÓRIAS GUARDADAS' : 'SEU JAPONÊS EM MOVIMENTO'}
        </Text>
        <View style={styles.heroNumbers}>
          <Text style={styles.heroNumber}>{stats.studiedCards}</Text>
          <Text style={styles.heroTotal}>/ {stats.totalCards}</Text>
        </View>
        <Text style={styles.heroDescription}>
          {stats.studiedCards === 1 ? 'card estudado' : 'cards estudados'}
        </Text>
        <View style={styles.heroDivider} />
        <Text style={styles.heroDescription}>
          {stats.neverStudiedCards}{' '}
          {stats.neverStudiedCards === 1
            ? 'ainda não estudado'
            : 'ainda não estudados'}
          {' · '}
          {stats.totalCards} {archived ? 'arquivados' : 'ativos'}
        </Text>
      </View>
      {stats.totalCards === 0 ? (
        <Notice>
          Nenhum card neste recorte. Ajuste os filtros para explorar seu
          progresso.
        </Notice>
      ) : stats.attempts === 0 ? (
        <Notice>
          Ainda sem respostas neste recorte. As taxas aparecem depois da
          primeira rodada.
        </Notice>
      ) : (
        <View style={styles.results}>
          <View style={styles.resultsHeading}>
            <Text style={styles.sectionLabel}>COMO FORAM SUAS RESPOSTAS</Text>
            <Text style={styles.attempts}>
              {stats.attempts} {stats.attempts === 1 ? 'resposta' : 'respostas'}
            </Text>
          </View>
          <Outcome
            label="Acertei"
            count={stats.correct}
            total={stats.attempts}
            tone={palette.primary}
          />
          <Outcome
            label="Acertei parcialmente"
            count={stats.partial}
            total={stats.attempts}
            tone={palette.tertiary}
          />
          <Outcome
            label="Errei"
            count={stats.incorrect}
            total={stats.attempts}
            tone={palette.error}
          />
          <View style={styles.rates}>
            <View style={styles.rate}>
              <Text style={styles.rateValue}>
                {percent(stats.integralAccuracy)}
              </Text>
              <Text style={styles.rateLabel}>Acertos completos</Text>
            </View>
            <View style={styles.rate}>
              <Text style={styles.rateValue}>
                {percent(stats.weightedAccuracy)}
              </Text>
              <Text style={styles.rateLabel}>Aproveitamento</Text>
            </View>
          </View>
          <Text style={ui.note}>
            Acertos completos contam só “acertei”. No aproveitamento, cada
            resposta parcial vale meio acerto.
          </Text>
        </View>
      )}
      {archived && (
        <Text style={ui.note}>
          Arquivar preserva as respostas. Estes cards ficam fora das próximas
          sessões até serem restaurados.
        </Text>
      )}
    </>
  );
}

function Outcome({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: string;
}) {
  const fraction = total ? count / total : 0;
  return (
    <View
      style={styles.outcome}
      accessible
      accessibilityLabel={`${label}: ${count} respostas, ${percent(fraction)}`}
    >
      <View style={styles.outcomeHeading}>
        <Text style={styles.outcomeLabel}>{label}</Text>
        <Text style={styles.outcomeCount}>
          {count} · {percent(fraction)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fraction * 100}%`, backgroundColor: tone },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    gap: 24,
    paddingBottom: 6,
  },
  heading: { gap: 8, paddingTop: 5 },
  eyebrow: {
    color: palette.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.9,
  },
  title: {
    color: palette.ink,
    fontSize: 49,
    fontWeight: '700',
    lineHeight: 63,
    letterSpacing: -1,
  },
  intro: { color: palette.muted, fontSize: 17, lineHeight: 25 },
  filters: {
    backgroundColor: palette.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
  },
  filterToggle: {
    padding: 18,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterSummary: { flex: 1, gap: 5 },
  filterCategory: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  filterDetail: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  filterAction: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  filterControls: { padding: 18, paddingTop: 0, gap: 16 },
  hero: {
    backgroundColor: palette.primary,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 28,
    gap: 9,
  },
  heroEyebrow: {
    color: palette.surface,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heroNumbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroNumber: {
    color: palette.surface,
    fontSize: 76,
    lineHeight: 89,
    letterSpacing: -4,
    fontWeight: '700',
  },
  heroTotal: { color: palette.surface, fontSize: 30, fontWeight: '500' },
  heroDescription: { color: palette.surface, fontSize: 14, lineHeight: 22 },
  heroDivider: {
    height: 1,
    backgroundColor: palette.onDarkLine,
    marginVertical: 10,
  },
  results: { gap: 20 },
  resultsHeading: { gap: 7 },
  sectionLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  attempts: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  outcome: { gap: 8 },
  outcomeHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  outcomeLabel: { color: palette.ink, fontSize: 13, fontWeight: '600' },
  outcomeCount: { color: palette.muted, fontSize: 13 },
  track: {
    height: 7,
    borderRadius: 8,
    backgroundColor: palette.line,
    overflow: 'hidden',
  },
  fill: { height: 7, borderRadius: 8 },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  rate: {
    flex: 1,
    minWidth: 120,
    padding: 18,
    borderRadius: 20,
    backgroundColor: palette.stoneSoft,
    gap: 7,
  },
  rateValue: { color: palette.primaryDeep, fontSize: 28, fontWeight: '700' },
  rateLabel: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});
