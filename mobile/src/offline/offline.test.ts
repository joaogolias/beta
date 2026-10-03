import { describe, expect, it, vi } from 'vitest';
import { api } from '../../../backend/convex/_generated/api';
import { useMutation } from './hooks';
import type { Doc, Id } from '../../../backend/convex/_generated/dataModel';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import {
  applyLocal,
  clone,
  emptyData,
  localQuery,
  project,
  projection,
  snapshotOf,
  type Saved,
  type Data,
  matches,
} from './model';
import { OfflineEngine, type Persistence, type Reply } from './engine';
import { summarizeAttempt, type PaperInput } from '../../../shared/jlpt';
import { libraryReadingSortKey } from '../../../shared/libraryOrder';

const hookTransport = vi.hoisted(() => ({
  context: null as unknown,
  mutation: vi.fn(),
}));
vi.mock('react', async (load) => ({
  ...(await load<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
}));
vi.mock('convex/react', () => ({
  useConvex: () => ({ mutation: hookTransport.mutation }),
}));
vi.mock('./Provider', () => ({
  useOfflineContext: () => hookTransport.context,
}));
describe('dedicated JLPT offline attempts', () => {
  it('persists marked alternatives and frozen exam content, then replays a lost ACK without duplicating papers or attempts', async () => {
    let disk: Saved | null = null;
    let count = 0;
    let now = 1_800_000_000_000;
    const storage: Persistence = {
      read: async () => disk && clone(disk),
      write: async (value) => {
        disk = clone(value);
      },
    };
    const dependencies = {
      accountKey: 'jlpt-owner',
      storage,
      uuid: () => 'jlpt' + ++count,
      now: () => now,
    };
    const engine = new OfflineEngine(dependencies);
    await engine.load(profile);
    const paper = (await engine.mutate('jlpt:create', {
      paper: jlptPaper,
    })) as Doc<'jlptPapers'>;
    const started = (await engine.mutate('jlpt:start', {
      paperId: paper._id,
    })) as Doc<'jlptAttempts'>;
    const answer = async (
      questionId: string,
      choice: number,
      flagged = false,
    ) => {
      now += 1000;
      const attempt = engine.getSnapshot().data!.jlptAttempts![0];
      return await engine.mutate('jlpt:answer', {
        attemptId: started._id,
        expectedRevision: attempt.revision,
        questionId,
        choice,
        flagged,
      });
    };
    const advance = async () => {
      now += 1000;
      const attempt = engine.getSnapshot().data!.jlptAttempts![0];
      await engine.mutate('jlpt:advance', {
        attemptId: started._id,
        expectedRevision: attempt.revision,
      });
    };
    await answer('vocab', 0, true);
    await engine.mutate('jlpt:update', {
      id: paper._id,
      patch: {
        source: null,
        questions: jlptPaper.questions.map((q) =>
          q.id === 'vocab' ? { ...q, correctChoice: 1 } : q,
        ),
      },
    });
    expect(engine.getSnapshot().data!.jlptPapers![0].source).toBeUndefined();
    const pendingBeforeStaleEdit = engine.getSnapshot().status.pending;
    await expect(
      engine.mutate('jlpt:update', {
        id: paper._id,
        expectedContentVersion: paper.contentVersion,
        patch: { title: 'Rascunho antigo que não pode sobrescrever a prova' },
      }),
    ).rejects.toThrow(/mudou desde/);
    expect(engine.getSnapshot().status.pending).toBe(pendingBeforeStaleEdit);
    expect(engine.getSnapshot().data!.jlptPapers![0].title).toBe(paper.title);
    expect(
      engine.getSnapshot().data!.jlptAttempts![0].snapshot.questions[0]
        .correctChoice,
    ).toBe(0);
    await advance();
    await answer('grammar', 1);
    await advance();
    await answer('listening', 2);
    now += 1000;
    await engine.mutate('jlpt:finish', {
      attemptId: started._id,
      expectedRevision: engine.getSnapshot().data!.jlptAttempts![0].revision,
    });
    const beforeRestart = engine.getSnapshot().data!;
    expect(summarizeAttempt(beforeRestart.jlptAttempts![0])).toMatchObject({
      correct: 2,
      incorrect: 1,
      unanswered: 1,
      total: 4,
    });
    expect(beforeRestart.stats).toEqual([]);
    expect(beforeRestart.sessions).toEqual([]);
    expect(beforeRestart.attempts).toEqual([]);
    const restarted = new OfflineEngine(dependencies);
    await restarted.load();
    expect(restarted.getSnapshot().data).toEqual(beforeRestart);
    const server = emptyData(profile);
    const aliases: Record<string, string> = {};
    const receipts = new Map<string, Reply>();
    let loseAck = true;
    const send = async (
      operationId: string,
      command: OfflineCommand,
    ): Promise<Reply> => {
      const previous = receipts.get(operationId);
      if (previous) return clone(previous);
      const mappings: Reply['mappings'] = [];
      if (command.type === 'jlpt.create' || command.type === 'jlpt.start') {
        const serverId = 'server-' + command.localId.slice(6);
        aliases[command.localId] = serverId;
        mappings.push({ localId: command.localId, serverId });
      }
      const result = applyLocal(server, command, aliases);
      const reply: Reply = {
        mappings,
        ...(command.type === 'jlpt.create' ||
        command.type === 'jlpt.update' ||
        command.type === 'jlpt.archive'
          ? { paper: clone(result as Doc<'jlptPapers'>) }
          : { attempt: clone(result as Doc<'jlptAttempts'>) }),
      };
      receipts.set(operationId, clone(reply));
      if (loseAck) {
        loseAck = false;
        throw new Error('ACK lost');
      }
      return reply;
    };
    await restarted.synchronize(
      send,
      async () => clone(server),
      () => true,
    );
    expect(restarted.getSnapshot().status.pending).toBeGreaterThan(0);
    await restarted.synchronize(
      send,
      async () => clone(server),
      () => true,
    );
    expect(restarted.getSnapshot().status.pending).toBe(0);
    expect(server.jlptPapers).toHaveLength(1);
    expect(server.jlptAttempts).toHaveLength(1);
    const synced = restarted.getSnapshot();
    expect(synced.data!.jlptAttempts![0].paperId).toBe(
      server.jlptPapers![0]._id,
    );
    expect(
      localQuery(
        synced.data!,
        'jlpt:getAttempt',
        { id: started._id },
        synced.saved!.aliases,
      ),
    ).toMatchObject({ status: 'completed' });
    expect(summarizeAttempt(synced.data!.jlptAttempts![0])).toMatchObject({
      correct: 2,
      total: 4,
    });
    expect(
      localQuery(
        synced.data!,
        'studyProgress:overview',
        {},
        synced.saved!.aliases,
      ),
    ).toMatchObject({ totalCards: 0, attempts: 0 });
  });

  it('keeps the absolute deadline after restart and blocks expired answers without adding them to the journal', async () => {
    let disk: Saved | null = null;
    let now = 1_800_000_000_000;
    let count = 0;
    const storage: Persistence = {
      read: async () => disk && clone(disk),
      write: async (value) => {
        disk = clone(value);
      },
    };
    const dependencies = {
      accountKey: 'timer-owner',
      storage,
      uuid: () => 'timer' + ++count,
      now: () => now,
    };
    const engine = new OfflineEngine(dependencies);
    await engine.load(profile);
    const paper = (await engine.mutate('jlpt:create', {
      paper: jlptPaper,
    })) as Doc<'jlptPapers'>;
    const attempt = (await engine.mutate('jlpt:start', {
      paperId: paper._id,
    })) as Doc<'jlptAttempts'>;
    now = attempt.blockDeadlineAt + 1;
    const restarted = new OfflineEngine(dependencies);
    await restarted.load();
    const pending = restarted.getSnapshot().status.pending;
    await expect(
      restarted.mutate('jlpt:answer', {
        attemptId: attempt._id,
        expectedRevision: 0,
        questionId: 'vocab',
        choice: 0,
        flagged: false,
      }),
    ).rejects.toThrow(/tempo/i);
    expect(restarted.getSnapshot().status.pending).toBe(pending);
    await restarted.mutate('jlpt:advance', {
      attemptId: attempt._id,
      expectedRevision: 0,
    });
    const next = restarted.getSnapshot().data!.jlptAttempts![0];
    expect(next.blockIndex).toBe(1);
    expect(next.blockDeadlineAt).toBe(now + 40 * 60_000);
    expect(next.answers.every((answer) => answer.choice === null)).toBe(true);
    await expect(
      restarted.mutate('jlpt:answer', {
        attemptId: attempt._id,
        expectedRevision: 1,
        questionId: 'vocab',
        choice: 0,
        flagged: false,
      }),
    ).rejects.toThrow(/bloco atual/i);
  });
});

type VocabularyInput = Extract<
  OfflineCommand,
  { type: 'card.create'; category: 'vocabulary' }
>['card'];
type GrammarInput = Extract<
  OfflineCommand,
  { type: 'card.create'; category: 'grammar' }
>['card'];

const vocabularyInput: VocabularyInput = {
  language: 'ja',
  expression: '学校',
  reading: 'がっこう',
  translations: { pt: ['escola'], en: ['school'] },
  examples: [],
  front: '学校',
  back: 'escola',
  sortKey: 'がっこう',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};
const grammarInput: GrammarInput = {
  language: 'ja',
  title: '〜てもいい',
  explanation: 'Expressa permissão.',
  examples: [{ text: '座ってもいいですか。', meaning: 'Posso sentar?' }],
  front: 'Como pedir permissão?',
  back: '〜てもいい',
  sortKey: 'てもいい',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};

const profile: Doc<'users'> = {
  _id: 'owner-main' as Id<'users'>,
  _creationTime: 1,
  tokenIdentifier: 'https://clerk.test|user-main',
  name: 'Aprendiz',
  email: 'aprendiz@example.com',
};
const water: Doc<'alphabetCards'> = {
  _id: 'water-server' as Id<'alphabetCards'>,
  _creationTime: 1,
  ownerId: profile._id,
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [
    { text: '水を飲む', reading: 'みずをのむ', meaning: 'beber água' },
  ],
  front: '水',
  back: '意味 · Significado: água\n訓読み · Kun’yomi: みず\n音読み · On’yomi: スイ\n部首 · Radical: 水',
  sortKey: 'みず',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: {
    kind: 'kanji',
    kunYomi: ['みず'],
    onYomi: ['スイ'],
    radicals: ['水'],
  },
  archived: false,
  contentVersion: 1,
  createdAt: 1,
  updatedAt: 1,
};
const sessionId = 'local:session0001';
const presentationId = 'local:presentation0001';

describe('explicit study-only offline mode', () => {
  async function prepare(options: {
    online: boolean;
    offlineMode: boolean;
    switchingMode?: boolean;
  }) {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    const refresh = vi.fn(async () => undefined);
    const retry = vi.fn();
    const currentMode = { switchingMode: false, ...options };
    const assertCanEditLibrary = vi.fn(() => {
      if (
        currentMode.switchingMode ||
        currentMode.offlineMode ||
        !currentMode.online
      )
        throw new Error('Volte ao modo online para alterar sua biblioteca.');
    });
    hookTransport.context = {
      engine,
      refresh,
      retry,
      ...currentMode,
      assertCanEditLibrary,
    };
    hookTransport.mutation.mockReset();
    return { engine, refresh, retry, currentMode };
  }

  it.each([
    { online: true, offlineMode: true },
    { online: false, offlineMode: false },
    { online: false, offlineMode: true },
  ])(
    'rejects library writes without adding an offline operation (%j)',
    async (mode) => {
      const { engine } = await prepare(mode);
      await expect(
        useMutation(api.vocabulary.create)({ card: vocabularyInput }),
      ).rejects.toThrow(/online|internet/i);
      expect(engine.getSnapshot().status.pending).toBe(0);
      expect(hookTransport.mutation).not.toHaveBeenCalled();
    },
  );

  it('saves content on the server and waits for the refreshed library without journaling it', async () => {
    const { engine, refresh, retry } = await prepare({
      online: true,
      offlineMode: false,
    });
    const card = { ...water, _id: 'remote-vocabulary' };
    hookTransport.mutation.mockResolvedValue(card);
    expect(
      await useMutation(api.vocabulary.create)({ card: vocabularyInput }),
    ).toBe(card);
    expect(hookTransport.mutation).toHaveBeenCalledWith(api.vocabulary.create, {
      card: vocabularyInput,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(engine.getSnapshot().status.pending).toBe(0);
  });

  it('keeps a confirmed online save usable when the following library download fails', async () => {
    const { engine, refresh } = await prepare({
      online: true,
      offlineMode: false,
    });
    const card = {
      ...water,
      meanings: ['água doce'],
      back: water.back.replace('água', 'água doce'),
      contentVersion: 2,
    };
    hookTransport.mutation.mockResolvedValue(card);
    refresh.mockRejectedValue(new Error('O download falhou.'));
    expect(
      await useMutation(api.alphabet.update)({
        id: water._id,
        patch: { meanings: ['água doce'] },
      }),
    ).toBe(card);
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      meanings: ['água doce'],
      contentVersion: 2,
    });
    expect(engine.getSnapshot().status.pending).toBe(0);
  });

  it('requires explicit offline consent before accepting a disconnected study answer', async () => {
    const { engine } = await prepare({ online: false, offlineMode: false });
    await expect(
      useMutation(api.study.start)({
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      }),
    ).rejects.toThrow(/offline/i);
    expect(engine.getSnapshot().status.pending).toBe(0);
  });

  it('keeps study responses durable and local in explicit offline mode', async () => {
    const { engine, refresh, retry } = await prepare({
      online: false,
      offlineMode: true,
    });
    await useMutation(api.study.start)({
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    expect(engine.getSnapshot().status.pending).toBe(1);
    expect(hookTransport.mutation).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it('preserves legacy library edits and blocks newer remote writes until their queue is sent', async () => {
    const { engine, refresh } = await prepare({
      online: true,
      offlineMode: false,
    });
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['mudança antiga'] },
    });
    const queue = clone(engine.getSnapshot().saved!.queue);
    await expect(
      useMutation(api.alphabet.update)({
        id: water._id,
        patch: { meanings: ['mudança nova'] },
      }),
    ).rejects.toThrow(/sincronização pendente/);
    expect(refresh).toHaveBeenCalledOnce();
    expect(hookTransport.mutation).not.toHaveBeenCalled();
    expect(engine.getSnapshot().saved!.queue).toEqual(queue);
  });

  it.each(['offline', 'disconnected', 'switching'] as const)(
    'rechecks the current mode after draining older edits before sending a library mutation (%s)',
    async (change) => {
      const { engine, refresh, currentMode } = await prepare({
        online: true,
        offlineMode: false,
      });
      await engine.mutate('alphabet:update', {
        id: water._id,
        patch: { meanings: ['mudança antiga'] },
      });
      const drained = deferred<void>();
      const resume = deferred<void>();
      const remote = server();
      refresh.mockImplementationOnce(async () => {
        await engine.synchronize(remote.send, remote.pull, () => true);
        drained.resolve();
        await resume.promise;
      });
      hookTransport.mutation.mockResolvedValue(water);
      const mutation = useMutation(api.alphabet.update)({
        id: water._id,
        patch: { meanings: ['mudança nova'] },
      });
      const result = mutation.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await drained.promise;
      if (change === 'offline') currentMode.offlineMode = true;
      if (change === 'disconnected') currentMode.online = false;
      if (change === 'switching') currentMode.switchingMode = true;
      resume.resolve();
      expect(await result).toEqual({
        error: expect.objectContaining({
          message: expect.stringMatching(/online/),
        }),
      });
      expect(hookTransport.mutation).not.toHaveBeenCalled();
      expect(engine.getSnapshot().status.pending).toBe(0);
      expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
        meanings: ['mudança antiga'],
      });
    },
  );

  it('allows downloaded Shiken attempts offline while rejecting changes to the paper', async () => {
    const { engine } = await prepare({ online: false, offlineMode: true });
    const paper = (await engine.mutate('jlpt:create', {
      paper: jlptPaper,
    })) as Doc<'jlptPapers'>;
    const pending = engine.getSnapshot().status.pending;
    await expect(
      useMutation(api.jlpt.update)({
        id: paper._id,
        patch: { title: 'Outra prova' },
      }),
    ).rejects.toThrow(/online/);
    expect(engine.getSnapshot().status.pending).toBe(pending);
    await useMutation(api.jlpt.start)({ paperId: paper._id });
    expect(engine.getSnapshot().status.pending).toBe(pending + 1);
    expect(engine.getSnapshot().data!.jlptAttempts).toHaveLength(1);
    expect(hookTransport.mutation).not.toHaveBeenCalled();
  });
});

