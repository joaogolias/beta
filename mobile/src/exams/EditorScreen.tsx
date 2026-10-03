import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { EXAM_LIMITS } from '../../../shared/examContent';
import { useMutation, useQuery } from '../offline/hooks';
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
  type ExamDraft,
} from './form';

export function ExamEditorScreen({
  cardId,
  initialLevel,
  onSaved,
  onCancel,
}: {
  cardId?: Id<'examCards'>;
  initialLevel?: JlptLevel | '';
  onSaved: (id: Id<'examCards'>) => void;
  onCancel: () => void;
}) {
  const card = useQuery(api.exams.get, cardId ? { id: cardId } : 'skip');
  if (cardId && card === undefined)
    return <Loading label="Abrindo a questão…" />;
  if (cardId && !card)
    return <Notice error>Esta questão não está disponível.</Notice>;
  return (
    <ExamEditor
      key={cardId ?? 'new'}
      card={card ?? undefined}
      initialLevel={initialLevel}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function ExamEditor({
  card,
  initialLevel,
  onSaved,
  onCancel,
}: {
  card?: Doc<'examCards'>;
  initialLevel?: JlptLevel | '';
  onSaved: (id: Id<'examCards'>) => void;
  onCancel: () => void;
}) {
  const [initialCard] = useState(card);
  const [draft, setDraft] = useState(() =>
    initialCard
      ? draftFromCard(initialCard)
      : { ...emptyDraft(), levels: initialLevel ? [initialLevel] : [] },
  );
  const create = useMutation(api.exams.create);
  const update = useMutation(api.exams.update);
  const command = useCommand();
  function change<K extends keyof ExamDraft>(key: K, value: ExamDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <Panel
      title={card ? 'Editar questão' : 'Nova questão'}
      detail="試験 · Shiken — um desafio de cada vez."
    >
      {card && (
        <Text style={ui.note}>
          O histórico mantém a versão da questão que você estudou antes de
          editar.
        </Text>
      )}
      <Field
        label="Título"
        value={draft.title}
        placeholder="Escolher a partícula correta"
        editable={!command.busy}
        onChangeText={(value) => change('title', value)}
      />
      <View style={ui.field}>
        <Text style={ui.label}>Níveis JLPT</Text>
        <Text style={ui.note}>
          Selecione pelo menos um nível para esta questão.
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
        O desafio
      </Text>
      <Field
        label="Enunciado"
        hint="A frente mostra somente o enunciado e as alternativas. Textos longos e quebras de linha são preservados."
        value={draft.prompt}
        placeholder="わたしは まいにち 学校（　）行きます。"
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('prompt', value)}
      />
      <Text style={ui.note}>
        Alternativas são opcionais. Você também pode criar uma pergunta aberta.
      </Text>
      {draft.alternatives.map((alternative, index) => (
        <View key={index} style={ui.inset}>
          <Field
            label={`Alternativa ${index + 1}`}
            value={alternative}
            multiline
            editable={!command.busy}
            onChangeText={(value) =>
              change(
                'alternatives',
                draft.alternatives.map((item, position) =>
                  position === index ? value : item,
                ),
              )
            }
          />
          <Action
            secondary
            label={`Remover alternativa ${index + 1}`}
            disabled={command.busy}
            onPress={() =>
              change(
                'alternatives',
                draft.alternatives.filter((_, position) => position !== index),
              )
            }
          />
        </View>
      ))}
      <Action
        secondary
        label="Adicionar alternativa"
        disabled={
          command.busy || draft.alternatives.length >= EXAM_LIMITS.alternatives
        }
        onPress={() => change('alternatives', [...draft.alternatives, ''])}
      />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Depois de revelar
      </Text>
      <Field
        label="Resposta"
        hint="Indique a resposta correta. Ela só aparece ao revelar o card durante o estudo."
        value={draft.answer}
        placeholder="に"
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('answer', value)}
      />
      <Field
        label="Explicação"
        value={draft.explanation}
        placeholder="A partícula に indica o destino com o verbo 行く。"
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('explanation', value)}
      />
      <Text accessibilityRole="header" style={ui.subtitle}>
        Origem da questão · opcional
      </Text>
      <Field
        label="Referência da prova"
        value={draft.examReference}
        placeholder="Caderno de exercícios · questão 12"
        editable={!command.busy}
        onChangeText={(value) => change('examReference', value)}
      />
      <Field
        label="Ano"
        value={draft.year}
        keyboardType="number-pad"
        placeholder="2026"
        editable={!command.busy}
        onChangeText={(value) => change('year', value)}
      />
      <Field
        label="Seção"
        value={draft.section}
        placeholder="Gramática · 文法"
        editable={!command.busy}
        onChangeText={(value) => change('section', value)}
      />
      <Field
        label="Fonte ou observações de origem"
        value={draft.source}
        placeholder="Link ou nome do material"
        multiline
        editable={!command.busy}
        onChangeText={(value) => change('source', value)}
      />
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label={card ? 'Salvar alterações' : 'Criar questão'}
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
