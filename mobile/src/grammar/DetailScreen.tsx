import { useMutation, useQuery } from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { History, Performance } from '../alphabet/DetailScreen';
import { Action, Loading, Notice, Panel, ui, useCommand } from '../alphabet/ui';
import { GrammarContentView } from './ui';

export function GrammarDetailScreen({
  cardId,
  onEdit,
}: {
  cardId: Id<'grammarCards'>;
  onEdit: () => void;
}) {
  const card = useQuery(api.grammar.get, { id: cardId });
  const stats = useQuery(api.study.progress, { cardId });
  const archive = useMutation(api.grammar.archive);
  const restore = useMutation(api.grammar.restore);
  const command = useCommand();
  if (card === undefined) return <Loading label="Abrindo a gramática…" />;
  if (!card)
    return (
      <Notice error>Este card não está disponível na sua biblioteca.</Notice>
    );
  return (
    <Panel title={card.title} detail="文法 · Bunpou">
      <Text style={ui.note}>
        {card.classifications
          .filter((item) => item.scheme === 'jlpt')
          .map((item) => item.level)
          .join(' · ')}{' '}
        · Japonês · Gramática
      </Text>
      {card.archived && (
        <Notice>
          Card arquivado. Ele continua no histórico e fica fora das próximas
          sessões.
        </Notice>
      )}
      <GrammarContentView card={card} />
      <Action
        label="Editar gramática"
        onPress={onEdit}
        disabled={command.busy}
      />
      <Action
        secondary
        label={card.archived ? 'Restaurar gramática' : 'Arquivar gramática'}
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