const jlptPaper: PaperInput = {
  title: 'Simulado autoral N5',
  level: 'N5',
  source: 'Material autoral',
  questions: [
    {
      id: 'vocab',
      skill: 'vocabulary',
      kind: 'kanji_reading',
      prompt: '山の読み方は？',
      choices: ['やま', 'かわ', 'うみ', 'そら'],
      correctChoice: 0,
      explanation: '山 é やま.',
    },
    {
      id: 'grammar',
      skill: 'grammar',
      kind: 'grammar_form',
      prompt: '学校（　）行きます。',
      choices: ['へ', 'を', 'が', 'で'],
      correctChoice: 0,
      explanation: 'へ indica direção.',
    },
    {
      id: 'reading',
      skill: 'reading',
      kind: 'short_passage',
      passage: '朝七時に起きます。',
      prompt: '何時に起きますか。',
      choices: ['七時', '八時', '九時', '十時'],
      correctChoice: 0,
      explanation: 'O texto diz 七時.',
    },
    {
      id: 'listening',
      skill: 'listening',
      kind: 'quick_response',
      prompt: '音声を聞いて、答えてください。',
      choices: ['はい', 'いいえ', 'ありがとうございます'],
      correctChoice: 2,
      explanation: 'Agradecimento.',
      audioUrl: 'https://example.com/author-listening.mp3',
    },
  ],
};

