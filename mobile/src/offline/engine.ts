import type { FunctionArgs } from 'convex/server';
import type { api } from '../../../backend/convex/_generated/api';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { makeJlptCommand } from './jlpt';
import {
  storyReadingKey,
  type StoryRecord,
  type StoryProgress,
} from '../../../shared/stories';
import { mergeStoryCache, mergeStoryProgress } from './stories';
import {
  remainingQuestCardIds,
  remainingQuestPaperIds,
  remainingQuestStoryIds,
  QUEST_BATCH_CARDS,
  type QuestSnapshot,
} from '../../../shared/quests';
import {
  applyLocal,
  clone,
  emptyData,
  matches,
  project,
  resolveId,
  snapshotOf,
  skippedAfterAnswer,
  sorted,
  type CachedProfile,
  type Data,
  type Saved,
  type Card,
} from './model';

export type Reply = {
  story?: StoryRecord;
  storyProgress?: StoryProgress;
  mappings: { localId: string; serverId: string }[];
  quests?: QuestSnapshot[];
  card?: Card;
  paper?: Doc<'jlptPapers'>;
  attempt?: Doc<'jlptAttempts'>;
  session?: Doc<'studySessions'>;
  projection?: {
    session: Doc<'studySessions'>;
    presentation: Doc<'studyPresentations'> | null;
    undoPresentationId: string | null;
  };
};
export type Persistence = {
  read(): Promise<Saved | null>;
  write(value: Saved): Promise<void>;
};
export type Conflict = {
  message: string;
  canForce: boolean;
  kind: 'card' | 'session';
};
export type EngineStatus = {
  resetVersion: number;
  ready: boolean;
  pending: number;
  syncing: boolean;
  error: string | null;
  conflict: Conflict | null;
  lastSyncedAt: number | null;
};
export type EngineSnapshot = {
  data: Data | null;
  saved: Saved | null;
  status: EngineStatus;
};
type Dependencies = {
  accountKey: string;
  storage: Persistence;
  uuid: () => string;
  now?: () => number;
};

