import { useState } from 'react';
import { useMutation, useQuery } from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import {
  contentFromDraft,
  draftFromCard,
  emptyDraft,
  jlptLevels,
  kanjiDataFromDraft,
  type KanjiDraft,
} from './form';
import {
  Action,
  Choice,
  Field,
  KanjiPreview,
  Loading,
  Notice,
  Panel,
  ui,
  useCommand,
} from './ui';

export function EditorScreen({
  cardId,
  onSaved,
  onCancel,
}: {
  cardId?: Id<'alphabetCards'>;
  onSaved: (id: Id<'alphabetCards'>) => void;
  onCancel: () => void;
}) {
  const card = useQuery(api.alphabet.get, cardId ? { id: cardId } : 'skip');
  if (cardId && card === undefined) return <Loading label="Abrindo o card…" />;
  if (cardId && !card)
    return <Notice error>Este card não está disponível.</Notice>;
  if (card && card.details.kind !== 'kanji')
    return (
      <Notice>
        Este tipo de alfabeto ainda não pode ser editado no aplicativo.
      </Notice>
    );
  return (
    <KanjiEditor
      key={cardId ?? 'new'}
      card={card ?? undefined}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function KanjiEditor({
  card,
  onSaved,
  onCancel,
}: {
  card?: Doc<'alphabetCards'>;
  onSaved: (id: Id<'alphabetCards'>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    card ? draftFromCard(card) : emptyDraft(),
  );
  const create = useMutation(api.alphabet.create);
  const update = useMutation(api.alphabet.update);
  const command = useCommand();
  function change<K extends keyof KanjiDraft>(key: K, value: KanjiDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  function save() {
    void command.run(async () => {
      const content = contentFromDraft(draft, card);
      const saved = card
        ? await update({ id: card._id, patch: content })
        : await create({ card: content });
      onSaved(saved._id);
    });
  }
  return (
    <Panel
      title={card ? 'Editar kanji' : 'Novo kanji'}
      detail="Cadastre o kanji e seus significados. A frente e o verso ficam prontos automaticamente."
    >
      {card && (
        <Text style={ui.note}>
          Suas respostas e seu histórico continuam vinculados a este card após
          editar.
        </Text>
      )}
      <Field
        label="Kanji"
        value={draft.symbol}
        onChangeText={(value) => change('symbol', value)}
        editable={!command.busy}
        placeholder="学"
        maxLength={16}
      />
      <Field
        label="Significados"
        hint="Separe vários significados com ponto e vírgula."
        value={draft.meanings}
        onChangeText={(value) => change('meanings', value)}
        editable={!command.busy}
        placeholder="estudo; aprender"
        multiline
      />
      <View style={ui.field}>
        <Text style={ui.label}>Níveis JLPT</Text>
        <Text style={ui.note}>
          Selecione um ou mais níveis em que este kanji aparece.
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
      <Field
        label="Kun’yomi (opcional)"
        hint="Leituras japonesas. Separe leituras com ponto e vírgula."
        value={draft.kunYomi}
        onChangeText={(value) => change('kunYomi', value)}
        editable={!command.busy}
        placeholder="まな.ぶ"
      />
      <Field
        label="On’yomi (opcional)"
        hint="Leituras de origem chinesa. Separe leituras com ponto e vírgula."
        value={draft.onYomi}
        onChangeText={(value) => change('onYomi', value)}
        editable={!command.busy}
        placeholder="ガク"
      />
      <Field
        label="Radicais (opcional)"
        hint="Separe vários radicais com ponto e vírgula."
        value={draft.radicals}
        onChangeText={(value) => change('radicals', value)}
        editable={!command.busy}
        placeholder="子"
      />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Exemplos
      </Text>
      {draft.examples.map((example, index) => (
        <View key={index} style={ui.inset}>
          <Field
            label={`Exemplo ${index + 1}`}
            value={example.text}
            editable={!command.busy}
            placeholder="学生"
            onChangeText={(text) =>
              change(
                'examples',
                draft.examples.map((item, position) =>
                  position === index ? { ...item, text } : item,
                ),
              )
            }
          />
          <Field
            label={`Leitura do exemplo ${index + 1} (opcional)`}
            value={example.reading}
            editable={!command.busy}
            placeholder="がくせい"
            onChangeText={(reading) =>
              change(
                'examples',
                draft.examples.map((item, position) =>
                  position === index ? { ...item, reading } : item,
                ),
              )
            }
          />
          <Field
            label={`Significado do exemplo ${index + 1} (opcional)`}
            value={example.meaning}
            editable={!command.busy}
            placeholder="estudante"
            onChangeText={(meaning) =>
              change(
                'examples',
                draft.examples.map((item, position) =>
                  position === index ? { ...item, meaning } : item,
                ),
              )
            }
          />
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
      <Text style={ui.note}>
        O kanji aparece na frente. Os significados, as leituras e os radicais
        formam o verso.
      </Text>
      <KanjiPreview card={kanjiDataFromDraft(draft)} />
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label={card ? 'Salvar alterações' : 'Criar kanji'}
        busy={command.busy}
        onPress={save}
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