function saved(): Saved {
  return {
    version: 1,
    accountKey: profile.tokenIdentifier,
    base: { ...emptyData(profile), cards: [clone(water)] },
    queue: [],
    aliases: {},
    lastSyncedAt: 1,
  };
}

describe('offline library validation matches the server rules', () => {
  it('distinguishes writing systems while rejecting repeated kanji across regional Japanese tags and archived cards', () => {
    const data = saved().base;
    const generic = {
      ...clone(water),
      symbol: 'A',
      writingSystem: 'Latn',
      front: 'A',
      back: 'A',
      details: { kind: 'generic' as const, readings: ['a'] },
    };
    applyLocal(data, {
      type: 'card.create',
      category: 'alphabet',
      localId: 'local:latin001',
      card: generic,
    });
    applyLocal(data, {
      type: 'card.create',
      category: 'alphabet',
      localId: 'local:hangul001',
      card: { ...generic, writingSystem: 'Hang' },
    });
    expect(data.cards).toHaveLength(3);
    expect(() =>
      applyLocal(data, {
        type: 'card.create',
        category: 'alphabet',
        localId: 'local:waterjp001',
        card: { ...water, language: ' JA-jp ' },
      }),
    ).toThrow('já está');
    applyLocal(data, {
      type: 'card.archive',
      category: 'alphabet',
      id: 'local:latin001',
      expectedContentVersion: 1,
      expectedArchived: false,
      archived: true,
    });
    expect(() =>
      applyLocal(data, {
        type: 'card.create',
        category: 'alphabet',
        localId: 'local:latin002',
        card: generic,
      }),
    ).toThrow('arquivados');
    const unchanged = clone(data);
    expect(() =>
      applyLocal(data, {
        type: 'card.update',
        category: 'alphabet',
        id: 'local:hangul001',
        expectedContentVersion: 1,
        expectedArchived: false,
        patch: { writingSystem: 'Latn' },
      }),
    ).toThrow('arquivados');
    expect(data).toEqual(unchanged);
    applyLocal(data, {
      type: 'card.update',
      category: 'alphabet',
      id: 'local:latin001',
      expectedContentVersion: 1,
      expectedArchived: true,
      patch: { meanings: undefined },
    });
    expect(
      data.cards.find((card) => card._id === 'local:latin001')?.contentVersion,
    ).toBe(1);
  });

  it('uses vocabulary identity rather than accent-insensitive search and only folds kana in readings', () => {
    const data = emptyData(profile);
    const create = (localId: string, card: VocabularyInput) =>
      applyLocal(data, {
        type: 'card.create',
        category: 'vocabulary',
        localId,
        card,
      });
    create('local:accent001', {
      ...vocabularyInput,
      language: 'pt',
      expression: 'café',
      reading: 'café',
    });
    create('local:accent002', {
      ...vocabularyInput,
      language: 'pt',
      expression: 'cafe',
      reading: 'cafe',
    });
    create('local:kana001', {
      ...vocabularyInput,
      expression: 'カナ',
      reading: 'かな',
    });
    create('local:kana002', {
      ...vocabularyInput,
      expression: 'かな',
      reading: 'かな',
    });
    create('local:width001', {
      ...vocabularyInput,
      expression: 'ＡＢＣ',
      reading: 'お と',
    });
    expect(data.cards).toHaveLength(5);
    expect(() =>
      create('local:width002', {
        ...vocabularyInput,
        expression: 'abc',
        reading: 'オ  ト',
      }),
    ).toThrow('já está');
    expect(() =>
      create('local:accent003', {
        ...vocabularyInput,
        language: 'pt',
        expression: 'CAFE\u0301',
        reading: 'CAFE\u0301',
      }),
    ).toThrow('já está');
    const card = data.cards.find((card) => card._id === 'local:width001');
    expect(card).toMatchObject({ expressionKey: 'abc', readingKey: 'お と' });
  });

  it('rejects vocabulary identity collisions during edits without changing the old content and preserves omitted translations', () => {
    const data = emptyData(profile);
    applyLocal(data, {
      type: 'card.create',
      category: 'vocabulary',
      localId: 'local:school001',
      card: vocabularyInput,
    });
    applyLocal(data, {
      type: 'card.create',
      category: 'vocabulary',
      localId: 'local:house001',
      card: { ...vocabularyInput, expression: '家', reading: 'いえ' },
    });
    applyLocal(data, {
      type: 'card.archive',
      category: 'vocabulary',
      id: 'local:school001',
      expectedContentVersion: 1,
      expectedArchived: false,
      archived: true,
    });
    const unchanged = clone(data);
    expect(() =>
      applyLocal(data, {
        type: 'card.update',
        category: 'vocabulary',
        id: 'local:house001',
        expectedContentVersion: 1,
        expectedArchived: false,
        patch: { expression: '学校', reading: 'ガッコウ' },
      }),
    ).toThrow('arquivados');
    expect(data).toEqual(unchanged);
    applyLocal(data, {
      type: 'card.update',
      category: 'vocabulary',
      id: 'local:house001',
      expectedContentVersion: 1,
      expectedArchived: false,
      patch: {
        front: undefined,
        translations: { pt: ['casa'], en: undefined },
      },
    });
    expect(
      data.cards.find((card) => card._id === 'local:house001'),
    ).toMatchObject({
      expression: '家',
      reading: 'いえ',
      front: '家',
      translations: { pt: ['casa'], en: ['school'] },
      contentVersion: 2,
    });
  });

  it('allows multiple uses of one grammar title while validating edits and preserving omitted fields', () => {
    const data = emptyData(profile);
    for (const localId of ['local:grammar001', 'local:grammar002'])
      applyLocal(data, {
        type: 'card.create',
        category: 'grammar',
        localId,
        card: grammarInput,
      });
    applyLocal(data, {
      type: 'card.update',
      category: 'grammar',
      id: 'local:grammar002',
      expectedContentVersion: 1,
      expectedArchived: false,
      patch: {
        title: undefined,
        explanation: 'Primeira linha.\nSegunda linha.',
      },
    });
    expect(data.cards[1]).toMatchObject({
      title: grammarInput.title,
      explanation: 'Primeira linha.\nSegunda linha.',
      contentVersion: 2,
    });
    const unchanged = clone(data);
    expect(() =>
      applyLocal(data, {
        type: 'card.update',
        category: 'grammar',
        id: 'local:grammar002',
        expectedContentVersion: 2,
        expectedArchived: false,
        patch: { shortExplanation: 'a'.repeat(2001) },
      }),
    ).toThrow('2000');
    expect(data).toEqual(unchanged);
  });

  it('normalizes library language, level and search terms just like online queries', () => {
    const data = emptyData(profile);
    applyLocal(data, {
      type: 'card.create',
      category: 'vocabulary',
      localId: 'local:queryword001',
      card: { ...vocabularyInput, language: 'ja-jp' },
    });
    applyLocal(data, {
      type: 'card.create',
      category: 'grammar',
      localId: 'local:querygrammar001',
      card: grammarInput,
    });
    expect(
      matches(data.cards[0], {
        language: ' JA ',
        level: ' n5 ',
        terms: [' ESCOLA '],
        operator: 'AND',
      }),
    ).toBe(true);
    expect(
      matches(data.cards[0], { language: 'ja-jp', reading: 'ガッコウ' }),
    ).toBe(true);
    expect(matches(data.cards[0], { language: 'ja-jp', reading: 'いえ' })).toBe(
      false,
    );
    expect(
      matches(data.cards[1], {
        language: 'JA',
        terms: [' inexistente ', ' PERMISSAO '],
        operator: 'OR',
      }),
    ).toBe(true);
    expect(
      matches(data.cards[1], {
        terms: ['inexistente', 'permissão'],
        operator: 'AND',
      }),
    ).toBe(false);
    expect(() => matches(data.cards[0], { level: 'n6' })).toThrow('N1 a N5');
    expect(() =>
      matches(data.cards[1], { terms: Array(25).fill('a') }),
    ).toThrow('24');
    expect(
      matches(water, {
        language: ' JA ',
        writingSystem: 'hani',
        reading: 'ミズ',
        level: 'n5',
      }),
    ).toBe(true);
  });
});
function start(card = water): OfflineCommand {
  return {
    type: 'study.start',
    localId: sessionId,
    mode: 'direct',
    order: 'sorted',
    filters: { category: 'alphabet', language: 'ja', level: 'N5' },
    createdAt: 10,
    queue: [
      { localId: presentationId, cardId: card._id, snapshot: snapshotOf(card) },
    ],
  };
}
function reveal(revision = 0): OfflineCommand {
  return {
    type: 'study.reveal',
    sessionId,
    presentationId,
    expectedRevision: revision,
    occurredAt: 11 + revision * 10,
  };
}
function rate(
  rating: 'correct' | 'partial' | 'incorrect',
  revision = 0,
): OfflineCommand {
  return {
    type: 'study.rate',
    sessionId,
    presentationId,
    expectedRevision: revision,
    occurredAt: 12 + revision * 10,
    rating,
  };
}
function undo(): OfflineCommand {
  return {
    type: 'study.undo',
    sessionId,
    presentationId,
    expectedRevision: 0,
    occurredAt: 13,
  };
}