function remapData(data: Data, mappings: Saved['aliases']): Data {
  const fields = new Set([
    '_id',
    'ownerId',
    'cardId',
    'sessionId',
    'presentationId',
    'paperId',
    'attemptId',
    'questId',
  ]);
  return JSON.parse(
    JSON.stringify(data, (key, value: unknown) =>
      fields.has(key) && typeof value === 'string'
        ? resolveId(value, mappings)
        : value,
    ),
  ) as Data;
}
function message(cause: unknown) {
  if (
    cause &&
    typeof cause === 'object' &&
    'data' in cause &&
    cause.data &&
    typeof cause.data === 'object' &&
    'message' in cause.data &&
    typeof cause.data.message === 'string'
  )
    return cause.data.message;
  return cause instanceof Error
    ? cause.message
    : 'Não foi possível sincronizar agora.';
}
function conflictCode(cause: unknown) {
  return cause &&
    typeof cause === 'object' &&
    'data' in cause &&
    cause.data &&
    typeof cause.data === 'object' &&
    'code' in cause.data
    ? cause.data.code
    : null;
}
function utf8Bytes(value: unknown) {
  let bytes = 0;
  for (const character of JSON.stringify(value)) {
    const point = character.codePointAt(0)!;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}
function availableQuest(data: Data, questId: string, now: number) {
  const quest = data.quests?.find((item) => item.id === questId);
  if (!quest)
    throw new Error('Atualize as quests para baixar este desafio no aparelho.');
  if (quest.cancelledAt !== undefined)
    throw new Error('Esta quest foi cancelada.');
  if (quest.completedAt !== undefined)
    throw new Error('Esta quest já foi concluída.');
  if (now < Math.max(quest.startsAt, quest.createdAt))
    throw new Error('Esta quest ainda não começou.');
  if (now >= quest.dueAt) throw new Error('O prazo desta quest terminou.');
  return quest;
}
export class OfflineEngine {
  private current: EngineSnapshot = {
    data: null,
    saved: null,
    status: {
      ready: false,
      pending: 0,
      syncing: false,
      error: null,
      conflict: null,
      lastSyncedAt: null,
      resetVersion: 0,
    },
  };
  private listeners = new Set<() => void>();
  private serial: Promise<unknown> = Promise.resolve();
  private working = false;
  private stopped = false;
  private contentRevision = 0;
  private openStories = new Map<string, number>();
  retainStory(id: string, questId?: string) {
    const key = storyReadingKey(id, questId);
    this.openStories.set(key, (this.openStories.get(key) ?? 0) + 1);
    return () => {
      const count = this.openStories.get(key) ?? 0;
      if (count <= 1) this.openStories.delete(key);
      else this.openStories.set(key, count - 1);
    };
  }
  private confirmedContent = new Map<
    string,
    { revision: number; content: Card | Doc<'jlptPapers'> }
  >();
  constructor(private readonly deps: Dependencies) {}
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<EngineStatus> = {}) {
    const saved = this.current.saved;
    this.current = {
      ...this.current,
      status: {
        ...this.current.status,
        ...patch,
        pending: saved?.queue.length ?? 0,
        lastSyncedAt: saved?.lastSyncedAt ?? null,
      },
    };
    for (const listener of this.listeners) listener();
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work);
    this.serial = result.catch(() => undefined);
    return result;
  }
  private async save(saved: Saved) {
    const projected = project(saved);
    await this.deps.storage.write(saved);
    this.current = { ...this.current, saved, data: projected };
    this.publish({ ready: true });
  }
  async load(profile?: CachedProfile) {
    return this.exclusive(async () => {
      try {
        const cached = await this.deps.storage.read();
        if (
          cached &&
          (cached.version !== 1 || cached.accountKey !== this.deps.accountKey)
        )
          throw new Error('O armazenamento não pertence a esta conta.');
        if (cached) {
          this.current = {
            ...this.current,
            saved: cached,
            data: project(cached),
          };
          this.publish({ ready: true });
        } else if (profile) {
          await this.save({
            version: 1,
            accountKey: this.deps.accountKey,
            base: emptyData(profile),
            queue: [],
            aliases: {},
            lastSyncedAt: null,
          });
        } else
          throw new Error(
            'Conecte uma vez para baixar sua biblioteca neste aparelho.',
          );
      } catch (cause) {
        this.publish({ error: message(cause) });
      }
    });
  }
  async updateProfile(profile: CachedProfile) {
    return this.exclusive(async () => {
      if (!this.current.saved) return;
      try {
        const next = clone(this.current.saved);
        next.base.profile = clone(profile);
        await this.save(next);
      } catch (cause) {
        this.publish({ error: message(cause) });
      }
    });
  }
  /** Cache an already-confirmed library mutation; it must never enter the journal. */
  async acceptRemoteContent(content: Card | Doc<'jlptPapers'>) {
    const captured = clone(content);
    return this.exclusive(async () => {
      if (this.stopped || !this.current.saved) return;
      const next = clone(this.current.saved);
      if ('questions' in captured) {
        const papers = next.base.jlptPapers ?? [];
        next.base.jlptPapers = [
          ...papers.filter((item) => item._id !== captured._id),
          captured,
        ];
      } else {
        next.base.cards = [
          ...next.base.cards.filter((item) => item._id !== captured._id),
          captured,
        ];
      }
      try {
        await this.save(next);
        this.confirmedContent.set(captured._id, {
          revision: ++this.contentRevision,
          content: captured,
        });
      } catch (cause) {
        // The remote save succeeded. Leave an explicit cache warning instead
        // of rejecting the form and inviting a duplicate create on retry.
        this.publish({
          error: `Salvo na nuvem. Falta atualizar o aparelho: ${message(cause)}`,
        });
      }
    });
  }
  async acceptRemoteStory(
    story: StoryRecord,
    progress: StoryProgress | null,
    quest?: QuestSnapshot | null,
  ) {
    const captured = clone({ story, progress, quest });
    return this.exclusive(async () => {
      if (this.stopped || !this.current.saved) return;
      const next = clone(this.current.saved);
      const before = clone(next.base);
      const key = storyReadingKey(story.id, story.questId);
      const localStory =
        this.current.data?.stories?.find(
          (s) => storyReadingKey(s.id, s.questId) === key,
        ) ??
        before.stories?.find((s) => storyReadingKey(s.id, s.questId) === key);
      // A page requested before an editorial update can finish after the user
      // starts reading offline. Keep that exact edition until its journal ACK.
      const hasPending = next.queue.some(
        (p) =>
          'storyId' in p.command &&
          storyReadingKey(p.command.storyId, p.command.questId) === key,
      );
      if (
        hasPending &&
        localStory &&
        (localStory.contentVersion ?? 1) !== (story.contentVersion ?? 1)
      )
        return;
      next.base.stories = [captured.story];
      next.base.storyProgress = captured.progress
        ? [
            mergeStoryProgress(
              before.storyProgress?.find(
                (p) => storyReadingKey(p.storyId, p.questId) === key,
              ),
              captured.progress,
            ),
          ]
        : [];
      mergeStoryCache(
        next.base,
        before,
        new Set([
          key,
          ...this.openStories.keys(),
          ...next.queue.flatMap((p) =>
            'storyId' in p.command
              ? [storyReadingKey(p.command.storyId, p.command.questId)]
              : [],
          ),
        ]),
        new Set(
          next.queue.flatMap((p) =>
            'storyId' in p.command
              ? [storyReadingKey(p.command.storyId, p.command.questId)]
              : [],
          ),
        ),
      );
      if (captured.quest && captured.quest.id === captured.story.questId) {
        const existing = next.base.quests?.find(
          (q) => q.id === captured.quest!.id,
        );
        if (
          !existing ||
          (existing.completedAt === undefined &&
            existing.updatedAt <= captured.quest.updatedAt)
        )
          next.base.quests = [
            ...(next.base.quests ?? []).filter(
              (q) => q.id !== captured.quest!.id,
            ),
            captured.quest,
          ];
      }
      await this.save(next);
    });
  }
  async setStoryPreferences(
    patch: Partial<NonNullable<Saved['storyPreferences']>>,
  ) {
    return this.exclusive(async () => {
      if (this.stopped || !this.current.saved)
        throw new Error('Aguarde o armazenamento ficar pronto.');
      const next = clone(this.current.saved);
      next.storyPreferences = {
        furigana: true,
        textSize: 'normal',
        ...next.storyPreferences,
        ...patch,
      };
      await this.save(next);
    });
  }
  private makeCommand(
    name: string,
    args: Record<string, unknown>,
    data: Data,
    aliases: Saved['aliases'],
  ): OfflineCommand {
    const localId = () => `local:${this.deps.uuid()}`;
    const now = this.deps.now?.() ?? Date.now();
    const questId = typeof args.questId === 'string' ? args.questId : undefined;
    const storyContext = questId ? { questId } : {};
    const storyVersion = name.startsWith('stories:')
      ? (data.stories?.find(
          (story) =>
            storyReadingKey(story.id, story.questId) ===
            storyReadingKey(String(args.id), questId),
        )?.contentVersion ?? 1)
      : 1;
    if (name === 'stories:saveParagraph')
      return {
        type: 'story.progress',
        ...storyContext,
        storyId: String(args.id),
        contentVersion: storyVersion,
        paragraphIndex: Number(args.paragraphIndex),
        occurredAt: now,
      };
    if (name === 'stories:answer')
      return {
        type: 'story.answer',
        ...storyContext,
        storyId: String(args.id),
        contentVersion: storyVersion,
        questionId: String(args.questionId),
        optionId: String(args.optionId),
        occurredAt: now,
      };
    if (name === 'stories:complete')
      return {
        type: 'story.complete',
        ...storyContext,
        storyId: String(args.id),
        contentVersion: storyVersion,
        occurredAt: now,
      };
    if (name === 'quests:start') {
      const quest = availableQuest(data, String(args.id), now);
      const remaining = remainingQuestCardIds(quest);
      if (remaining.length) {
        const byId = new Map(
          data.cards.map((card) => [card._id as string, card]),
        );
        for (const cardId of remaining) {
          const card = byId.get(cardId);
          if (!card || card.archived || card.ownerId !== data.profile._id)
            throw new Error(
              'Um card escolhido para esta quest está indisponível. Atualize a biblioteca ou restaure o card para continuar.',
            );
        }
        const queue: Extract<OfflineCommand, { type: 'study.start' }>['queue'] =
          [];
        let bytes = 0;
        for (const cardId of remaining.slice(0, QUEST_BATCH_CARDS)) {
          const snapshot = snapshotOf(byId.get(cardId)!);
          const size = utf8Bytes(snapshot);
          if (bytes + size > 350_000) break;
          queue.push({ localId: localId(), cardId, snapshot });
          bytes += size;
        }
        if (!queue.length)
          throw new Error(
            'O conteúdo deste card é grande demais para baixar o desafio.',
          );
        return {
          type: 'study.start',
          localId: localId(),
          questId: quest.id,
          mode: 'direct',
          order: 'sorted',
          filters: {},
          queue,
          createdAt: now,
        };
      }
      const paperId = remainingQuestPaperIds(quest)[0];
      if (!paperId) {
        const storyId = remainingQuestStoryIds(quest)[0];
        if (storyId) {
          const cached =
            data.stories?.find(
              (s) => s.id === storyId && s.questId === quest.id,
            ) ?? data.stories?.find((s) => s.id === storyId && !s.questId);
          if (!cached)
            throw new Error(
              'Conecte para baixar a história escolhida para esta quest.',
            );
          return {
            type: 'story.progress',
            storyId,
            questId: quest.id,
            paragraphIndex: 0,
            contentVersion: cached.contentVersion ?? 1,
            occurredAt: now,
          };
        }
      }
      if (!paperId)
        throw new Error(
          'Esta quest já foi concluída. Atualize para confirmar.',
        );
      const command = makeJlptCommand(
        'jlpt:start',
        { paperId },
        data,
        aliases,
        localId,
        now,
      );
      if (command.type !== 'jlpt.start')
        throw new Error('Não foi possível abrir o simulado.');
      return { ...command, questId: quest.id };
    }
    if (name.startsWith('jlpt:'))
      return makeJlptCommand(name, args, data, aliases, localId, now);
    const [module, operation] = name.split(':');
    const category = module === 'exams' ? 'exam' : module;
    if (
      category === 'alphabet' ||
      category === 'vocabulary' ||
      category === 'grammar' ||
      category === 'exam'
    ) {
      if (operation === 'create') {
        if (category === 'exam')
          return {
            type: 'card.create',
            category,
            localId: localId(),
            ...(args as FunctionArgs<typeof api.exams.create>),
            createdAt: now,
          };
        if (category === 'alphabet')
          return {
            type: 'card.create',
            category,
            localId: localId(),
            ...(args as FunctionArgs<typeof api.alphabet.create>),
            createdAt: now,
          };
        if (category === 'vocabulary')
          return {
            type: 'card.create',
            category,
            localId: localId(),
            ...(args as FunctionArgs<typeof api.vocabulary.create>),
            createdAt: now,
          };
        return {
          type: 'card.create',
          category,
          localId: localId(),
          ...(args as FunctionArgs<typeof api.grammar.create>),
          createdAt: now,
        };
      }
      const card = data.cards.find(
        (c) => c._id === resolveId(String(args.id), aliases),
      );
      if (!card) throw new Error('Card indisponível neste aparelho.');
      const expected = {
        id: String(args.id),
        expectedContentVersion: card.contentVersion,
        expectedArchived: card.archived,
      };
      if (operation === 'archive' || operation === 'restore')
        return {
          type: 'card.archive',
          category,
          ...expected,
          archived: operation === 'archive',
        };
      if (operation === 'update') {
        if (category === 'exam')
          return {
            type: 'card.update',
            category,
            ...expected,
            patch: (args as FunctionArgs<typeof api.exams.update>).patch,
          };
        if (category === 'alphabet')
          return {
            type: 'card.update',
            category,
            ...expected,
            patch: (args as FunctionArgs<typeof api.alphabet.update>).patch,
          };
        if (category === 'vocabulary')
          return {
            type: 'card.update',
            category,
            ...expected,
            patch: (args as FunctionArgs<typeof api.vocabulary.update>).patch,
          };
        return {
          type: 'card.update',
          category,
          ...expected,
          patch: (args as FunctionArgs<typeof api.grammar.update>).patch,
        };
      }
    }
    if (name === 'study:start') {
      const { mode, order, limit, ...filters } = args as FunctionArgs<
        typeof api.study.start
      >;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Escolha entre 1 e 100 cards.');
      let cards = sorted(
        data.cards.filter((c) => !('prompt' in c) && matches(c, filters)),
      );
      if (!cards.length)
        throw new Error(
          'Nenhum card salvo corresponde aos filtros. Cadastre um item ou conecte para baixar sua biblioteca.',
        );
      if (cards.length > 1000)
        throw new Error(
          'Escolha uma categoria com até 1.000 cards para estudar.',
        );
      if (mode === 'adaptive') {
        const priority = (card: Card) => {
          const stat = data.stats.find((s) => s.cardId === card._id);
          return !stat || stat.attempts === 0
            ? 1.5
            : 1 -
                (stat.correct + 0.5 * stat.partial) / stat.attempts +
                Math.min(
                  Math.max(0, now - stat.lastReviewedAt) / 86400000 / 30,
                  1,
                ) *
                  0.25;
        };
        cards.sort(
          (a, b) =>
            priority(b) - priority(a) || a._creationTime - b._creationTime,
        );
      } else if (order === 'random')
        for (let i = cards.length - 1; i > 0; i--) {
          const target = Math.floor(Math.random() * (i + 1));
          [cards[i], cards[target]] = [cards[target], cards[i]];
        }
      cards = cards.slice(0, limit);
      return {
        type: 'study.start',
        localId: localId(),
        mode,
        order,
        filters,
        createdAt: now,
        queue: cards.map((card) => ({
          localId: localId(),
          cardId: card._id,
          snapshot: snapshotOf(card),
        })),
      };
    }
    if (name === 'study:finish')
      return {
        type: 'study.finish',
        sessionId: String(args.sessionId),
        expectedRevision:
          data.sessions.find(
            (s) => s._id === resolveId(String(args.sessionId), aliases),
          )?.revision ?? 0,
        occurredAt: now,
      };
    const presentation = {
      sessionId: String(args.sessionId),
      presentationId: String(args.presentationId),
      expectedRevision: Number(args.expectedRevision ?? 0),
      occurredAt: now,
    };
    if (name === 'study:reveal')
      return { type: 'study.reveal', ...presentation };
    if (name === 'study:undo') return { type: 'study.undo', ...presentation };
    if (name === 'study:rate')
      return {
        type: 'study.rate',
        ...presentation,
        rating: (args as FunctionArgs<typeof api.study.rate>).rating,
        skippedPresentationIds: skippedAfterAnswer(
          data,
          String(args.sessionId),
          String(args.presentationId),
          aliases,
        ),
      };
    throw new Error('Esta ação ainda não está disponível no aparelho.');
  }
  async mutate(name: string, args: Record<string, unknown>): Promise<unknown> {
    const capturedArgs = clone(args);
    return this.exclusive(async () => {
      if (this.stopped)
        throw new Error('Entre novamente para continuar estudando.');
      const { saved, data } = this.current;
      if (!saved || !data)
        throw new Error('Aguarde o armazenamento ficar pronto.');
      if (this.current.status.conflict)
        throw new Error(
          'Resolva a sincronização pendente antes de fazer novas alterações.',
        );
      if (name === 'quests:start') {
        const quest = availableQuest(
          data,
          String(capturedArgs.id),
          this.deps.now?.() ?? Date.now(),
        );
        const active = data.sessions.find(
          (session) =>
            session.questId === quest.id && session.status === 'active',
        );
        if (active) return { kind: 'study', sessionId: active._id };
        const attempt = data.jlptAttempts?.find(
          (item) => item.questId === quest.id && item.status === 'active',
        );
        if (attempt) return { kind: 'shiken', attemptId: attempt._id };
        if (
          !remainingQuestCardIds(quest).length &&
          !remainingQuestPaperIds(quest).length
        ) {
          const storyId = remainingQuestStoryIds(quest)[0];
          if (
            storyId &&
            data.storyProgress?.some(
              (p) => p.storyId === storyId && p.questId === quest.id,
            )
          )
            return { kind: 'story', storyId, questId: quest.id };
        }
      }
      if (name === 'study:start') {
        const active = data.sessions.find((s) => s.status === 'active');
        if (active) return active;
      }
      if (name === 'jlpt:start') {
        const active = data.jlptAttempts?.find(
          (attempt) => attempt.status === 'active',
        );
        if (active) return active;
      }
      if (saved.queue.length >= 2000)
        throw new Error(
          'Conecte para sincronizar suas pendências antes de continuar.',
        );
      const command = this.makeCommand(name, capturedArgs, data, saved.aliases);
      // Keep an oversized frozen session out of the journal: the server could
      // never accept it, even after reconnecting. Count UTF-8 without native APIs.
      const wireBytes = utf8Bytes(command);
      if (wireBytes > 699_000)
        throw new Error(
          'O conteúdo desta ação é grande demais. Reduza o número de cards da sessão ou o tamanho dos textos.',
        );
      const result = applyLocal(clone(data), command, saved.aliases);
      const next = clone(saved);
      next.queue.push({ id: this.deps.uuid(), command });
      await this.save(next);
      if (name === 'quests:start')
        return command.type === 'study.start'
          ? { kind: 'study', sessionId: (result as Doc<'studySessions'>)._id }
          : command.type === 'story.progress'
            ? {
                kind: 'story',
                storyId: command.storyId,
                questId: command.questId,
              }
            : {
                kind: 'shiken',
                attemptId: (result as Doc<'jlptAttempts'>)._id,
              };
      return result;
    });
  }
  stop() {
    this.stopped = true;
  }
  resume() {
    this.stopped = false;
  }
  reportSyncError(error: string) {
    if (!this.stopped) this.publish({ error });
  }
  /** Acknowledgements already contain the documents needed to reconcile a study. */
  synchronizePending(
    send: (operationId: string, command: OfflineCommand) => Promise<Reply>,
    connected: () => boolean,
  ) {
    return this.synchronize(send, undefined, connected);
  }
  async synchronize(
    send: (operationId: string, command: OfflineCommand) => Promise<Reply>,
    pull: (() => Promise<Data>) | undefined,
    connected: () => boolean,
  ) {
    if (
      this.working ||
      this.stopped ||
      !connected() ||
      !this.current.saved ||
      this.current.status.conflict
    )
      return false;
    this.working = true;
    this.publish({ syncing: true, error: null });
    try {
      while (!this.stopped && connected()) {
        const pending = await this.exclusive(async () => {
          const saved = this.current.saved!;
          if (!saved.queue.length) return null;
          const next = clone(saved);
          const head = next.queue[0];
          if (!head.sent) {
            const command = clone(head.command);
            if (
              command.type === 'card.update' ||
              command.type === 'card.archive'
            ) {
              const base = next.base.cards.find(
                (c) => c._id === resolveId(command.id, next.aliases),
              );
              if (base) {
                command.expectedContentVersion = base.contentVersion;
                command.expectedArchived = base.archived;
              }
            }
            head.sent = command;
            await this.save(next);
          }
          return clone(head);
        });
        // Persisting the exact retry payload can yield while the user enters
        // offline mode or signs out. Keep that payload, but do not send it.
        if (!pending || this.stopped || !connected()) break;
        const reply = await send(pending.id, pending.sent!);
        if (this.stopped) return false;
        await this.exclusive(async () => {
          const next = clone(this.current.saved!);
          if (next.queue[0]?.id !== pending.id) return;
          for (const mapping of reply.mappings)
            next.aliases[mapping.localId] = mapping.serverId;
          next.base = remapData(next.base, next.aliases);
          const command = pending.command;
          if (
            command.type === 'study.start' &&
            pending.sent?.type === 'study.start' &&
            pending.sent.force
          )
            for (const s of next.base.sessions)
              if (s.status === 'active') s.status = 'ended';
          applyLocal(next.base, command, next.aliases, true);
          if (reply.story)
            next.base.stories = [
              ...(next.base.stories ?? []).filter(
                (story) =>
                  storyReadingKey(story.id, story.questId) !==
                  storyReadingKey(reply.story!.id, reply.story!.questId),
              ),
              reply.story,
            ];
          if (reply.storyProgress)
            next.base.storyProgress = [
              ...(next.base.storyProgress ?? []).filter(
                (p) =>
                  storyReadingKey(p.storyId, p.questId) !==
                  storyReadingKey(
                    reply.storyProgress!.storyId,
                    reply.storyProgress!.questId,
                  ),
              ),
              reply.storyProgress,
            ];
          if (reply.quests) {
            const confirmed = new Map(
              reply.quests.map((quest) => [quest.id, quest]),
            );
            next.base.quests = [
              ...(next.base.quests ?? []).filter(
                (quest) => !confirmed.has(quest.id),
              ),
              ...confirmed.values(),
            ];
          }
          if (reply.card)
            next.base.cards = next.base.cards.map((c) =>
              c._id === reply.card!._id ? reply.card! : c,
            );
          if (reply.paper)
            next.base.jlptPapers = (next.base.jlptPapers ?? []).map((paper) =>
              paper._id === reply.paper!._id ? reply.paper! : paper,
            );
          if (reply.attempt)
            next.base.jlptAttempts = (next.base.jlptAttempts ?? []).map(
              (attempt) =>
                attempt._id === reply.attempt!._id ? reply.attempt! : attempt,
            );
          const session = reply.projection?.session ?? reply.session;
          if (session)
            next.base.sessions = next.base.sessions.map((s) =>
              s._id === session._id ? session : s,
            );
          const p = reply.projection?.presentation;
          if (p)
            next.base.presentations = next.base.presentations.map((item) =>
              item._id === p._id ? p : item,
            );
          next.queue.shift();
          if (!next.queue.length)
            next.lastSyncedAt = this.deps.now?.() ?? Date.now();
          await this.save(next);
        });
      }
      if (
        pull &&
        !this.stopped &&
        connected() &&
        !this.current.saved!.queue.length
      ) {
        const contentRevision = this.contentRevision;
        const downloaded = await pull();
        if (this.stopped || !connected()) return false;
        return await this.exclusive(async () => {
          if (this.stopped || !connected()) return false;
          const next = clone(this.current.saved!);
          if (next.queue.length) return false; // A local write made while downloading always wins until its own ACK.
          // A confirmed form save can finish while catalogue pages are loading.
          // Overlay those newer documents instead of replacing them with an old page.
          for (const { revision, content } of this.confirmedContent.values()) {
            if (revision <= contentRevision) continue;
            if ('questions' in content)
              downloaded.jlptPapers = [
                ...(downloaded.jlptPapers ?? []).filter(
                  (paper) => paper._id !== content._id,
                ),
                clone(content),
              ];
            else
              downloaded.cards = [
                ...downloaded.cards.filter((card) => card._id !== content._id),
                clone(content),
              ];
          }
          // Keep completed local sessions available to the currently open summary.
          const known = new Set(downloaded.sessions.map((s) => s._id));
          downloaded.sessions.push(
            ...next.base.sessions
              .filter((s) => !known.has(s._id) && s.status !== 'active')
              .slice(-20),
          );
          const sessions = new Set(downloaded.sessions.map((s) => s._id));
          const present = new Set(downloaded.presentations.map((p) => p._id));
          downloaded.presentations.push(
            ...next.base.presentations.filter(
              (p) => sessions.has(p.sessionId) && !present.has(p._id),
            ),
          );
          mergeStoryCache(
            downloaded,
            next.base,
            new Set(this.openStories.keys()),
            new Set(this.openStories.keys()),
          );
          next.base = downloaded;
          next.lastSyncedAt = this.deps.now?.() ?? Date.now();
          await this.save(next);
          return true;
        });
      }
    } catch (cause) {
      // Entering offline mode intentionally aborts an in-flight download.
      // Keep its journal intact; real failures will surface on the next retry.
      if (this.stopped || !connected()) return false;
      const code = conflictCode(cause);
      const command = this.current.saved?.queue[0]?.command;
      const blocked =
        code === 'CONFLICT' || code === 'VALIDATION' || code === 'UNAVAILABLE';
      this.publish({
        error: message(cause),
        ...(blocked && command
          ? {
              conflict: {
                message: message(cause),
                kind:
                  command.type.startsWith('card.') ||
                  command.type === 'jlpt.update' ||
                  command.type === 'jlpt.archive'
                    ? 'card'
                    : 'session',
                canForce:
                  code === 'CONFLICT' &&
                  (command.type === 'card.update' ||
                    command.type === 'card.archive' ||
                    command.type === 'jlpt.update' ||
                    command.type === 'jlpt.archive' ||
                    command.type === 'study.start'),
              },
            }
          : {}),
      });
    } finally {
      this.working = false;
      this.publish({ syncing: false });
    }
    return false;
  }
  async resolveConflict(
    choice: 'device' | 'cloud',
    pull: () => Promise<Data>,
    connected: () => boolean = () => true,
  ) {
    const assertCurrent = () => {
      if (this.stopped || !connected())
        throw new Error(
          'Resolução pausada. Seus estudos foram preservados neste aparelho.',
        );
    };
    assertCurrent();
    if (this.working)
      throw new Error('Aguarde a sincronização atual terminar.');
    if (choice === 'cloud') {
      const downloaded = await pull();
      await this.exclusive(async () => {
        assertCurrent();
        const next = clone(this.current.saved!);
        next.base = downloaded;
        next.queue = [];
        next.lastSyncedAt = this.deps.now?.() ?? Date.now();
        await this.save(next);
        this.publish({
          conflict: null,
          error: null,
          resetVersion: this.current.status.resetVersion + 1,
        });
      });
    } else
      await this.exclusive(async () => {
        assertCurrent();
        if (!this.current.status.conflict?.canForce)
          throw new Error(
            'Esta pendência precisa ser resolvida na biblioteca.',
          );
        const next = clone(this.current.saved!);
        const head = next.queue[0];
        if (
          head.command.type !== 'card.update' &&
          head.command.type !== 'card.archive' &&
          head.command.type !== 'jlpt.update' &&
          head.command.type !== 'jlpt.archive' &&
          head.command.type !== 'study.start'
        )
          return;
        head.command.force = true;
        delete head.sent;
        head.id = this.deps.uuid();
        await this.save(next);
        this.publish({ conflict: null, error: null });
      });
  }
}
