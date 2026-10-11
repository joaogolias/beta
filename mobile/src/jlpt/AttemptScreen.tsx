import { AppModal } from '../environment/AppEnvironment';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import {
  blocksForLevel,
  JLPT_SKILLS,
  SKILL_LABELS,
  summarizeAttempt,
  type JlptQuestion,
  type JlptSkill,
} from '../../../shared/jlpt';
import { useMutation, useQuery } from '../offline/hooks';
import {
  Action,
  Choice,
  Loading,
  Notice,
  ui,
  useCommand,
} from '../alphabet/ui';
import { clockText } from './form';
import { styles } from './ui';
import { ListeningPlayer } from './ListeningPlayer';
import { CachedImage } from './CachedImage';

export function JlptAttemptScreen({
  attemptId,
  onHome,
  quest,
}: {
  attemptId: Id<'jlptAttempts'>;
  onHome: () => void;
  quest?: { title: string; onCompleted: () => void };
}) {
  const attempt = useQuery(api.jlpt.getAttempt, { id: attemptId });
  useEffect(() => {
    if (quest && attempt?.status === 'completed') quest.onCompleted();
  }, [quest, attempt?.status]);
  if (attempt === undefined) return <Loading label="Retomando seu simulado…" />;
  if (!attempt)
    return (
      <View style={ui.stack}>
        <Notice error>
          Esta tentativa não está disponível neste aparelho.
        </Notice>
        <Action
          label={quest ? 'Voltar às quests' : 'Voltar aos simulados'}
          onPress={onHome}
        />
      </View>
    );
  if (quest && attempt.status === 'completed')
    return <Loading label="Continuando sua quest…" />;
  return attempt.status === 'completed' ? (
    <AttemptResult attempt={attempt} onHome={onHome} />
  ) : (
    <ActiveAttempt
      attempt={attempt}
      onHome={onHome}
      questTitle={quest?.title}
    />
  );
}