describe('offline study and library', () => {
  it('replays the durable queue after a cold restart without mutating its saved base', () => {
    const stored = saved();
    stored.queue = [start(), reveal(), rate('correct')].map(
      (command, index) => ({
        id: `command${index}`,
        command,
      }),
    );
    const before = JSON.stringify(stored);
    const projected = project(stored);
    expect(JSON.stringify(stored)).toBe(before);
    expect(project(JSON.parse(before))).toEqual(projected);
    expect(projection(projected, sessionId).session).toMatchObject({
      status: 'completed',
      answered: 1,
      correct: 1,
      position: 1,
    });
    expect(projected.stats).toHaveLength(1);
    expect(projected.attempts).toHaveLength(1);
    expect(
      localQuery(projected, 'studyProgress:overview', {}, {}),
    ).toMatchObject({
      totalCards: 1,
      studiedCards: 1,
      correct: 1,
      attempts: 1,
    });
  });

  it('supports creating, editing, studying and correcting the same card before the first sync', () => {
    const stored = saved();
    stored.base.cards = [];
    const creation: OfflineCommand = {
      type: 'card.create',
      category: 'alphabet',
      localId: 'local:watercard0001',
      card: water,
    };
    const edit: OfflineCommand = {
      type: 'card.update',
      category: 'alphabet',
      id: 'local:watercard0001',
      expectedContentVersion: 1,
      expectedArchived: false,
      patch: { meanings: ['água fresca'] },
    };
    const draft = clone(stored.base);
    applyLocal(draft, creation);
    applyLocal(draft, edit);
    const edited = draft.cards[0];
    if (!('symbol' in edited)) throw new Error('Expected alphabet card');
    const commands = [
      creation,
      edit,
      start(edited),
      reveal(),
      rate('incorrect'),
      undo(),
      reveal(1),
      rate('partial', 1),
    ];
    stored.queue = commands.map((command, index) => ({
      id: `operation${index}`,
      command,
    }));
    const result = project(stored);
    expect(result.cards[0]).toMatchObject({
      contentVersion: 2,
      meanings: ['água fresca'],
    });
    expect(result.stats[0]).toMatchObject({
      correct: 0,
      partial: 1,
      incorrect: 0,
      attempts: 1,
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      rating: 'partial',
      mode: 'direct',
      snapshot: { contentVersion: 2, meanings: ['água fresca'] },
    });
    expect(projection(result, sessionId).session).toMatchObject({
      revision: 1,
      status: 'completed',
      answered: 1,
      correct: 0,
      partial: 1,
      incorrect: 0,
    });
  });

  it('keeps the shown snapshot when content changes and omits newly archived unseen cards', () => {
    const stored = saved();
    const fire: Doc<'alphabetCards'> = {
      ...clone(water),
      _id: 'fire-server' as Id<'alphabetCards'>,
      symbol: '火',
      sortKey: 'ひ',
    };
    stored.base.cards.push(fire);
    const command = start();
    if (command.type !== 'study.start') throw new Error('Expected start');
    command.queue.push({
      localId: 'local:presentation0002',
      cardId: fire._id,
      snapshot: snapshotOf(fire),
    });
    const commands: OfflineCommand[] = [
      command,
      {
        type: 'card.update',
        category: 'alphabet',
        id: water._id,
        patch: { meanings: ['nova definição'] },
        expectedContentVersion: 1,
        expectedArchived: false,
      },
      {
        type: 'card.archive',
        category: 'alphabet',
        id: fire._id,
        archived: true,
        expectedContentVersion: 1,
        expectedArchived: false,
      },
      reveal(),
      rate('correct'),
    ];
    stored.queue = commands.map((command, index) => ({
      id: `snapshot${index}`,
      command,
    }));
    const result = project(stored);
    expect(result.attempts[0].snapshot).toMatchObject({
      meanings: ['água'],
      contentVersion: 1,
    });
    expect(result.cards[0]).toMatchObject({
      meanings: ['nova definição'],
      contentVersion: 2,
    });
    expect(projection(result, sessionId).session).toMatchObject({
      answered: 1,
      skipped: 1,
      status: 'completed',
    });
    expect(result.stats).toHaveLength(1);
    applyLocal(result, undo());
    expect(projection(result, sessionId).session).toMatchObject({
      answered: 0,
      skipped: 0,
      revision: 1,
      status: 'active',
    });
    expect(result.stats).toHaveLength(0);
    expect(result.attempts).toHaveLength(0);
  });

  it('requires reveal, rejects stale revisions and prevents counting the same answer twice', () => {
    const data = saved().base;
    applyLocal(data, start());
    const unchanged = clone(data);
    expect(() => applyLocal(data, rate('correct'))).toThrow('Revele');
    expect(data).toEqual(unchanged);
    applyLocal(data, reveal());
    applyLocal(data, rate('correct'));
    expect(() => applyLocal(data, rate('correct'))).toThrow();
    expect(data.attempts).toHaveLength(1);
    applyLocal(data, undo());
    expect(() => applyLocal(data, reveal())).toThrow('A sessão mudou');
    applyLocal(data, reveal(1));
    applyLocal(data, rate('incorrect', 1));
    expect(data.attempts).toHaveLength(1);
    expect(data.stats[0]).toMatchObject({
      correct: 0,
      incorrect: 1,
      attempts: 1,
    });
  });

  it('resolves local aliases consistently for queries, queued study and undo', () => {
    const stored = saved();
    stored.aliases = {
      'local:watercard0001': water._id,
      [sessionId]: 'server-session',
      [presentationId]: 'server-presentation',
    };
    const command = start();
    if (command.type !== 'study.start') throw new Error('Expected start');
    command.queue[0].cardId = 'local:watercard0001';
    stored.queue = [command, reveal(), rate('correct'), undo()].map(
      (command, index) => ({ id: `alias${index}`, command }),
    );
    const result = project(stored);
    expect(
      localQuery(
        result,
        'alphabet:get',
        { id: 'local:watercard0001' },
        stored.aliases,
      ),
    ).toEqual(water);
    expect(
      localQuery(result, 'study:current', { sessionId }, stored.aliases),
    ).toMatchObject({
      session: { _id: 'server-session', revision: 1, answered: 0 },
      presentation: { _id: 'server-presentation', cardId: water._id },
    });
    expect(result.stats).toHaveLength(0);
  });
});

