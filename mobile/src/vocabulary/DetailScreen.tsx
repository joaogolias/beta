import { useMutation, useQuery } from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { History, Performance } from '../alphabet/DetailScreen';
import { Action, Loading, Notice, Panel, ui, useCommand } from '../alphabet/ui';
import { VocabularyPreview } from './ui';

export function VocabularyDetailScreen({
  cardId,
  onEdit,
}: {
  cardId: Id<'vocabularyCards'>;
  onEdit: () => void;
}) {
  const card = useQuery(api.vocabulary.get, { id: cardId });
  const stats = useQuery(api.study.progress, { cardId });
  const archive = useMutation(api.vocabulary.archive);
  const restore = useMutation(api.vocabulary.restore);
  const command = useCommand();
  if (card === undefined) return <Loading label="Abrindo o vocabulário…" />;
  if (!card)
    return (
      <Notice error>Este card não está disponível na sua biblioteca.</Notice>
    );
  return (
    <Panel title={card.expression} detail={card.reading || 'Vocabulário'}>
      <Text style={ui.note}>
        {card.classifications
          .filter((item) => item.scheme === 'jlpt')
          .map((item) => item.level)
          .join(' · ')}{' '}
        · Japonês · Vocabulário
      </Text>
      {card.archived && (
        <Notice>
          Card arquivado. Ele continua no histórico e fica fora das próximas
          sessões.
        </Notice>
      )}
      {card.translations.pt?.length ? (
        <View style={ui.field}>
          <Text style={ui.label}>Português</Text>
          <Text selectable style={ui.body}>
            {card.translations.pt.join('; ')}
          </Text>
        </View>
      ) : null}
      {card.translations.en?.length ? (
        <View style={ui.field}>
          <Text style={ui.label}>Inglês</Text>
          <Text selectable style={ui.body}>
            {card.translations.en.join('; ')}
          </Text>
        </View>
      ) : null}
      <VocabularyPreview front={card.front} back={card.back} />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Exemplos
      </Text>
      {card.examples.length ? (
        card.examples.map((example, index) => (
          <View key={index} style={ui.inset}>
            <Text selectable style={ui.subtitle}>
              {example.text}
            </Text>
            {example.reading && (
              <Text selectable style={ui.body}>
                {example.reading}
              </Text>
            )}
            {example.meaning && (
              <Text selectable style={ui.body}>
                {example.meaning}
              </Text>
            )}
          </View>
        ))
      ) : (
        <Text style={ui.note}>Nenhum exemplo cadastrado.</Text>
      )}
      <Action
        label="Editar vocabulário"
        onPress={onEdit}
        disabled={command.busy}
      />
      <Action
        secondary
        label={card.archived ? 'Restaurar vocabulário' : 'Arquivar vocabulário'}
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
