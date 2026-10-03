import { useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import { kindsFor, SKILL_LABELS, type JlptSkill } from '../../../shared/jlpt';
import { useMutation, useQuery } from '../offline/hooks';
import { jlptLevels } from '../alphabet/form';
import {
  Action,
  Choice,
  Field,
  Loading,
  Notice,
  ui,
  useCommand,
} from '../alphabet/ui';
import {
  changeLevel,
  emptyPaper,
  newQuestion,
  moveQuestion,
  paperFromDraft,
  patchFromDraft,
  removeChoice,
  type PaperDraft,
  type QuestionDraft,
} from './form';
import { styles } from './ui';

const skills: JlptSkill[] = ['vocabulary', 'grammar', 'reading', 'listening'];

export function JlptEditorScreen({
  paperId,
  onSaved,
  onCancel,
}: {
  paperId?: Id<'jlptPapers'>;
  onSaved: (id: Id<'jlptPapers'>) => void;
  onCancel: () => void;
}) {
  const paper = useQuery(api.jlpt.get, paperId ? { id: paperId } : 'skip');
  if (paperId && paper === undefined)
    return <Loading label="Abrindo o simulado…" />;
  if (paperId && !paper)
    return <Notice error>Este simulado não está disponível.</Notice>;
  return (
    <PaperEditor
      key={paperId ?? 'new'}
      paper={paper ?? undefined}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function PaperEditor({
  paper,
  onSaved,
  onCancel,
}: {
  paper?: Doc<'jlptPapers'>;
  onSaved: (id: Id<'jlptPapers'>) => void;
  onCancel: () => void;
}) {
  const [initialPaper] = useState(paper);
  const [draft, setDraft] = useState<PaperDraft>(() =>
    initialPaper
      ? {
          title: initialPaper.title,
          level: initialPaper.level,
          description: initialPaper.description,
          source: initialPaper.source,
          questions: initialPaper.questions.map((question) => ({
            ...question,
            choices: [...question.choices],
          })),
        }
      : emptyPaper(),
  );
  const [skill, setSkill] = useState<JlptSkill>('vocabulary');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const questions = draft.questions.filter(
    (question) => question.skill === skill,
  );
  const question =
    questions.find((item) => item.id === selectedId) ?? questions[0];
  const create = useMutation(api.jlpt.create),
    update = useMutation(api.jlpt.update);
  const command = useCommand();
  function changeQuestion(patch: Partial<QuestionDraft>) {
    if (question)
      setDraft((value) => ({
        ...value,
        questions: value.questions.map((item) =>
          item.id === question.id ? { ...item, ...patch } : item,
        ),
      }));
  }
  function addQuestion() {
    const added = newQuestion(draft.level, skill, randomUUID());
    setDraft((value) => ({ ...value, questions: [...value.questions, added] }));
    setSelectedId(added.id);
  }
  return (
    <View style={styles.screen}>
      <View style={styles.stack}>
        <Text style={styles.eyebrow}>SHIKEN / SEU SIMULADO</Text>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {paper ? 'Editar simulado' : 'Criar simulado'}
        </Text>
        <Text style={styles.intro}>
          Monte as quatro áreas. O tempo de cada bloco acompanha o nível
          escolhido.
        </Text>
      </View>
      <Field
        label="Nome do simulado"
        value={draft.title}
        placeholder="Minha preparação N5"
        editable={!command.busy}
        onChangeText={(title) => setDraft((value) => ({ ...value, title }))}
      />
      <View style={ui.field}>
        <Text style={ui.label}>Nível JLPT</Text>
        <View style={ui.row}>
          {jlptLevels.map((level) => (
            <Choice
              key={level}
              label={level}
              selected={draft.level === level}
              disabled={command.busy}
              onPress={() => setDraft((value) => changeLevel(value, level))}
            />
          ))}
        </View>
        <Text style={ui.note}>
          Ao mudar de nível, os tipos de questão são ajustados para os formatos
          disponíveis nesse nível.
        </Text>
      </View>
      <Field
        label="Descrição (opcional)"
        value={draft.description ?? ''}
        multiline
        editable={!command.busy}
        onChangeText={(description) =>
          setDraft((value) => ({ ...value, description }))
        }
      />
      <Field
        label="Fonte do material (opcional)"
        value={draft.source ?? ''}
        placeholder="Link, livro ou autoria própria"
        multiline
        editable={!command.busy}
        onChangeText={(source) => setDraft((value) => ({ ...value, source }))}
      />
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Questões por área
      </Text>
      <View style={ui.row}>
        {skills.map((area) => (
          <Choice
            key={area}
            label={`${SKILL_LABELS[area]} · ${draft.questions.filter((item) => item.skill === area).length}`}
            selected={area === skill}
            disabled={command.busy}
            onPress={() => {
              setSkill(area);
              setSelectedId(null);
            }}
          />
        ))}
      </View>
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {questions.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Editar questão ${index + 1} de ${SKILL_LABELS[skill]}`}
            accessibilityState={{ selected: item.id === question?.id }}
            onPress={() => setSelectedId(item.id)}
            style={[
              styles.questionNumber,
              item.id === question?.id && styles.currentNumber,
            ]}
          >
            <Text style={styles.numberText}>{index + 1}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!question ? (
        <Notice>
          Adicione a primeira questão de {SKILL_LABELS[skill].toLowerCase()}.
        </Notice>
      ) : (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {SKILL_LABELS[skill]} · questão {questions.indexOf(question) + 1}
          </Text>
          <Text style={ui.note}>Ordem dentro desta área</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Action
                secondary
                label="↑ Mover antes"
                disabled={command.busy || questions.indexOf(question) === 0}
                onPress={() =>
                  setDraft((value) => moveQuestion(value, question.id, -1))
                }
              />
            </View>
            <View style={styles.flex}>
              <Action
                secondary
                label="↓ Mover depois"
                disabled={
                  command.busy ||
                  questions.indexOf(question) === questions.length - 1
                }
                onPress={() =>
                  setDraft((value) => moveQuestion(value, question.id, 1))
                }
              />
            </View>
          </View>
          <Text style={ui.label}>Formato</Text>
          <View style={ui.row}>
            {kindsFor(draft.level, skill).map((kind) => (
              <Choice
                key={kind.value}
                label={kind.label}
                selected={question.kind === kind.value}
                disabled={command.busy}
                onPress={() => changeQuestion({ kind: kind.value })}
              />
            ))}
          </View>
          <Field
            label="Enunciado da questão"
            value={question.prompt}
            multiline
            editable={!command.busy}
            onChangeText={(prompt) => changeQuestion({ prompt })}
          />
          <Field
            label="Texto de apoio (opcional)"
            hint={
              skill === 'listening'
                ? 'Não coloque a transcrição do áudio aqui: este texto aparece durante a prova.'
                : 'Textos longos e quebras de linha serão preservados.'
            }
            value={question.passage ?? ''}
            multiline
            editable={!command.busy}
            onChangeText={(passage) => changeQuestion({ passage })}
          />
          {skill === 'listening' && (
            <Field
              label="URL do áudio"
              hint="Use um link HTTPS direto para um arquivo de áudio. É obrigatório nas questões de escuta."
              value={question.audioUrl ?? ''}
              editable={!command.busy}
              onChangeText={(audioUrl) => changeQuestion({ audioUrl })}
            />
          )}
          <Field
            label="URL da imagem (opcional)"
            hint="Link HTTPS direto para uma figura da questão."
            value={question.imageUrl ?? ''}
            editable={!command.busy}
            onChangeText={(imageUrl) => changeQuestion({ imageUrl })}
          />
          <Text style={ui.label}>Alternativas · selecione a correta</Text>
          {question.choices.map((choice, index) => (
            <View key={index} style={ui.inset}>
              <Field
                label={`Alternativa ${index + 1}`}
                value={choice}
                multiline
                editable={!command.busy}
                onChangeText={(text) =>
                  changeQuestion({
                    choices: question.choices.map((item, position) =>
                      position === index ? text : item,
                    ),
                  })
                }
              />
              <Choice
                label={`Alternativa ${index + 1} é a resposta correta`}
                selected={question.correctChoice === index}
                disabled={command.busy}
                onPress={() => changeQuestion({ correctChoice: index })}
              />
              {question.skill === 'listening' &&
                question.choices.length === 4 && (
                  <Action
                    secondary
                    label={`Remover alternativa ${index + 1}`}
                    disabled={command.busy}
                    onPress={() =>
                      changeQuestion(removeChoice(question, index))
                    }
                  />
                )}
            </View>
          ))}
          {question.choices.length === 3 && (
            <Action
              secondary
              label="Adicionar quarta alternativa"
              disabled={command.busy}
              onPress={() =>
                changeQuestion({ choices: [...question.choices, ''] })
              }
            />
          )}
          <Field
            label="Explicação do gabarito"
            hint="A explicação só aparece depois de entregar o simulado."
            value={question.explanation}
            multiline
            editable={!command.busy}
            onChangeText={(explanation) => changeQuestion({ explanation })}
          />
          <Action
            secondary
            label="Remover esta questão"
            disabled={command.busy}
            onPress={() => {
              setDraft((value) => ({
                ...value,
                questions: value.questions.filter(
                  (item) => item.id !== question.id,
                ),
              }));
              setSelectedId(null);
            }}
          />
        </View>
      )}
      <Action
        secondary
        label={`Adicionar questão de ${SKILL_LABELS[skill].toLowerCase()}`}
        disabled={command.busy || draft.questions.length >= 200}
        onPress={addQuestion}
      />
      <Text style={ui.note}>
        Você pode salvar a prova enquanto a prepara. Para iniciar, ela precisa
        de vocabulário, gramática, leitura e escuta, com áudio disponível.
      </Text>
      {command.error && <Notice error>{command.error}</Notice>}
      <Action
        label={paper ? 'Salvar simulado' : 'Criar simulado'}
        busy={command.busy}
        onPress={() => {
          void command.run(async () => {
            if (
              initialPaper &&
              paper?.contentVersion !== initialPaper.contentVersion
            )
              throw new Error(
                'Este simulado mudou desde que você abriu a edição. Seu rascunho foi mantido; reabra a versão mais recente antes de salvar.',
              );
            const saved = initialPaper
              ? await update({
                  id: initialPaper._id,
                  patch: patchFromDraft(draft),
                  expectedContentVersion: initialPaper.contentVersion,
                })
              : await create({ paper: paperFromDraft(draft) });
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
    </View>
  );
}