class MemoryPersistence implements Persistence {
  writes: Saved[] = [];
  failNextWrite = false;
  constructor(public stored: Saved | null = saved()) {}
  async read() {
    return clone(this.stored);
  }
  async write(value: Saved) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Sem espaço para salvar neste aparelho.');
    }
    this.stored = clone(value);
    this.writes.push(clone(value));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createEngine(
  storage = new MemoryPersistence(),
  accountKey = profile.tokenIdentifier,
) {
  let counter = 0;
  return new OfflineEngine({
    accountKey,
    storage,
    uuid: () => `operation-${++counter}`,
    now: () => 100 + counter,
  });
}

/** A deterministic receipt server: it applies each operation once, even after a lost ACK. */
function server(base = saved().base) {
  const data = clone(base);
  const aliases: Record<string, string> = {};
  const receipts = new Map<string, { command: OfflineCommand; reply: Reply }>();
  const requests: { id: string; command: OfflineCommand }[] = [];
  const send = async (id: string, command: OfflineCommand): Promise<Reply> => {
    requests.push({ id, command: clone(command) });
    const receipt = receipts.get(id);
    if (receipt) {
      expect(command).toEqual(receipt.command);
      return clone(receipt.reply);
    }
    const mappings: Reply['mappings'] = [];
    const map = (localId: string) => {
      const serverId = `server-${localId.slice(6)}`;
      aliases[localId] = serverId;
      mappings.push({ localId, serverId });
    };
    if (command.type === 'card.create') map(command.localId);
    if (command.type === 'study.start') {
      map(command.localId);
      for (const entry of command.queue) map(entry.localId);
    }
    applyLocal(data, command, aliases);
    const reply: Reply = { mappings };
    if (command.type === 'card.create')
      reply.card = data.cards.find((c) => c._id === aliases[command.localId]);
    if (command.type === 'card.update' || command.type === 'card.archive')
      reply.card = data.cards.find(
        (c) => c._id === (aliases[command.id] ?? command.id),
      );
    if (command.type === 'study.start')
      reply.session = data.sessions.find(
        (s) => s._id === aliases[command.localId],
      );
    if ('sessionId' in command)
      reply.projection = projection(
        data,
        aliases[command.sessionId] ?? command.sessionId,
      );
    receipts.set(id, { command: clone(command), reply: clone(reply) });
    return clone(reply);
  };
  return { data, requests, send, pull: async () => clone(data) };
}

