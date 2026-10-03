import { Text, View } from 'react-native';
import { useMutation, useQuery } from '../offline/hooks';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { History, Performance } from '../alphabet/DetailScreen';
import { Action, Loading, Notice, Panel, ui, useCommand } from '../alphabet/ui';
import { ExamContentView } from './ui';

export function ExamDetailScreen({
  cardId,
  onEdit,
}: {
  cardId: Id<'examCards'>;
  onEdit: () => void;
}) {
  const card = useQuery(api.exams.get, { id: cardId });
  const stats = useQuery(api.study.progress, { cardId });
  const archive = useMutation(api.exams.archive);
  const restore = useMutation(api.exams.restore);
  const command = useCommand();
  if (card === undefined) return <Loading label="Abrindo a questão…" />;
  if (!card)
    return (
      <Notice error>Esta questão não está disponível na sua biblioteca.</Notice>
    );
  return (
    <Panel title={card.title} detail="試験 · Shiken">
      <Text style={ui.note}>
        {card.classifications
          .filter((item) => item.scheme === 'jlpt')
          .map((item) => item.level)
          .join(' · ')}{' '}
        · Japonês · Questão JLPT
      </Text>
      {card.archived && (
        <Notice>
          Questão arquivada. Ela permanece no histórico e fica fora das próximas
          sessões.
        </Notice>
      )}
      <ExamContentView card={card} />
      <Action label="Editar questão" onPress={onEdit} disabled={command.busy} />
      <Action
        secondary
        label={card.archived ? 'Restaurar questão' : 'Arquivar questão'}
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
