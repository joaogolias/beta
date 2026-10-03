import { useState } from 'react';
import { useMutation, useQuery } from '../offline/hooks';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { formatGrammarFaces } from '../../../shared/grammar';
import { jlptLevels, type JlptLevel } from '../alphabet/form';
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
  type GrammarDraft,
} from './form';

export function GrammarEditorScreen({
  cardId,
  initialLevel,
  onSaved,
  onCancel,
}: {
  cardId?: Id<'grammarCards'>;
  initialLevel?: JlptLevel | '';
  onSaved: (id: Id<'grammarCards'>) => void;
  onCancel: () => void;
}) {
  const card = useQuery(api.grammar.get, cardId ? { id: cardId } : 'skip');
  if (cardId && card === undefined)
    return <Loading label="Abrindo a gramática…" />;
  if (cardId && !card)
    return <Notice error>Este card não está disponível.</Notice>;
  return (
    <GrammarEditor
      key={cardId ?? 'new'}
      card={card ?? undefined}
      initialLevel={initialLevel}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function GrammarEditor({
  card,
  initialLevel,
  onSaved,
  onCancel,
}: {
  card?: Doc<'grammarCards'>;
  initialLevel?: JlptLevel | '';
  onSaved: (id: Id<'grammarCards'>) => void;
  onCancel: () => void;
}) {
  const [initialCard] = useState(card);
  const [draft, setDraft] = useState(() =>
    initialCard
      ? draftFromCard(initialCard)
      : { ...emptyDraft(), levels: initialLevel ? [initialLevel] : [] },
  );
  const create = useMutation(api.grammar.create);
  const update = useMutation(api.grammar.update);
  const command = useCommand();
  const preview = formatGrammarFaces(draft);
  function change<K extends keyof GrammarDraft>(
    key: K,
    value: GrammarDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <Panel
      title={card ? 'Editar gramática' : 'Nova gramática'}
      detail="文法 · Bunpou — suas estruturas, explicações e exemplos."
    >
      {card && (
        <Text style={ui.note}>
          Suas respostas e o histórico continuam vinculados a este card após
          editar.
        </Text>
      )}
      <Field
        label="Título ou estrutura"
        value={draft.title}
        placeholder="〜てもいいです"
        editable={!command.busy}
        onChangeText={(value) => change('title', value)}
      />
      <Field
        label="Explicação completa"
        hint="Obrigatória. No estudo, fica disponível ao tocar em Ver explicação completa."
        value={draft.explanation}
        placeholder="Quando e como usar esta estrutura…"
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('explanation', value)}
      />
      <Field
        label="Explicação curta (opcional)"
        hint="Um resumo para aparecer no verso junto dos exemplos. Sem resumo, a explicação completa continua disponível no botão."
        value={draft.shortExplanation}
        placeholder="Use para pedir ou dar permissão."
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('shortExplanation', value)}
      />
      <View style={ui.field}>
        <Text style={ui.label}>Níveis JLPT</Text>
        <Text style={ui.note}>
          Selecione pelo menos um nível. Cada nível é independente.
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
        Exemplos (opcional)
      </Text>
      <Text style={ui.note}>
        Os exemplos aparecem no verso. As quebras de linha serão preservadas.
      </Text>
      {draft.examples.map((example, index) => (
        <View key={index} style={ui.inset}>
          {(['text', 'reading', 'meaning'] as const).map((key) => (
            <Field
              key={key}
              label={`${key === 'text' ? 'Exemplo' : key === 'reading' ? 'Leitura do exemplo' : 'Tradução do exemplo'} ${index + 1}${key !== 'text' ? ' (opcional)' : ''}`}
              value={example[key]}
              multiline
              editable={!command.busy}
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
        disabled={command.busy || draft.examples.length >= 24}
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
      <View style={ui.inset}>
        <Text style={ui.label}>FRENTE</Text>
        <Text selectable style={ui.subtitle}>
          {preview.front || 'Seu título ou estrutura'}
        </Text>
      </View>
      <View style={ui.inset}>
        <Text style={ui.label}>VERSO</Text>
        <Text selectable style={ui.body}>
          {preview.back || 'Toque em Ver explicação completa durante o estudo.'}
        </Text>
      </View>
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label={card ? 'Salvar alterações' : 'Criar gramática'}
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
