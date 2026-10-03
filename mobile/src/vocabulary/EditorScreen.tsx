import { useState } from 'react';
import { useMutation, useQuery } from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { jlptLevels } from '../alphabet/form';
import {
  Action,
  Choice,
  Field,
  Loading,
  Notice,
  Panel,
  ui,
  useCommand,
} from '../alphabet/ui';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  patchFromDraft,
  suggestedFaces,
  type VocabularyDraft,
} from './form';
import { VocabularyPreview } from './ui';

export function VocabularyEditorScreen({
  cardId,
  onSaved,
  onCancel,
}: {
  cardId?: Id<'vocabularyCards'>;
  onSaved: (id: Id<'vocabularyCards'>) => void;
  onCancel: () => void;
}) {
  const card = useQuery(api.vocabulary.get, cardId ? { id: cardId } : 'skip');
  if (cardId && card === undefined)
    return <Loading label="Abrindo o vocabulário…" />;
  if (cardId && !card)
    return <Notice error>Este card não está disponível.</Notice>;
  return (
    <VocabularyEditor
      key={cardId ?? 'new'}
      card={card ?? undefined}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function VocabularyEditor({
  card,
  onSaved,
  onCancel,
}: {
  card?: Doc<'vocabularyCards'>;
  onSaved: (id: Id<'vocabularyCards'>) => void;
  onCancel: () => void;
}) {
  // Keep the editing baseline stable when live queries receive remote changes.
  const [initialCard] = useState(card);
  const [draft, setDraft] = useState(() =>
    initialCard ? draftFromCard(initialCard) : emptyDraft(),
  );
  const create = useMutation(api.vocabulary.create);
  const update = useMutation(api.vocabulary.update);
  const command = useCommand();
  const preview = suggestedFaces(draft, initialCard);
  function change<K extends keyof VocabularyDraft>(
    key: K,
    value: VocabularyDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <Panel
      title={card ? 'Editar vocabulário' : 'Novo vocabulário'}
      detail="Palavras e expressões que você quer levar para o seu japonês."
    >
      {card && (
        <Text style={ui.note}>
          Suas respostas e o histórico continuam vinculados a este card após
          editar.
        </Text>
      )}
      <Field
        label="Palavra ou expressão"
        value={draft.expression}
        placeholder="おはようございます"
        maxLength={300}
        editable={!command.busy}
        onChangeText={(value) => change('expression', value)}
      />
      <Choice
        multiple
        label="Não informar leitura"
        selected={draft.readingOmitted}
        disabled={command.busy}
        onPress={() => change('readingOmitted', !draft.readingOmitted)}
      />
      {!draft.readingOmitted && (
        <Field
          label="Leitura em hiragana ou katakana"
          value={draft.reading}
          placeholder="おはようございます"
          hint="Informe a leitura em kana ou marque a opção acima para não incluí-la."
          maxLength={300}
          editable={!command.busy}
          onChangeText={(value) => change('reading', value)}
        />
      )}
      <Field
        label="Traduções em português"
        value={draft.portuguese}
        placeholder="bom dia"
        hint="Preencha português, inglês ou ambos. Separe traduções com ponto e vírgula."
        multiline
        maxLength={6000}
        editable={!command.busy}
        onChangeText={(value) => change('portuguese', value)}
      />
      <Field
        label="Traduções em inglês"
        value={draft.english}
        placeholder="good morning"
        multiline
        maxLength={6000}
        editable={!command.busy}
        onChangeText={(value) => change('english', value)}
      />
      <View style={ui.field}>
        <Text style={ui.label}>Níveis JLPT</Text>
        <Text style={ui.note}>
          Selecione os níveis deste vocabulário. Marcar N5 não inclui os outros
          níveis.
        </Text>
        <View style={ui.row}>
          {jlptLevels.map((level) => (
            <Choice
              key={level}
              multiple
              label={level}
              selected={draft.levels.includes(level)}
              disabled={command.busy}
              onPress={() =>
                change(
                  'levels',
                  draft.levels.includes(level)
                    ? draft.levels.filter((value) => value !== level)
                    : [...draft.levels, level],
                )
              }
            />
          ))}
        </View>
      </View>
      <Text accessibilityRole="header" style={ui.subtitle}>
        Como vai aparecer no estudo
      </Text>
      <Text style={ui.note}>
        A palavra fica na frente. O verso reúne a leitura, quando informada, as
        traduções e os exemplos.
      </Text>
      <Text accessibilityRole="header" style={ui.subtitle}>
        Exemplos (opcional)
      </Text>
      {draft.examples.map((example, index) => (
        <View key={index} style={ui.inset}>
          {(['text', 'reading', 'meaning'] as const).map((key) => (
            <Field
              key={key}
              label={`${key === 'text' ? 'Exemplo' : key === 'reading' ? 'Leitura do exemplo' : 'Tradução do exemplo'} ${index + 1}${key !== 'text' ? ' (opcional)' : ''}`}
              value={example[key]}
              maxLength={1000}
              editable={!command.busy}
              multiline={key === 'text'}
              onChangeText={(value) =>
                change(
                  'examples',
                  draft.examples.map((item, position) =>
                    position === index ? { ...item, [key]: value } : item,
                  ),
                )
              }
            />
          ))}
          <Action
            secondary
            label={`Remover exemplo ${index + 1}`}
            disabled={command.busy}
            onPress={() =>
              change(
                'examples',
                draft.examples.filter((_, position) => position !== index),
              )
            }
          />
        </View>
      ))}
      <Action
        secondary
        label="Adicionar exemplo"
        disabled={command.busy || draft.examples.length >= 20}
        onPress={() =>
          change('examples', [
            ...draft.examples,
            { text: '', reading: '', meaning: '' },
          ])
        }
      />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Prévia do card
      </Text>
      <VocabularyPreview front={preview.front} back={preview.back} />
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label={card ? 'Salvar alterações' : 'Criar vocabulário'}
        busy={command.busy}
        onPress={() => {
          void command.run(async () => {
            const saved = initialCard
              ? await update({
                  id: initialCard._id,
                  patch: patchFromDraft(draft, initialCard),
                })
              : await create({ card: contentFromDraft(draft) });
            onSaved(saved._id);
          });
        }}
      />
      <Action
        secondary
        label="Cancelar"
        disabled={command.busy}
        onPress={onCancel}
      />
    </Panel>
  );
}