function ActiveAttempt({
  attempt,
  onHome,
  questTitle,
}: {
  attempt: Doc<'jlptAttempts'>;
  onHome: () => void;
  questTitle?: string;
}) {
  const [now, setNow] = useState(Date.now);
  const [selection, setSelection] = useState<{
    block: number;
    id: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<'next' | 'finish' | null>(null);
  const answer = useMutation(api.jlpt.answer),
    advance = useMutation(api.jlpt.advance),
    finish = useMutation(api.jlpt.finish);
  const command = useCommand();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const blocks = blocksForLevel(attempt.snapshot.level),
    block = blocks[attempt.blockIndex];
  const questions = attempt.snapshot.questions.filter((question) =>
    block.skills.includes(question.skill),
  );
  const selected =
    (selection?.block === attempt.blockIndex
      ? questions.find((item) => item.id === selection.id)
      : null) ??
    questions.find(
      (item) =>
        attempt.answers.find((response) => response.questionId === item.id)
          ?.choice === null,
    ) ??
    questions[0];
  const index = questions.indexOf(selected);
  const response = attempt.answers.find(
    (item) => item.questionId === selected.id,
  );
  const expired = now >= attempt.blockDeadlineAt;
  const disabled = expired || command.busy;
  const unanswered = questions.filter(
    (question) =>
      attempt.answers.find((item) => item.questionId === question.id)?.choice ==
      null,
  ).length;
  const flagged = questions.filter(
    (question) =>
      attempt.answers.find((item) => item.questionId === question.id)?.flagged,
  ).length;
  const lastBlock = attempt.blockIndex === blocks.length - 1;
  const lastQuestion = index === questions.length - 1;
  function selectQuestion(question: JlptQuestion) {
    setSelection({ block: attempt.blockIndex, id: question.id });
  }
  function save(choice: number | null, marked: boolean) {
    selectQuestion(selected);
    void command.run(async () => {
      await answer({
        attemptId: attempt._id,
        expectedRevision: attempt.revision,
        questionId: selected.id,
        choice,
        flagged: marked,
      });
    });
  }
  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          questTitle
            ? 'Voltar às quests, mantendo o cronômetro'
            : 'Voltar aos simulados, mantendo o cronômetro'
        }
        onPress={onHome}
        style={styles.outlineButton}
      >
        <Text style={styles.buttonText}>
          {questTitle ? '‹ Quests' : '‹ Seus simulados'}
        </Text>
      </Pressable>
      {questTitle && (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {questTitle}
        </Text>
      )}
      <View
        style={styles.timer}
        accessibilityLabel={`${expired ? 'Tempo encerrado' : 'Tempo restante'}: ${clockText(attempt.blockDeadlineAt, now)}`}
      >
        <View style={styles.flex}>
          <Text style={styles.heroCopy}>
            {attempt.snapshot.level} · BLOCO {attempt.blockIndex + 1}/
            {blocks.length}
          </Text>
          <Text style={styles.white}>{block.title}</Text>
          <Text style={styles.timerCaption}>
            O tempo continua mesmo ao sair.
          </Text>
        </View>
        <Text style={styles.timerNumber}>
          {clockText(attempt.blockDeadlineAt, now)}
        </Text>
      </View>
      {expired && (
        <Notice>
          Tempo encerrado. Suas escolhas foram guardadas e este bloco não aceita
          mais alterações.{' '}
          {lastBlock
            ? 'Entregue para conferir o resultado.'
            : 'Comece o próximo bloco quando estiver pronto.'}
        </Notice>
      )}
      <Text style={styles.meta}>
        {questions.length - unanswered}/{questions.length} respondidas ·{' '}
        {flagged} para revisar · toque no número para navegar
      </Text>
      <View style={styles.row}>
        {questions.map((question, position) => {
          const saved = attempt.answers.find(
            (item) => item.questionId === question.id,
          );
          return (
            <Pressable
              key={question.id}
              accessibilityRole="button"
              accessibilityLabel={`Questão ${position + 1}, ${saved?.choice == null ? 'sem resposta' : 'respondida'}${saved?.flagged ? ', marcada para revisão' : ''}`}
              accessibilityState={{ selected: question.id === selected.id }}
              onPress={() => selectQuestion(question)}
              style={[
                styles.questionNumber,
                saved?.choice != null && styles.answeredNumber,
                selected.id === question.id && styles.currentNumber,
              ]}
            >
              <Text style={styles.numberText}>{position + 1}</Text>
              {saved?.flagged && <Text style={styles.flagText}>★</Text>}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.card} key={selected.id}>
        <View style={styles.row}>
          <Text style={styles.eyebrow}>{SKILL_LABELS[selected.skill]}</Text>
          <Text style={styles.meta}>
            QUESTÃO {index + 1}/{questions.length}
          </Text>
        </View>
        <QuestionContent question={selected} disabled={expired} />
        <View
          style={styles.stack}
          accessibilityRole="radiogroup"
          accessibilityLabel="Escolha sua resposta"
        >
          {selected.choices.map((choice, position) => (
            <Pressable
              key={position}
              accessibilityRole="radio"
              accessibilityLabel={`Alternativa ${position + 1}: ${choice}`}
              accessibilityState={{
                checked: response?.choice === position,
                disabled,
              }}
              disabled={disabled}
              onPress={() => save(position, response?.flagged ?? false)}
              style={[
                styles.option,
                response?.choice === position && styles.selectedOption,
                disabled && styles.dimmed,
              ]}
            >
              <Text style={styles.optionNumber}>{position + 1}</Text>
              <Text style={styles.optionText}>{choice}</Text>
            </Pressable>
          ))}
        </View>
        <Choice
          multiple
          label="Marcar para revisar neste bloco"
          selected={response?.flagged ?? false}
          disabled={disabled}
          onPress={() => save(response?.choice ?? null, !response?.flagged)}
        />
        {response?.choice != null && (
          <Action
            secondary
            label="Limpar minha resposta"
            disabled={disabled}
            onPress={() => save(null, response.flagged)}
          />
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Action
              secondary
              label="← Anterior"
              disabled={index === 0 || command.busy}
              onPress={() => selectQuestion(questions[index - 1])}
            />
          </View>
          <View style={styles.flex}>
            <Action
              secondary={!lastQuestion}
              label={
                lastQuestion
                  ? lastBlock
                    ? 'Finalizar prova'
                    : 'Próximo bloco →'
                  : 'Próxima →'
              }
              disabled={command.busy}
              onPress={() => {
                if (lastQuestion) setConfirm('next');
                else selectQuestion(questions[index + 1]);
              }}
            />
          </View>
        </View>
      </View>
      {command.error && <Notice error>{command.error}</Notice>}
      {!lastQuestion && (
        <Action
          secondary
          label={
            lastBlock
              ? 'Entregar simulado e ver resultado'
              : 'Avançar para o próximo bloco'
          }
          busy={command.busy}
          onPress={() => setConfirm('next')}
        />
      )}
      {!lastBlock && (
        <Action
          secondary
          label="Entregar o simulado agora"
          disabled={command.busy}
          onPress={() => setConfirm('finish')}
        />
      )}
      <Text style={ui.note}>
        Não há correção durante a prova. Suas respostas são salvas neste
        aparelho a cada escolha.
      </Text>
      <AppModal
        visible={confirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!command.busy) setConfirm(null);
        }}
      >
        <View style={styles.modal}>
          <ScrollView
            contentContainerStyle={styles.modalCard}
            accessibilityViewIsModal
          >
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {confirm === 'finish' || lastBlock
                ? 'Entregar seu simulado?'
                : 'Pronto para o próximo bloco?'}
            </Text>
            <Text style={ui.body}>
              {unanswered} questões sem resposta e {flagged} marcadas para
              revisão neste bloco.
            </Text>
            <Text style={ui.body}>
              {confirm === 'finish' || lastBlock
                ? 'A entrega encerra a tentativa. Questões sem resposta contam como não respondidas e não somam acertos.'
                : `O bloco atual será encerrado e você não poderá voltar a ele. O próximo bloco terá ${blocks[attempt.blockIndex + 1].minutes} minutos, contados a partir da confirmação.`}
            </Text>
            {command.error && <Notice error>{command.error}</Notice>}
            <Action
              label={
                confirm === 'finish' || lastBlock
                  ? 'Confirmar entrega'
                  : 'Encerrar este bloco e começar o próximo'
              }
              busy={command.busy}
              onPress={() => {
                void command.run(async () => {
                  if (confirm === 'finish')
                    await finish({
                      attemptId: attempt._id,
                      expectedRevision: attempt.revision,
                    });
                  else
                    await advance({
                      attemptId: attempt._id,
                      expectedRevision: attempt.revision,
                    });
                  setConfirm(null);
                  setSelection(null);
                });
              }}
            />
            <Action
              secondary
              label="Voltar ao bloco"
              disabled={command.busy}
              onPress={() => setConfirm(null)}
            />
          </ScrollView>
        </View>
      </AppModal>
    </View>
  );
}

function QuestionContent({
  question,
  disabled = false,
}: {
  question: JlptQuestion;
  disabled?: boolean;
}) {
  return (
    <View style={styles.stack}>
      {question.passage && (
        <View style={styles.passage}>
          <Text selectable style={styles.questionText}>
            {question.passage}
          </Text>
        </View>
      )}
      <Text selectable style={styles.questionText}>
        {question.prompt}
      </Text>
      {question.imageUrl && (
        <CachedImage
          url={question.imageUrl}
          style={styles.image}
          accessibilityLabel="Figura da questão"
        />
      )}
      {question.audioUrl && (
        <ListeningPlayer
          url={question.audioUrl}
          questionId={question.id}
          disabled={disabled}
        />
      )}
    </View>
  );
}

function AttemptResult({
  attempt,
  onHome,
}: {
  attempt: Doc<'jlptAttempts'>;
  onHome: () => void;
}) {
  const [skill, setSkill] = useState<JlptSkill | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const result = summarizeAttempt(attempt);
  if (!result) return null;
  const questions = attempt.snapshot.questions.filter(
    (question) => skill === 'all' || question.skill === skill,
  );
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>
        SIMULADO CONCLUÍDO · {attempt.snapshot.level}
      </Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {attempt.snapshot.title}
      </Text>
      <View style={styles.card}>
        <Text style={styles.meta}>SEUS ACERTOS</Text>
        <Text style={styles.score}>
          {result.correct}
          <Text style={styles.sectionTitle}>/{result.total}</Text>
        </Text>
        <Text style={styles.intro}>
          {result.percentage?.toLocaleString('pt-BR', {
            maximumFractionDigits: 1,
          })}
          % de acertos brutos
        </Text>
        <Text style={styles.meta}>
          {result.incorrect} incorretas · {result.unanswered} sem resposta
        </Text>
        <Text style={ui.note}>
          Este é o resultado do seu material de treino. Ele não corresponde à
          pontuação oficial de 0 a 180 e não determina aprovação no JLPT.
        </Text>
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Como foi cada área
      </Text>
      {result.bySkill.map((area) => (
        <View key={area.skill} style={styles.card}>
          <Text style={styles.cardTitle}>{SKILL_LABELS[area.skill]}</Text>
          <Text style={ui.body}>
            {area.correct}/{area.total} acertos ·{' '}
            {area.percentage === null
              ? 'sem questões'
              : `${area.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          </Text>
          <Text style={styles.meta}>
            {area.incorrect} incorretas · {area.unanswered} sem resposta
          </Text>
        </View>
      ))}
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Revisar o gabarito
      </Text>
      <View style={ui.row}>
        <Choice
          label="Todas as áreas"
          selected={skill === 'all'}
          onPress={() => setSkill('all')}
        />
        {JLPT_SKILLS.map((area) => (
          <Choice
            key={area}
            label={SKILL_LABELS[area]}
            selected={skill === area}
            onPress={() => setSkill(area)}
          />
        ))}
      </View>
      {questions.map((question) => {
        const saved = attempt.answers.find(
          (item) => item.questionId === question.id,
        );
        const correct = saved?.choice === question.correctChoice;
        const position = attempt.snapshot.questions.indexOf(question) + 1;
        return (
          <View key={question.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Revisar questão ${position}, ${saved?.choice == null ? 'sem resposta' : correct ? 'correta' : 'incorreta'}`}
              accessibilityState={{ expanded: expanded === question.id }}
              onPress={() =>
                setExpanded(expanded === question.id ? null : question.id)
              }
              style={styles.stack}
            >
              <Text style={styles.cardTitle}>
                {position}.{' '}
                {saved?.choice == null
                  ? 'Sem resposta'
                  : correct
                    ? '✓ Resposta correta'
                    : '× Resposta incorreta'}
              </Text>
              <Text style={styles.meta}>
                {SKILL_LABELS[question.skill]} ·{' '}
                {expanded === question.id
                  ? 'fechar revisão −'
                  : 'conferir explicação +'}
              </Text>
            </Pressable>
            {expanded === question.id && (
              <>
                <QuestionContent question={question} />
                {question.choices.map((choice, index) => (
                  <View
                    key={index}
                    style={[
                      styles.option,
                      index === question.correctChoice && styles.selectedOption,
                    ]}
                  >
                    <Text style={styles.optionNumber}>{index + 1}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.optionText}>{choice}</Text>
                      {index === question.correctChoice && (
                        <Text style={styles.buttonText}>✓ Gabarito</Text>
                      )}
                      {saved?.choice === index && (
                        <Text style={styles.meta}>Sua resposta</Text>
                      )}
                    </View>
                  </View>
                ))}
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  Por que esta é a resposta?
                </Text>
                <Text selectable style={ui.body}>
                  {question.explanation}
                </Text>
              </>
            )}
          </View>
        );
      })}
      <Text style={styles.meta}>
        Concluído em{' '}
        {new Date(attempt.completedAt ?? attempt.startedAt).toLocaleString(
          'pt-BR',
        )}{' '}
        · versão {attempt.snapshot.contentVersion}
      </Text>
      <Action label="Voltar aos meus simulados" onPress={onHome} />
    </View>
  );
}
