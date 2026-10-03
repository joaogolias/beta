import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../../backend/convex/_generated/api';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import {
  blocksForLevel,
  JLPT_LEVELS,
  JLPT_SKILLS,
  JLPT_STRUCTURE_SOURCE,
  SKILL_LABELS,
  summarizeAttempt,
  validateReady,
  type JlptLevel,
} from '../../../shared/jlpt';
import {
  useMutation,
  useOfflineStatus,
  usePaginatedQuery,
  useQuery,
} from '../offline/hooks';
import {
  Action,
  Choice,
  Field,
  Loading,
  Notice,
  ui,
  useCommand,
} from '../alphabet/ui';
import { errorMessage } from '../alphabet/form';
import { BlockPlan, styles } from './ui';
import { downloadMedia, getCachedMedia } from './media';
import { preparePaperMedia } from './mediaPolicy';

export function JlptHomeScreen({
  onCreate,
  onOpen,
  onAttempt,
}: {
  onCreate: () => void;
  onOpen: (id: Id<'jlptPapers'>) => void;
  onAttempt: (id: Id<'jlptAttempts'>) => void;
}) {
  const [level, setLevel] = useState<JlptLevel>('N5');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const papers = usePaginatedQuery(
    api.jlpt.search,
    { level, archived, ...(query.trim() ? { query: query.trim() } : {}) },
    { initialNumItems: 12 },
  );
  const history = usePaginatedQuery(
    api.jlpt.history,
    {},
    { initialNumItems: 6 },
  );
  const active = useQuery(api.jlpt.active, {});
  return (
    <View style={styles.screen}>
      <View style={styles.stack}>
        <Text style={styles.eyebrow}>SHIKEN / SIMULADOS JLPT</Text>
        <Text accessibilityRole="header" style={styles.title}>
          試験
        </Text>
        <Text style={styles.intro}>
          Entre no ritmo da prova.{'\n'}Blocos com tempo, alternativas e um
          resultado para aprender.
        </Text>
      </View>
      {active && (
        <View style={styles.hero}>
          <Text style={styles.heroCopy}>SEU SIMULADO ESTÁ EM ANDAMENTO</Text>
          <Text style={styles.heroTitle}>{active.snapshot.title}</Text>
          <Text style={styles.heroCopy}>
            O cronômetro continua contando mesmo fora desta tela.
          </Text>
          <Action
            label="Continuar simulado"
            onPress={() => onAttempt(active._id)}
          />
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="Escolher nível do simulado"
      >
        {JLPT_LEVELS.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityLabel={`Simulados ${item}`}
            accessibilityState={{ checked: item === level }}
            onPress={() => setLevel(item)}
            style={[styles.levelTile, item === level && styles.activeLevel]}
          >
            <Text style={[styles.levelLabel, item === level && styles.white]}>
              {item}
            </Text>
            <Text style={[styles.levelCaption, item === level && styles.white]}>
              {blocksForLevel(item).reduce(
                (total, block) => total + block.minutes,
                0,
              )}{' '}
              min · {blocksForLevel(item).length} blocos
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Seus simulados · {level}
        </Text>
      </View>
      <Field
        label="Buscar simulado"
        placeholder="Nome ou descrição"
        value={query}
        onChangeText={setQuery}
      />
      <View style={ui.row}>
        <Choice
          label="Ativos"
          selected={!archived}
          onPress={() => setArchived(false)}
        />
        <Choice
          label="Arquivados"
          selected={archived}
          onPress={() => setArchived(true)}
        />
      </View>
      {papers.status === 'LoadingFirstPage' ? (
        <Loading />
      ) : papers.results.length ? (
        papers.results.map((paper) => (
          <Pressable
            key={paper._id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir simulado ${paper.title}`}
            onPress={() => onOpen(paper._id)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{paper.title}</Text>
            <Text style={styles.meta}>
              {paper.level} · {paper.questions.length} questões
            </Text>
            {paper.description && (
              <Text numberOfLines={3} style={styles.intro}>
                {paper.description}
              </Text>
            )}
            <Text style={styles.buttonText}>Conhecer o simulado ↗</Text>
          </Pressable>
        ))
      ) : (
        <Notice>
          {archived
            ? 'Nenhum simulado arquivado neste nível.'
            : 'Crie seu primeiro simulado com questões de vocabulário, gramática, leitura e escuta.'}
        </Notice>
      )}
      {(papers.status === 'CanLoadMore' || papers.status === 'LoadingMore') && (
        <Action
          secondary
          label="Ver mais simulados"
          busy={papers.status === 'LoadingMore'}
          onPress={() => papers.loadMore(12)}
        />
      )}
      <Action label="＋ Criar simulado" onPress={onCreate} />
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Sua trajetória nas provas
      </Text>
      {history.status === 'LoadingFirstPage' ? (
        <Loading />
      ) : history.results.filter((attempt) => attempt.status === 'completed')
          .length ? (
        history.results
          .filter((attempt) => attempt.status === 'completed')
          .map((attempt) => {
            const result = summarizeAttempt(attempt);
            return (
              <Pressable
                key={attempt._id}
                accessibilityRole="button"
                accessibilityLabel={`Ver resultado de ${attempt.snapshot.title}`}
                onPress={() => onAttempt(attempt._id)}
                style={styles.card}
              >
                <Text style={styles.cardTitle}>{attempt.snapshot.title}</Text>
                <Text style={styles.meta}>
                  {attempt.snapshot.level} ·{' '}
                  {new Date(
                    attempt.completedAt ?? attempt.startedAt,
                  ).toLocaleString('pt-BR')}
                </Text>
                <Text style={styles.buttonText}>
                  {result?.correct}/{result?.total} acertos · revisar gabarito ↗
                </Text>
              </Pressable>
            );
          })
      ) : (
        <Text style={styles.intro}>
          Seus resultados aparecem aqui depois de entregar um simulado.
        </Text>
      )}
      {(history.status === 'CanLoadMore' ||
        history.status === 'LoadingMore') && (
        <Action
          secondary
          label="Ver resultados anteriores"
          busy={history.status === 'LoadingMore'}
          onPress={() => history.loadMore(10)}
        />
      )}
    </View>
  );
}

export function JlptPaperScreen({
  paperId,
  onEdit,
  onAttempt,
}: {
  paperId: Id<'jlptPapers'>;
  onEdit: () => void;
  onAttempt: (id: Id<'jlptAttempts'>) => void;
}) {
  const paper = useQuery(api.jlpt.get, { id: paperId });
  const active = useQuery(api.jlpt.active, {});
  const start = useMutation(api.jlpt.start),
    archive = useMutation(api.jlpt.archive),
    restore = useMutation(api.jlpt.restore);
  const command = useCommand();
  const { offlineMode, online, switchingMode, assertCanEditLibrary } =
    useOfflineStatus();
  const [prepared, setPrepared] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  if (paper === undefined) return <Loading label="Abrindo o simulado…" />;
  if (!paper) return <Notice error>Este simulado não está disponível.</Notice>;
  let incomplete: string | null = null;
  try {
    validateReady(paper);
  } catch (error) {
    incomplete = errorMessage(error);
  }
  const urls = [
    ...new Set(
      paper.questions.flatMap((question) =>
        [question.audioUrl, question.imageUrl].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  ];
  async function prepare() {
    setPrepared(false);
    await preparePaperMedia(urls, {
      getCachedMedia,
      downloadMedia,
      assertOnline: assertCanEditLibrary,
      onProgress: (current, total) =>
        setDownloadStatus(`Conferindo mídia ${current} de ${total}…`),
    });
    setPrepared(true);
    setDownloadStatus('Áudios e imagens disponíveis neste aparelho.');
  }
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.heroCopy}>SIMULADO {paper.level}</Text>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          {paper.title}
        </Text>
        <Text style={styles.heroCopy}>
          {paper.questions.length} questões ·{' '}
          {blocksForLevel(paper.level).reduce(
            (total, block) => total + block.minutes,
            0,
          )}{' '}
          minutos
        </Text>
      </View>
      {paper.description && (
        <Text selectable style={styles.intro}>
          {paper.description}
        </Text>
      )}
      {paper.archived && (
        <Notice>
          Este simulado está arquivado. Restaure para iniciar uma nova
          tentativa.
        </Notice>
      )}
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Seu percurso
      </Text>
      <BlockPlan level={paper.level} />
      <View style={styles.card}>
        {JLPT_SKILLS.map((skill) => (
          <Text key={skill} style={ui.body}>
            {SKILL_LABELS[skill]} ·{' '}
            {
              paper.questions.filter((question) => question.skill === skill)
                .length
            }{' '}
            questões
          </Text>
        ))}
      </View>
      <View style={styles.stack}>
        <Text style={ui.body}>
          Você pode mudar respostas e marcar questões para revisar dentro do
          mesmo bloco. Ao avançar, o bloco anterior é encerrado.
        </Text>
        <Text style={ui.body}>
          O tempo não pausa ao sair do app. Entre blocos, você escolhe quando
          começar o próximo. A correção aparece só ao entregar.
        </Text>
        <Text style={ui.note}>
          Os tempos seguem a estrutura do JLPT. A quantidade de questões depende
          do seu material. O resultado mostra acertos brutos; não é a nota
          oficial de 0 a 180 nem uma aprovação oficial.
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(JLPT_STRUCTURE_SOURCE);
          }}
          style={styles.outlineButton}
        >
          <Text style={styles.buttonText}>Ver estrutura oficial do JLPT ↗</Text>
        </Pressable>
      </View>
      {paper.source && (
        <View style={ui.field}>
          <Text style={ui.label}>Fonte do material</Text>
          <Text selectable style={ui.body}>
            {paper.source}
          </Text>
        </View>
      )}
      {incomplete && (
        <Notice>Complete o simulado antes de começar: {incomplete}</Notice>
      )}
      {downloadStatus && (
        <Text accessibilityLiveRegion="polite" style={ui.note}>
          {downloadStatus}
        </Text>
      )}
      {command.error && <Notice error>{command.error}</Notice>}
      {active ? (
        <>
          <Notice>
            Você já tem um simulado em andamento. Continue ou entregue essa
            tentativa antes de iniciar outra.
          </Notice>
          <Action
            label="Continuar meu simulado"
            onPress={() => onAttempt(active._id)}
          />
        </>
      ) : (
        <Action
          label="Começar simulado"
          disabled={paper.archived || Boolean(incomplete)}
          busy={command.busy}
          onPress={() => {
            void command.run(async () => {
              await prepare();
              const attempt = await start({ paperId: paper._id });
              onAttempt(attempt._id);
            });
          }}
        />
      )}
      {urls.length > 0 && (
        <Action
          secondary
          label={
            prepared || offlineMode || !online || switchingMode
              ? 'Conferir mídia offline'
              : 'Preparar áudios e imagens para offline'
          }
          busy={command.busy}
          onPress={() => {
            void command.run(prepare);
          }}
        />
      )}
      <Action
        secondary
        label="Editar simulado"
        onPress={onEdit}
        disabled={command.busy}
      />
      <Action
        secondary
        label={paper.archived ? 'Restaurar simulado' : 'Arquivar simulado'}
        busy={command.busy}
        onPress={() => {
          void command.run(async () => {
            await (paper.archived ? restore : archive)({ id: paper._id });
          });
        }}
      />
    </View>
  );
}