describe('offline durable queue and synchronization', () => {
  it('requires an explicit reading opt-out and derives vocabulary faces through editing, restart and synchronization', async () => {
    const storage = new MemoryPersistence({
      ...saved(),
      base: emptyData(profile),
    });
    const engine = createEngine(storage);
    const remote = server(emptyData(profile));
    await engine.load();
    const before = clone(engine.getSnapshot());
    await expect(
      engine.mutate('vocabulary:create', {
        card: { ...vocabularyInput, reading: '' },
      }),
    ).rejects.toThrow('Leitura');
    expect(engine.getSnapshot()).toEqual(before);
    expect(storage.writes).toHaveLength(0);

    await engine.mutate('vocabulary:create', {
      card: {
        ...vocabularyInput,
        reading: '',
        readingOmitted: true,
        front: 'Frente antiga personalizada',
        back: 'Verso antigo personalizado',
        sortKey: 'manual',
      },
    });
    const localId = engine.getSnapshot().data!.cards[0]._id;
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      reading: '',
      readingOmitted: true,
      front: '学校',
      back: 'Português: escola\nEnglish: school',
      sortKey: '',
    });
    const omitted = clone(engine.getSnapshot());
    const disk = clone(storage.stored);
    await expect(
      engine.mutate('vocabulary:update', {
        id: localId,
        patch: { readingOmitted: false },
      }),
    ).rejects.toThrow('Leitura');
    expect(engine.getSnapshot()).toEqual(omitted);
    expect(storage.stored).toEqual(disk);

    await engine.mutate('vocabulary:update', {
      id: localId,
      patch: {
        expression: '大学',
        reading: 'だいがく',
        readingOmitted: false,
        translations: { pt: ['universidade'], en: ['university'] },
        examples: [
          {
            text: '大学に行く。',
            reading: 'だいがくにいく。',
            meaning: 'Vou à universidade.',
          },
        ],
      },
    });
    const expected = {
      expression: '大学',
      reading: 'だいがく',
      readingOmitted: false,
      front: '大学',
      back: '読み方 · Leitura: だいがく\nPortuguês: universidade\nEnglish: university\nExemplos\n大学に行く。\nだいがくにいく。\nVou à universidade.',
      sortKey: 'だいがく',
      contentVersion: 2,
    };
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject(expected);
    const restarted = createEngine(storage);
    await restarted.load();
    expect(restarted.getSnapshot().data).toEqual(engine.getSnapshot().data);
    await restarted.synchronize(remote.send, remote.pull, () => true);
    expect(restarted.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
    });
    expect(remote.data.cards).toHaveLength(1);
    expect(remote.data.cards[0]).toMatchObject(expected);
    expect(
      localQuery(
        restarted.getSnapshot().data!,
        'vocabulary:get',
        { id: localId },
        restarted.getSnapshot().saved!.aliases,
      ),
    ).toMatchObject(expected);
  });

  it('keeps grammar creation order and frozen study content across edits, restarts and a lost creation acknowledgment', async () => {
    const storage = new MemoryPersistence({
      ...saved(),
      base: emptyData(profile),
    });
    let time = 1_000;
    let counter = 0;
    const makeEngine = () =>
      new OfflineEngine({
        accountKey: profile.tokenIdentifier,
        storage,
        uuid: () => `grammar-lifecycle-${++counter}`,
        now: () => time,
      });
    const engine = makeEngine();
    const remote = server(emptyData(profile));
    await engine.load();
    await engine.mutate('grammar:create', {
      card: {
        ...grammarInput,
        title: '〜わけではない',
        shortExplanation: 'Não significa que...',
        sortKey: 'わ',
      },
    });
    time = 2_000;
    await engine.mutate('grammar:create', {
      card: {
        ...grammarInput,
        title: '〜あいだ',
        examples: [],
        shortExplanation: '',
        sortKey: 'あ',
      },
    });
    const [first, second] = engine.getSnapshot().data!.cards;
    const expectedOrder = [
      { title: '〜わけではない', createdAt: 1_000 },
      { title: '〜あいだ', createdAt: 2_000 },
    ];
    expect(
      localQuery(engine.getSnapshot().data!, 'grammar:search', {}, {}),
    ).toMatchObject(expectedOrder);
    expect(storage.stored!.queue.map(({ command }) => command)).toMatchObject([
      { type: 'card.create', createdAt: 1_000 },
      { type: 'card.create', createdAt: 2_000 },
    ]);
    time = 3_000;
    await engine.mutate('study:start', {
      category: 'grammar',
      mode: 'direct',
      order: 'sorted',
      limit: 2,
    });
    const data = engine.getSnapshot().data!;
    expect(data.presentations.map((p) => p.cardId)).toEqual([
      first._id,
      second._id,
    ]);
    const frozen = clone(data.presentations[0].snapshot);
    expect(frozen).toMatchObject({
      category: 'grammar',
      contentVersion: 1,
      front: '〜わけではない',
      back: 'Não significa que...\n\nExemplos\n座ってもいいですか。\nPosso sentar?',
      explanation: grammarInput.explanation,
    });
    await engine.mutate('grammar:update', {
      id: first._id,
      patch: { shortExplanation: '', examples: [] },
    });
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      shortExplanation: '',
      examples: [],
      back: '',
      front: '〜わけではない',
      explanation: grammarInput.explanation,
      createdAt: 1_000,
      contentVersion: 2,
    });
    const args = {
      sessionId: data.sessions[0]._id,
      presentationId: data.presentations[0]._id,
      expectedRevision: 0,
    };
    await engine.mutate('study:reveal', args);
    await engine.mutate('study:rate', { ...args, rating: 'correct' });
    expect(engine.getSnapshot().data!.attempts[0].snapshot).toEqual(frozen);

    time = 90_000;
    const restarted = makeEngine();
    await restarted.load();
    expect(restarted.getSnapshot().data).toEqual(engine.getSnapshot().data);
    await restarted.synchronize(
      async (id, command) => {
        await remote.send(id, command);
        throw new Error('ACK da criação perdido');
      },
      remote.pull,
      () => true,
    );
    expect(remote.data.cards).toHaveLength(1);
    expect(restarted.getSnapshot().status.error).toBe('ACK da criação perdido');
    const retry = clone(storage.stored!.queue[0]);
    const recovered = makeEngine();
    await recovered.load();
    await recovered.synchronize(remote.send, remote.pull, () => true);
    expect(remote.requests[1]).toEqual({ id: retry.id, command: retry.sent });
    expect(recovered.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
    });
    const result = recovered.getSnapshot();
    expect(
      localQuery(result.data!, 'grammar:search', {}, result.saved!.aliases),
    ).toMatchObject(expectedOrder);
    expect(remote.data.cards).toHaveLength(2);
    expect(remote.data.cards.map((card) => card.createdAt)).toEqual([
      1_000, 2_000,
    ]);
    expect(remote.data.presentations[0].snapshot).toEqual(frozen);
    expect(remote.data.attempts[0].snapshot).toEqual(frozen);
    expect(
      localQuery(
        result.data!,
        'grammar:get',
        { id: first._id },
        result.saved!.aliases,
      ),
    ).toMatchObject({
      shortExplanation: '',
      examples: [],
      back: '',
      explanation: grammarInput.explanation,
      contentVersion: 2,
    });
    expect(result.data!.presentations.map((p) => p.cardId)).toEqual(
      remote.data.cards.map((card) => card._id),
    );
    const cleanRestart = makeEngine();
    await cleanRestart.load();
    expect(cleanRestart.getSnapshot().data).toEqual(result.data);
  });

  it('canonicalizes a legacy live card without rewriting its historical custom faces during load and a later edit', async () => {
    const legacy: Doc<'grammarCards'> = {
      ...grammarInput,
      examples: grammarInput.examples ?? [],
      front: 'Pergunta personalizada antiga',
      back: 'Resposta personalizada antiga',
      sortKey: 'てもいい',
      readingSortKey: libraryReadingSortKey('てもいい'),
      _id: 'legacy-grammar' as Id<'grammarCards'>,
      _creationTime: 1,
      ownerId: profile._id,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
      contentVersion: 1,
    };
    const base = emptyData(profile);
    base.cards.push(legacy);
    applyLocal(base, {
      type: 'study.start',
      localId: sessionId,
      mode: 'direct',
      order: 'sorted',
      filters: { category: 'grammar' },
      createdAt: 10,
      queue: [
        {
          localId: presentationId,
          cardId: legacy._id,
          snapshot: {
            ...grammarInput,
            examples: legacy.examples,
            category: 'grammar',
            contentVersion: 1,
            front: legacy.front,
            back: legacy.back,
            sortKey: legacy.sortKey,
          },
        },
      ],
    });
    applyLocal(base, reveal());
    applyLocal(base, rate('partial'));
    const historical = clone(base.attempts[0].snapshot);
    const storage = new MemoryPersistence({ ...saved(), base });
    const engine = createEngine(storage);
    await engine.load();
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      front: grammarInput.title,
      back: 'Exemplos\n座ってもいいですか。\nPosso sentar?',
    });
    expect(engine.getSnapshot().data!.attempts[0].snapshot).toEqual(historical);
    expect(engine.getSnapshot().data!.presentations[0].snapshot).toEqual(
      historical,
    );
    await engine.mutate('grammar:update', {
      id: legacy._id,
      patch: { shortExplanation: 'Você pode...', examples: [] },
    });
    const restarted = createEngine(storage);
    await restarted.load();
    expect(restarted.getSnapshot().data!.cards[0]).toMatchObject({
      front: grammarInput.title,
      back: 'Você pode...',
    });
    expect(restarted.getSnapshot().data!.attempts[0].snapshot).toEqual(
      historical,
    );
    expect(restarted.getSnapshot().data!.presentations[0].snapshot).toEqual(
      historical,
    );
    expect(storage.stored!.base.cards[0]).toEqual(legacy);
  });

  it('rejects oversized UTF-8 sessions before journaling and allows a smaller session with the same valid cards', async () => {
    const base = emptyData(profile);
    for (let index = 0; index < 80; index++) {
      applyLocal(base, {
        type: 'card.create',
        category: 'vocabulary',
        localId: `local:largecard-${index}`,
        card: {
          ...vocabularyInput,
          expression: `学校${index}`,
          examples: [
            { text: '語'.repeat(1000) },
            { text: '文'.repeat(1000) },
            { text: '例'.repeat(1000) },
          ],
        },
      });
    }
    // Every example fits its domain limit; only the
    // frozen multi-card payload exceeds the transport limit in UTF-8 bytes.
    const serializedCards = JSON.stringify(base.cards);
    expect(serializedCards.length).toBeLessThan(699_000);
    expect(
      new TextEncoder().encode(serializedCards).byteLength,
    ).toBeGreaterThan(699_000);
    const storage = new MemoryPersistence({ ...saved(), base });
    const engine = createEngine(storage);
    await engine.load();
    const before = clone(engine.getSnapshot());
    const diskBefore = clone(storage.stored);
    await expect(
      engine.mutate('study:start', {
        category: 'vocabulary',
        mode: 'direct',
        order: 'sorted',
        limit: 100,
      }),
    ).rejects.toThrow('Reduza o número de cards');
    expect(engine.getSnapshot()).toEqual(before);
    expect(storage.stored).toEqual(diskBefore);
    expect(storage.writes).toHaveLength(0);

    await engine.mutate('study:start', {
      category: 'vocabulary',
      mode: 'direct',
      order: 'sorted',
      limit: 10,
    });
    expect(engine.getSnapshot().status.pending).toBe(1);
    expect(engine.getSnapshot().data!.sessions[0]).toMatchObject({
      total: 10,
      status: 'active',
    });
    expect(storage.stored!.queue).toHaveLength(1);
  });

  it('resets the visible study epoch only after a chosen cloud rewind is durably saved', async () => {
    const base = saved().base;
    applyLocal(base, start());
    const storage = new MemoryPersistence({ ...saved(), base });
    const engine = createEngine(storage);
    await engine.load();
    const args = { sessionId, presentationId, expectedRevision: 0 };
    await engine.mutate('study:reveal', args);
    await engine.mutate('study:rate', { ...args, rating: 'incorrect' });
    await engine.mutate('study:undo', args);
    await engine.mutate('study:reveal', { ...args, expectedRevision: 1 });
    await engine.mutate('study:rate', {
      ...args,
      expectedRevision: 1,
      rating: 'partial',
    });
    expect(engine.getSnapshot().data!.sessions[0]).toMatchObject({
      revision: 1,
      position: 1,
    });

    // Another device has corrected its first answer too, but has not answered again.
    const cloud = clone(base);
    applyLocal(cloud, reveal());
    applyLocal(cloud, rate('correct'));
    applyLocal(cloud, undo());
    await engine.synchronize(
      async () => {
        throw {
          data: {
            code: 'CONFLICT',
            message: 'A sessão mudou em outro aparelho.',
          },
        };
      },
      async () => clone(cloud),
      () => true,
    );
    const before = clone(engine.getSnapshot());
    const diskBefore = clone(storage.stored);
    storage.failNextWrite = true;
    await expect(
      engine.resolveConflict('cloud', async () => clone(cloud)),
    ).rejects.toThrow('Sem espaço');
    expect(engine.getSnapshot()).toEqual(before);
    expect(storage.stored).toEqual(diskBefore);
    expect(engine.getSnapshot().status.resetVersion).toBe(0);

    await engine.resolveConflict('cloud', async () => clone(cloud));
    expect(engine.getSnapshot().status).toMatchObject({
      resetVersion: 1,
      pending: 0,
      conflict: null,
    });
    expect(engine.getSnapshot().data!.sessions[0]).toMatchObject({
      revision: 1,
      position: 0,
      status: 'active',
    });
    expect(
      engine.getSnapshot().data!.presentations[0].revealedAt,
    ).toBeUndefined();
    expect(storage.stored!.queue).toEqual([]);
    expect(storage.stored!.base).toEqual(cloud);
  });

  it('keeps a queued command identical to its durable value if the caller later edits its draft object', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    const patch = { meanings: ['água doce'] };
    await engine.mutate('alphabet:update', { id: water._id, patch });
    const persisted = clone(storage.stored!.queue[0].command);
    patch.meanings.push('mudança posterior no formulário');
    expect(engine.getSnapshot().saved!.queue[0].command).toEqual(persisted);
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      meanings: ['água doce'],
    });
  });

  it('synchronizes a newly created card, an edit, and a corrected study answer in original order', async () => {
    const storage = new MemoryPersistence({
      ...saved(),
      base: emptyData(profile),
    });
    const engine = createEngine(storage);
    const remote = server(emptyData(profile));
    await engine.load();
    await engine.mutate('alphabet:create', { card: water });
    const cardId = engine.getSnapshot().data!.cards[0]._id;
    await engine.mutate('alphabet:update', {
      id: cardId,
      patch: { meanings: ['água doce'] },
    });
    await engine.mutate('study:start', {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const data = engine.getSnapshot().data!;
    const args = {
      sessionId: data.sessions[0]._id,
      presentationId: data.presentations[0]._id,
      expectedRevision: 0,
    };
    await engine.mutate('study:reveal', args);
    await engine.mutate('study:rate', { ...args, rating: 'incorrect' });
    await engine.mutate('study:undo', args);
    await engine.mutate('study:reveal', { ...args, expectedRevision: 1 });
    await engine.mutate('study:rate', {
      ...args,
      expectedRevision: 1,
      rating: 'partial',
    });
    await engine.synchronize(remote.send, remote.pull, () => true);
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
    });
    expect(remote.requests.map(({ command }) => command.type)).toEqual([
      'card.create',
      'card.update',
      'study.start',
      'study.reveal',
      'study.rate',
      'study.undo',
      'study.reveal',
      'study.rate',
    ]);
    expect(remote.data.cards).toHaveLength(1);
    expect(remote.data.cards[0]).toMatchObject({
      contentVersion: 2,
      meanings: ['água doce'],
    });
    expect(remote.data.attempts).toHaveLength(1);
    expect(remote.data.attempts[0]).toMatchObject({
      rating: 'partial',
      snapshot: { contentVersion: 2 },
    });
    expect(remote.data.stats[0]).toMatchObject({
      correct: 0,
      partial: 1,
      incorrect: 0,
      attempts: 1,
    });
    expect(engine.getSnapshot().data).toEqual(remote.data);
  });

  it('persists a response before advancing and leaves the screen and queue unchanged when disk write fails', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    await engine.mutate('study:start', {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
      category: 'alphabet',
    });
    let data = engine.getSnapshot().data!;
    const session = data.sessions[0];
    const presentation = data.presentations[0];
    const args = {
      sessionId: session._id,
      presentationId: presentation._id,
      expectedRevision: 0,
    };
    await engine.mutate('study:reveal', args);
    const before = clone(engine.getSnapshot());
    const diskBefore = clone(storage.stored);
    storage.failNextWrite = true;
    await expect(
      engine.mutate('study:rate', { ...args, rating: 'correct' }),
    ).rejects.toThrow('Sem espaço');
    expect(engine.getSnapshot()).toEqual(before);
    expect(storage.stored).toEqual(diskBefore);
    await engine.mutate('study:rate', { ...args, rating: 'correct' });
    data = engine.getSnapshot().data!;
    expect(data.sessions[0]).toMatchObject({
      position: 1,
      answered: 1,
      status: 'completed',
    });
    const restarted = createEngine(storage);
    await restarted.load();
    expect(restarted.getSnapshot().data).toEqual(data);
    expect(restarted.getSnapshot().status.pending).toBe(3);
  });

  it('retries the identical operation after a lost acknowledgment and never creates or counts twice', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    const remote = server();
    await engine.mutate('study:start', {
      mode: 'direct',
      order: 'sorted',
      limit: 1,
    });
    const data = engine.getSnapshot().data!;
    const args = {
      sessionId: data.sessions[0]._id,
      presentationId: data.presentations[0]._id,
      expectedRevision: 0,
    };
    await engine.mutate('study:reveal', args);
    await engine.mutate('study:rate', { ...args, rating: 'correct' });
    let lost = false;
    await engine.synchronize(
      async (id, command) => {
        const reply = await remote.send(id, command);
        if (command.type === 'study.rate' && !lost) {
          lost = true;
          throw new Error('Conexão caiu depois de salvar.');
        }
        return reply;
      },
      remote.pull,
      () => true,
    );
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 1,
      error: 'Conexão caiu depois de salvar.',
    });
    expect(remote.data.stats[0].attempts).toBe(1);
    const sentBefore = clone(storage.stored!.queue[0]);
    const restarted = createEngine(storage);
    await restarted.load();
    await restarted.synchronize(remote.send, remote.pull, () => true);
    expect(restarted.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
      conflict: null,
    });
    expect(remote.requests.at(-1)).toEqual({
      id: sentBefore.id,
      command: sentBefore.sent,
    });
    expect(remote.data.attempts).toHaveLength(1);
    expect(remote.data.stats[0]).toMatchObject({ correct: 1, attempts: 1 });
    expect(restarted.getSnapshot().data!.stats[0]).toMatchObject({
      correct: 1,
      attempts: 1,
    });
  });

  it('retries safely when the server replied but persisting its acknowledgment failed', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    const remote = server();
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['água doce'] },
    });
    await engine.synchronize(
      async (id, command) => {
        const reply = await remote.send(id, command);
        storage.failNextWrite = true;
        return reply;
      },
      remote.pull,
      () => true,
    );
    expect(engine.getSnapshot().status.pending).toBe(1);
    expect(remote.data.cards[0].contentVersion).toBe(2);
    const pending = clone(storage.stored!.queue[0]);
    await engine.synchronize(remote.send, remote.pull, () => true);
    expect(remote.requests[1]).toEqual({
      id: pending.id,
      command: pending.sent,
    });
    expect(remote.data.cards[0].contentVersion).toBe(2);
    expect(engine.getSnapshot().status.pending).toBe(0);
  });

  it('serializes sync while accepting a newer local edit during an in-flight create', async () => {
    const storage = new MemoryPersistence({
      ...saved(),
      base: emptyData(profile),
    });
    const engine = createEngine(storage);
    const remote = server(emptyData(profile));
    await engine.load();
    await engine.mutate('alphabet:create', { card: water });
    const createdId = engine.getSnapshot().data!.cards[0]._id;
    const began = deferred<void>();
    const response = deferred<Reply>();
    let calls = 0;
    const send = async (id: string, command: OfflineCommand) => {
      calls += 1;
      const reply = await remote.send(id, command);
      if (calls === 1) {
        began.resolve();
        await response.promise;
      }
      return reply;
    };
    const syncing = engine.synchronize(send, remote.pull, () => true);
    await began.promise;
    await engine.mutate('alphabet:update', {
      id: createdId,
      patch: { meanings: ['edição durante envio'] },
    });
    await engine.synchronize(send, remote.pull, () => true);
    expect(calls).toBe(1);
    response.resolve({ mappings: [] });
    await syncing;
    expect(remote.requests.map((request) => request.command.type)).toEqual([
      'card.create',
      'card.update',
    ]);
    expect(remote.data.cards).toHaveLength(1);
    expect(remote.data.cards[0]).toMatchObject({
      meanings: ['edição durante envio'],
      contentVersion: 2,
    });
    expect(engine.getSnapshot().data!.cards).toHaveLength(1);
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      meanings: ['edição durante envio'],
    });
    expect(engine.getSnapshot().status.pending).toBe(0);
  });

  it('does not overwrite an edit queued while a fresh cloud snapshot is downloading', async () => {
    const engine = createEngine();
    await engine.load();
    const began = deferred<void>();
    const download = deferred<Data>();
    const syncing = engine.synchronize(
      async () => ({ mappings: [] }),
      async () => {
        began.resolve();
        return download.promise;
      },
      () => true,
    );
    await began.promise;
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['edição offline'] },
    });
    download.resolve(saved().base);
    await syncing;
    expect(engine.getSnapshot().status.pending).toBe(1);
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      meanings: ['edição offline'],
    });
  });

  it('does not accept a late cloud download after switching into explicit offline mode', async () => {
    const engine = createEngine();
    await engine.load();
    const began = deferred<void>();
    const download = deferred<Data>();
    let connected = true;
    const before = clone(engine.getSnapshot().data);
    const lastSyncedAt = engine.getSnapshot().status.lastSyncedAt;
    const syncing = engine.synchronize(
      async () => ({ mappings: [] }),
      async () => {
        began.resolve();
        return download.promise;
      },
      () => connected,
    );
    await began.promise;
    connected = false;
    download.resolve(emptyData(profile));
    await syncing;
    expect(engine.getSnapshot().data).toEqual(before);
    expect(engine.getSnapshot().status.lastSyncedAt).toBe(lastSyncedAt);
  });

  it.each(['offline', 'stopped'] as const)(
    'keeps the cache and pending study without an error when a download is intentionally cancelled by %s',
    async (change) => {
      const storage = new MemoryPersistence();
      const engine = createEngine(storage);
      await engine.load();
      const began = deferred<void>();
      const download = deferred<Data>();
      let connected = true;
      const syncing = engine.synchronize(
        async () => ({ mappings: [] }),
        async () => {
          began.resolve();
          return download.promise;
        },
        () => connected,
      );
      await began.promise;
      // A newly started session must survive cancellation of the older pull.
      await engine.mutate('study:start', {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      });
      const cached = clone(engine.getSnapshot().data);
      const savedBefore = clone(storage.stored);
      if (change === 'offline') connected = false;
      else engine.stop();
      download.reject(
        new Error('Download pausado. Sua biblioteca salva foi preservada.'),
      );
      await syncing;
      expect(engine.getSnapshot().status).toMatchObject({
        pending: 1,
        syncing: false,
        error: null,
        conflict: null,
      });
      expect(engine.getSnapshot().data).toEqual(cached);
      expect(storage.stored).toEqual(savedBefore);

      // Pausing must not hide a genuine validation error when sending resumes.
      connected = true;
      engine.resume();
      await engine.synchronize(
        async () => {
          throw { data: { code: 'VALIDATION', message: 'Conteúdo inválido.' } };
        },
        async () => saved().base,
        () => connected,
      );
      expect(engine.getSnapshot().status).toMatchObject({
        pending: 1,
        syncing: false,
        error: 'Conteúdo inválido.',
        conflict: { message: 'Conteúdo inválido.', canForce: false },
      });
    },
  );

  it.each(['offline', 'stopped'] as const)(
    'pauses before sending when %s begins while the sent command is being persisted, then replays it unchanged',
    async (change) => {
      const storage = new MemoryPersistence();
      const engine = createEngine(storage);
      const remote = server();
      await engine.load();
      await engine.mutate('study:start', {
        mode: 'direct',
        order: 'sorted',
        limit: 1,
      });
      const began = deferred<void>();
      const finishWrite = deferred<void>();
      const write = storage.write.bind(storage);
      vi.spyOn(storage, 'write').mockImplementationOnce(async (value) => {
        began.resolve();
        await finishWrite.promise;
        await write(value);
      });
      let connected = true;
      const send = vi.fn(remote.send);
      const syncing = engine.synchronize(send, remote.pull, () => connected);
      await began.promise;
      if (change === 'offline') connected = false;
      else engine.stop();
      finishWrite.resolve();
      await syncing;
      expect(send).not.toHaveBeenCalled();
      expect(engine.getSnapshot().status.pending).toBe(1);
      const pending = clone(storage.stored!.queue[0]);
      expect(pending.sent).toEqual(pending.command);
      connected = true;
      engine.resume();
      await engine.synchronize(send, remote.pull, () => connected);
      expect(send).toHaveBeenCalledExactlyOnceWith(pending.id, pending.sent);
      expect(engine.getSnapshot().status.pending).toBe(0);
      expect(remote.data.sessions).toHaveLength(1);
    },
  );

  it('preserves a conflicting queue, pauses new edits and rejects a cache from another account', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    await engine.load();
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['minha edição'] },
    });
    const commands = clone(
      engine.getSnapshot().saved!.queue.map((item) => item.command),
    );
    await engine.synchronize(
      async () => {
        throw {
          data: {
            code: 'CONFLICT',
            message: 'O card foi alterado em outro aparelho.',
          },
        };
      },
      async () => saved().base,
      () => true,
    );
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 1,
      conflict: { kind: 'card', canForce: true },
    });
    expect(
      engine.getSnapshot().saved!.queue.map((item) => item.command),
    ).toEqual(commands);
    expect(engine.getSnapshot().data!.cards[0]).toMatchObject({
      meanings: ['minha edição'],
    });
    await expect(
      engine.mutate('alphabet:archive', { id: water._id }),
    ).rejects.toThrow('Resolva');
    const otherAccount = createEngine(storage, 'https://clerk.test|other');
    await otherAccount.load();
    expect(otherAccount.getSnapshot()).toMatchObject({
      data: null,
      saved: null,
      status: {
        ready: false,
        error: 'O armazenamento não pertence a esta conta.',
      },
    });
    expect(storage.stored!.accountKey).toBe(profile.tokenIdentifier);
    expect(storage.stored!.queue).toHaveLength(1);
  });

  it('leaves an in-flight operation recoverable when the account engine stops before its acknowledgment', async () => {
    const storage = new MemoryPersistence();
    const engine = createEngine(storage);
    const remote = server();
    await engine.load();
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['água guardada'] },
    });
    const began = deferred<void>();
    const replyReady = deferred<Reply>();
    const syncing = engine.synchronize(
      async (id, command) => {
        const reply = await remote.send(id, command);
        began.resolve();
        await replyReady.promise;
        return reply;
      },
      remote.pull,
      () => true,
    );
    await began.promise;
    engine.stop();
    const pending = clone(storage.stored!.queue[0]);
    replyReady.resolve({ mappings: [] });
    await syncing;
    expect(storage.stored!.queue[0]).toEqual(pending);
    expect(engine.getSnapshot().status.pending).toBe(1);
    const restarted = createEngine(storage);
    await restarted.load();
    await restarted.synchronize(remote.send, remote.pull, () => true);
    expect(remote.requests.at(-1)).toEqual({
      id: pending.id,
      command: pending.sent,
    });
    expect(remote.data.cards[0].contentVersion).toBe(2);
    expect(restarted.getSnapshot().status.pending).toBe(0);
  });

  it('resolves a known edit conflict with a fresh forced operation while preserving later pending commands', async () => {
    const engine = createEngine();
    const remote = server();
    await engine.load();
    await engine.mutate('alphabet:update', {
      id: water._id,
      patch: { meanings: ['minha versão'] },
    });
    await engine.mutate('alphabet:archive', { id: water._id });
    await engine.synchronize(
      async () => {
        throw {
          data: { code: 'CONFLICT', message: 'Outro aparelho editou o card.' },
        };
      },
      remote.pull,
      () => true,
    );
    const oldId = engine.getSnapshot().saved!.queue[0].id;
    await engine.resolveConflict('device', remote.pull);
    expect(engine.getSnapshot().saved!.queue[0]).toMatchObject({
      command: { force: true },
    });
    expect(engine.getSnapshot().saved!.queue[0].id).not.toBe(oldId);
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 2,
      conflict: null,
    });
    await engine.synchronize(remote.send, remote.pull, () => true);
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 0,
      conflict: null,
    });
    expect(remote.data.cards[0]).toMatchObject({
      meanings: ['minha versão'],
      archived: true,
    });
  });
});
