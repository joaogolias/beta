import { useState } from 'react';
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
  useOfflineStatus,
} from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { kanjiDataFromCard, rates } from './form';
import { GrammarContentView } from '../grammar/ui';
import { ExamContentView } from '../exams/ui';
import {
  Action,
  KanjiPreview,
  Loading,
  Notice,
  Panel,
  ui,
  useCommand,
} from './ui';

export const ratingLabels = {
  correct: 'Acertei',
  partial: 'Acertei parcialmente',
  incorrect: 'Errei',
} as const;

export function Performance({
  stats,
}: {
  stats: {
    correct: number;
    partial: number;
    incorrect: number;
    attempts: number;
  } | null;
}) {
  const percentages = rates(stats);
  if (!stats || !percentages)
    return (
      <Notice>
        Ainda sem respostas. Pratique este card para começar seu histórico.
      </Notice>
    );
  return (
    <View style={ui.inset}>
      <Text style={ui.body}>
        {stats.attempts} respostas · {stats.correct} acertos · {stats.partial}{' '}
        parciais · {stats.incorrect} erros
      </Text>
      <Text style={ui.label}>{percentages.full}% de acertos completos</Text>
      <Text style={ui.body}>{percentages.weighted}% de aproveitamento</Text>
      <Text style={ui.note}>
        No aproveitamento, cada resposta parcial vale meio acerto.
      </Text>
    </View>
  );
}

export function DetailScreen({
  cardId,
  onEdit,
}: {
  cardId: Id<'alphabetCards'>;
  onEdit: () => void;
}) {
  const card = useQuery(api.alphabet.get, { id: cardId });
  const stats = useQuery(api.study.progress, { cardId });
  const archive = useMutation(api.alphabet.archive);
  const restore = useMutation(api.alphabet.restore);
  const command = useCommand();
  if (card === undefined) return <Loading label="Abrindo o kanji…" />;
  if (!card)
    return (
      <Notice error>Este card não está disponível na sua biblioteca.</Notice>
    );
  const kanji = kanjiDataFromCard(card);
  return (
    <Panel title={card.symbol} detail={card.meanings.join(' · ')}>
      <Text style={ui.note}>
        {card.classifications
          .filter((item) => item.scheme === 'jlpt')
          .map((item) => item.level)
          .join(' · ')}{' '}
        · Japonês · Kanji
      </Text>
      {card.archived && (
        <Notice>
          Card arquivado. Ele continua no seu histórico e fica fora das próximas
          sessões.
        </Notice>
      )}
      {kanji && <KanjiPreview card={kanji} />}
      <Text accessibilityRole="header" style={ui.subtitle}>
        Exemplos
      </Text>
      {card.examples.length ? (
        card.examples.map((example, index) => (
          <View key={index} style={ui.inset}>
            <Text style={ui.subtitle}>{example.text}</Text>
            {example.reading && <Text style={ui.body}>{example.reading}</Text>}
            {example.meaning && <Text style={ui.body}>{example.meaning}</Text>}
          </View>
        ))
      ) : (
        <Text style={ui.note}>Nenhum exemplo cadastrado.</Text>
      )}
      {card.details.kind !== 'kanji' && (
        <>
          <Detail label="Frente do card" value={card.front} />
          <Detail label="Verso do card" value={card.back} />
        </>
      )}
      <Action label="Editar kanji" onPress={onEdit} disabled={command.busy} />
      <Action
        secondary
        label={card.archived ? 'Restaurar kanji' : 'Arquivar kanji'}
        busy={command.busy}
        onPress={() => {
          void command.run(async () => {
            await (card.archived ? restore : archive)({ id: card._id });
          });
        }}
      />
      {command.error && <Notice error>{command.error}</Notice>}
      <View style={ui.divider} />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Seu desempenho
      </Text>
      {stats === undefined ? <Loading /> : <Performance stats={stats} />}
      {stats && (
        <Text style={ui.note}>
          Última prática:{' '}
          {new Date(stats.lastReviewedAt).toLocaleString('pt-BR')}
        </Text>
      )}
      <History cardId={cardId} />
    </Panel>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <Text selectable style={ui.body}>
        {value}
      </Text>
    </View>
  );
}

export function History({
  cardId,
}: {
  cardId:
    | Id<'alphabetCards'>
    | Id<'vocabularyCards'>
    | Id<'grammarCards'>
    | Id<'examCards'>;
}) {
  const sync = useOfflineStatus();
  const { results, status, loadMore } = usePaginatedQuery(
    api.study.history,
    { cardId },
    { initialNumItems: 10 },
  );
  return (
    <View style={ui.stack}>
      <Text accessibilityRole="header" style={ui.subtitle}>
        Histórico de respostas
      </Text>
      {(!sync.online || sync.pending > 0) && (
        <Text style={ui.note}>
          Mostrando as respostas recentes salvas neste aparelho. O histórico
          completo fica disponível após sincronizar.
        </Text>
      )}
      {status === 'LoadingFirstPage' ? (
        <Loading />
      ) : results.length === 0 ? (
        <Text style={ui.note}>Nenhuma resposta registrada.</Text>
      ) : (
        results.map((attempt) => (
          <HistoryEntry key={attempt._id} attempt={attempt} />
        ))
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <Action
          secondary
          label="Carregar respostas anteriores"
          busy={status === 'LoadingMore'}
          onPress={() => loadMore(10)}
        />
      )}
    </View>
  );
}

function HistoryEntry({ attempt }: { attempt: Doc<'studyAttempts'> }) {
  const [expanded, setExpanded] = useState(false);
  const kanji =
    'details' in attempt.snapshot ? kanjiDataFromCard(attempt.snapshot) : null;
  return (
    <View style={ui.inset}>
      <Text style={ui.label}>{ratingLabels[attempt.rating]}</Text>
      <Text style={ui.note}>
        {new Date(attempt.reviewedAt).toLocaleString('pt-BR')} · versão{' '}
        {attempt.snapshot.contentVersion}
      </Text>
      <Action
        secondary
        label={
          expanded ? 'Ocultar dados desta revisão' : 'Ver dados desta revisão'
        }
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <>
          <Text style={ui.label}>Dados desta revisão</Text>
          {'category' in attempt.snapshot &&
          attempt.snapshot.category === 'grammar' ? (
            <>
              <Detail
                label="Título ou estrutura"
                value={attempt.snapshot.title}
              />
              <GrammarContentView card={attempt.snapshot} />
            </>
          ) : 'category' in attempt.snapshot &&
            attempt.snapshot.category === 'exam' ? (
            <>
              <Detail label="Questão" value={attempt.snapshot.title} />
              <ExamContentView card={attempt.snapshot} />
            </>
          ) : kanji ? (
            <KanjiPreview card={kanji} />
          ) : (
            <>
              <Detail label="Frente" value={attempt.snapshot.front} />
              <Detail label="Verso" value={attempt.snapshot.back} />
            </>
          )}
        </>
      )}
    </View>
  );
}
