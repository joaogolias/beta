import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import type { OfflineCommand } from './offlineValidators';
import { createTestBackend, learnerIdentity } from './test-support.helpers';
import {
  applyLocal,
  clone,
  skippedAfterAnswer,
  type Data,
  type Saved,
  snapshotOf,
} from '../../mobile/src/offline/model';
import { OfflineEngine } from '../../mobile/src/offline/engine';
import type { FunctionReturnType } from 'convex/server';
import { contentOf as examContentOf } from './examDomain';

const grammar = {
  language: 'ja',
  title: '〜てもいい',
  explanation: 'Expressa permissão.\nUse a forma て.',
  examples: [
    {
      text: '座ってもいいですか。',
      reading: 'すわってもいいですか。',
      meaning: 'Posso sentar?',
    },
  ],
  front: 'Como pedir permissão?',
  back: '〜てもいい',
  sortKey: 'てもいい',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};
const alphabet = {
  language: 'ja',
  writingSystem: 'Hani',
  symbol: '水',
  meanings: ['água'],
  examples: [],
  front: '水',
  back: 'água',
  sortKey: 'みず',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
  details: {
    kind: 'kanji' as const,
    kunYomi: ['みず'],
    onYomi: ['スイ'],
    radicals: ['水'],
  },
};
const vocabulary = {
  language: 'ja',
  expression: '学校',
  reading: 'がっこう',
  translations: { pt: ['escola'] },
  examples: [],
  front: '学校',
  back: 'escola',
  sortKey: 'がっこう',
  classifications: [{ scheme: 'jlpt', level: 'N5' }],
};

async function setup() {
  const backend = createTestBackend();
  const learner = backend.withIdentity(learnerIdentity);
  const other = backend.withIdentity({
    ...learnerIdentity,
    subject: 'other',
    tokenIdentifier: `${learnerIdentity.issuer}|other`,
  });
  await learner.mutation(api.users.ensureCurrentUser, {});
  await other.mutation(api.users.ensureCurrentUser, {});
  let sequence = 0;
  const apply = (
    command: OfflineCommand,
    operationId = `operation-${++sequence}`,
  ) => learner.mutation(api.offline.apply, { operationId, command });
  return { backend, learner, other, apply };
}

async function grammarSession() {
  const context = await setup();
  const card = await context.learner.mutation(api.grammar.create, {
    card: grammar,
  });
  const time = Date.now() - 10_000;
  const start: OfflineCommand = {
    type: 'study.start',
    localId: 'local:session-0001',
    mode: 'adaptive',
    order: 'sorted',
    filters: { category: 'grammar', level: 'N5' },
    createdAt: time,
    queue: [
      {
        localId: 'local:presentation-0001',
        cardId: card._id,
        snapshot: { ...grammar, category: 'grammar', contentVersion: 1 },
      },
    ],
  };
  const result = await context.apply(start);
  if (!result.session) throw new Error('Expected session');
  const args = {
    sessionId: start.localId,
    presentationId: start.queue[0].localId,
    expectedRevision: 0,
    occurredAt: time + 100,
  };
  return { ...context, card, start, time, session: result.session, args };
}

describe('durable offline synchronization', () => {
  test.each([
    { readingOmitted: false, legacySnapshot: false },
    { readingOmitted: true, legacySnapshot: false },
    { readingOmitted: true, legacySnapshot: true },
  ])(
    'studies MCP vocabulary without leaving sync pending (%j)',
    async ({ readingOmitted, legacySnapshot }) => {
      const { backend, learner } = await setup();
      const owner = await learner.query(api.users.current, {});
      if (!owner) throw new Error('Expected owner');
      await backend.mutation(internal.mcpGateway.createVocabulary, {
        tokenIdentifier: owner.tokenIdentifier,
        card: {
          language: 'ja',
          expression: '学校',
          ...(readingOmitted
            ? { readingOmitted: true }
            : { reading: 'がっこう' }),
          translations: { pt: ['escola'] },
          examples: [
            { text: '学校に行きます。', meaning: 'Vou para a escola.' },
          ],
          classifications: [{ scheme: 'jlpt', level: 'N5' }],
        },
      });
      const pull = async (): Promise<Data> => {
        const state = await learner.query(api.offline.state, {});
        const cards = await learner.query(api.vocabulary.search, {
          paginationOpts: { numItems: 100, cursor: null },
        });
        return {
          profile: owner,
          cards: cards.page,
          sessions: state.session ? [state.session] : [],
          presentations: state.presentations,
          stats: state.stats,
          attempts: state.attempts,
        };
      };
      let disk: Saved | null = null;
      let sequence = 0;
      const dependencies = {
        accountKey: owner.tokenIdentifier,
        uuid: () => `mcp-device-${++sequence}`,
        storage: {
          read: async () => disk,
          write: async (value: Saved) => {
            disk = clone(value);
          },
        },
      };
      let engine = new OfflineEngine(dependencies);
      const send = (operationId: string, command: OfflineCommand) =>
        learner.mutation(api.offline.apply, { operationId, command });
      await engine.load(owner);
      await engine.synchronize(send, pull, () => true);
      await engine.mutate('study:start', {
        category: 'vocabulary',
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
      if (legacySnapshot) {
        // Older APKs copied reading but not the optional readingOmitted flag
        // when freezing vocabulary downloaded after MCP creation.
        const journal = clone(engine.getSnapshot().saved!);
        const start = journal.queue[0].command;
        if (start.type !== 'study.start')
          throw new Error('Expected study start');
        const snapshot = start.queue[0].snapshot;
        if (!('category' in snapshot) || snapshot.category !== 'vocabulary')
          throw new Error('Expected vocabulary snapshot');
        delete snapshot.readingOmitted;
        journal.queue[0].sent = clone(start);
        disk = journal;
        engine.stop();
        engine = new OfflineEngine(dependencies);
        await engine.load();
      }
      await engine.synchronize(send, pull, () => true);
      expect(engine.getSnapshot().status).toMatchObject({
        pending: 0,
        error: null,
        conflict: null,
      });
      expect(
        (await learner.query(api.offline.state, {})).attempts,
      ).toHaveLength(1);
    },
  );

  test('downloads long review history in bounded pages while keeping complete session presentations', async () => {
    const { backend, learner, other } = await setup();
    const card = await learner.mutation(api.exams.create, {
      card: {
        language: 'ja',
        title: 'Questão longa',
        sortKey: 'もんだい',
        prompt: '問'.repeat(12000),
        alternatives: Array.from({ length: 10 }, () => '選'.repeat(2000)),
        answer: '答'.repeat(4000),
        explanation: '説'.repeat(12000),
        classifications: [{ scheme: 'jlpt', level: 'N5' }],
      },
    });
    const snapshot = {
      ...examContentOf(card),
      category: 'exam' as const,
      contentVersion: 1,
    };
    await backend.run(async (ctx) => {
      for (let index = 0; index < 20; index++) {
        const sessionId = await ctx.db.insert('studySessions', {
          ownerId: card.ownerId,
          mode: 'direct',
          order: 'sorted',
          filters: { category: 'exam' },
          status: 'completed',
          total: 1,
          position: 1,
          answered: 1,
          correct: 1,
          partial: 0,
          incorrect: 0,
          skipped: 0,
          createdAt: index,
          completedAt: index + 1,
        });
        const presentationId = await ctx.db.insert('studyPresentations', {
          ownerId: card.ownerId,
          sessionId,
          cardId: card._id,
          position: 0,
          snapshot,
          presentedAt: index,
          revealedAt: index,
          answeredAt: index + 1,
          rating: 'correct',
          skipped: false,
        });
        await ctx.db.insert('studyAttempts', {
          ownerId: card.ownerId,
          sessionId,
          presentationId,
          cardId: card._id,
          snapshot,
          rating: 'correct',
          mode: 'direct',
          reviewedAt: index + 1,
        });
      }
    });
    const state = await learner.query(api.offline.state, {});
    expect(state.attemptsTruncated).toBe(true);
    expect(state.attempts.length).toBeLessThan(20);
    expect(state.presentations).toHaveLength(1);
    expect(state.presentations[0].snapshot).toEqual(snapshot);
    for (const kind of ['recent', 'card'] as const) {
      let cursor: string | null = null;
      const ids: string[] = [];
      for (let page = 0; page < 10; page++) {
        const result: FunctionReturnType<typeof api.offline.recentAttempts> =
          kind === 'recent'
            ? await learner.query(api.offline.recentAttempts, {
                paginationOpts: { cursor, numItems: 100 },
              })
            : await learner.query(api.study.history, {
                cardId: card._id,
                paginationOpts: { cursor, numItems: 100 },
              });
        expect(result.page.length).toBeLessThan(20);
        ids.push(...result.page.map((attempt) => attempt._id));
        if (result.isDone) break;
        cursor = result.continueCursor;
      }
      expect(ids).toHaveLength(20);
      expect(new Set(ids).size).toBe(20);
    }
    expect(
      (
        await other.query(api.offline.recentAttempts, {
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toEqual([]);
    // Oversized pre-existing sessions fail explicitly, never with a partial queue.
    const session = state.session!;
    await backend.run(async (ctx) => {
      await ctx.db.patch('studySessions', session._id, { total: 30 });
      for (let position = 1; position < 30; position++)
        await ctx.db.insert('studyPresentations', {
          ownerId: card.ownerId,
          sessionId: session._id,
          cardId: card._id,
          position,
          snapshot,
          skipped: false,
        });
    });
    await expect(learner.query(api.offline.state, {})).rejects.toThrow(
      'sessão antiga é grande demais',
    );
  });

  test('replays existing legacy exam outboxes after upgrade without offering exam cards for new Benkyou sessions', async () => {
    const { learner } = await setup();
    const owner = await learner.query(api.users.current, {});
    if (!owner) throw new Error('Expected user');
    let disk: Saved | null = null;
    let sequence = 0;
    const dependencies = {
      accountKey: owner.tokenIdentifier,
      uuid: () => `exam-device-${String(++sequence).padStart(8, '0')}`,
      storage: {
        read: async () => (disk ? clone(disk) : null),
        write: async (value: Saved) => {
          disk = clone(value);
        },
      },
    };
    let engine = new OfflineEngine(dependencies);
    await engine.load(owner);
    const data = () => {
      const result = engine.getSnapshot().data;
      if (!result) throw new Error('Expected cached library');
      return result;
    };
    await engine.mutate('exams:create', {
      card: {
        language: 'ja',
        title: 'Questão autoral de partículas',
        prompt: '学校（　）行きます。',
        alternatives: ['を', 'へ', 'で'],
        answer: 'Alternativa 2',
        explanation: 'へ indica a direção do movimento.',
        sortKey: 'がっこう',
        classifications: [
          { scheme: 'jlpt', level: 'N5' },
          { scheme: 'jlpt', level: 'N4' },
        ],
        examReference: 'Exercício autoral',
        year: 2026,
        section: 'Gramática',
        source: 'Material pessoal',
      },
    });
    const localId = data().cards[0]._id;
    await engine.mutate('exams:update', {
      id: localId,
      patch: { examReference: null, year: null, section: '', source: null },
    });
    expect(data().cards[0]).not.toHaveProperty('year');
    expect(data().cards[0]).not.toHaveProperty('source');
    await expect(
      engine.mutate('study:start', {
        category: 'exam',
        mode: 'adaptive',
        order: 'sorted',
        limit: 10,
      }),
    ).rejects.toThrow();
    // A previous app version already persisted this session before the update.
    const saved = clone(engine.getSnapshot().saved!);
    saved.queue.push({
      id: 'legacy-session-operation',
      command: {
        type: 'study.start',
        localId: 'local:legacy-exam-session',
        mode: 'adaptive',
        order: 'sorted',
        filters: { category: 'exam', level: 'N5' },
        createdAt: Date.now() - 1000,
        queue: [
          {
            localId: 'local:legacy-exam-presentation',
            cardId: localId,
            snapshot: snapshotOf(data().cards[0]),
          },
        ],
      },
    });
    await dependencies.storage.write(saved);
    engine.stop();
    engine = new OfflineEngine(dependencies);
    await engine.load();
    const session = data().sessions[0],
      presentation = data().presentations[0];
    expect(session.total).toBe(1);
    expect(presentation.snapshot).toMatchObject({
      category: 'exam',
      contentVersion: 2,
    });
    expect(presentation.snapshot.front).toContain('学校');
    expect(presentation.snapshot.front).not.toContain('へ indica');
    expect(presentation.snapshot.back).toContain('Alternativa 2');
    await engine.mutate('exams:update', {
      id: localId,
      patch: { answer: 'Uma resposta editada depois da sessão' },
    });
    const args = {
      sessionId: session._id,
      presentationId: presentation._id,
      expectedRevision: 0,
    };
    await engine.mutate('study:reveal', args);
    await engine.mutate('study:rate', { ...args, rating: 'partial' });
    await engine.mutate('study:undo', args);
    await engine.mutate('study:reveal', { ...args, expectedRevision: 1 });
    await engine.mutate('study:rate', {
      ...args,
      expectedRevision: 1,
      rating: 'correct',
    });
    await engine.mutate('exams:archive', { id: localId });
    const pull = async (): Promise<Data> => {
      const state = await learner.query(api.offline.state, {});
      const active = await learner.query(api.exams.search, {
        paginationOpts: { numItems: 100, cursor: null },
      });
      const archived = await learner.query(api.exams.search, {
        archived: true,
        paginationOpts: { numItems: 100, cursor: null },
      });
      return {
        profile: owner,
        cards: [...active.page, ...archived.page],
        sessions: state.session ? [state.session] : [],
        presentations: state.presentations,
        stats: state.stats,
        attempts: state.attempts,
      };
    };
    const send = (operationId: string, command: OfflineCommand) =>
      learner.mutation(api.offline.apply, { operationId, command });
    await engine.synchronize(
      async (operationId, command) => {
        await send(operationId, command);
        throw new Error('Lost create acknowledgement');
      },
      pull,
      () => true,
    );
    expect(engine.getSnapshot().status.pending).toBeGreaterThan(0);
    engine.stop();
    engine = new OfflineEngine(dependencies);
    await engine.load();
    expect(data().attempts).toHaveLength(1);
    await engine.synchronize(send, pull, () => true);
    expect(engine.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
      conflict: null,
    });
    const archived = await learner.query(api.exams.search, {
      archived: true,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(archived.page).toHaveLength(1);
    const card = archived.page[0];
    expect(card).toMatchObject({
      contentVersion: 3,
      answer: 'Uma resposta editada depois da sessão',
    });
    for (const field of ['year', 'source', 'section', 'examReference'])
      expect(card).not.toHaveProperty(field);
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(history.page).toHaveLength(1);
    expect(history.page[0]).toMatchObject({
      rating: 'correct',
      snapshot: {
        category: 'exam',
        answer: 'Alternativa 2',
        contentVersion: 2,
      },
    });
    expect(
      await learner.query(api.studyProgress.overview, {
        category: 'exam',
        level: 'N5',
      }),
    ).toMatchObject({ totalCards: 0, attempts: 0 });
    expect(
      await learner.query(api.studyProgress.overview, {
        category: 'exam',
        archived: true,
      }),
    ).toMatchObject({ totalCards: 0, attempts: 0, correct: 0 });
    await engine.mutate('exams:restore', { id: localId });
    await engine.synchronize(send, pull, () => true);
    expect(await learner.query(api.exams.get, { id: card._id })).toMatchObject({
      archived: false,
    });
  });

  test('synchronizes the device outbox through real Convex after restart, lost ACK, archived middle card and undo', async () => {
    const { learner } = await setup();
    const owner = await learner.query(api.users.current, {});
    if (!owner) throw new Error('Expected user');
    let persisted: Saved | null = null;
    let sequence = 0;
    const deps = {
      accountKey: owner.tokenIdentifier,
      uuid: () => `device-${String(++sequence).padStart(8, '0')}`,
      storage: {
        read: async () => (persisted ? clone(persisted) : null),
        write: async (value: Saved) => {
          persisted = clone(value);
        },
      },
    };
    const pull = async (): Promise<Data> => {
      const state = await learner.query(api.offline.state, {});
      if (!state.owner) throw new Error('Expected user');
      const active = await learner.query(api.grammar.search, {
        archived: false,
        paginationOpts: { numItems: 100, cursor: null },
      });
      const archived = await learner.query(api.grammar.search, {
        archived: true,
        paginationOpts: { numItems: 100, cursor: null },
      });
      return {
        profile: state.owner,
        cards: [...active.page, ...archived.page],
        sessions: state.session ? [state.session] : [],
        presentations: state.presentations,
        stats: state.stats,
        attempts: state.attempts,
      };
    };
    const send = (operationId: string, command: OfflineCommand) =>
      learner.mutation(api.offline.apply, { operationId, command });
    const engine = new OfflineEngine(deps);
    await engine.load(owner);
    const deviceData = () => {
      const data = engine.getSnapshot().data;
      if (!data) throw new Error('Expected local data');
      return data;
    };
    for (const sortKey of ['a', 'b', 'c'])
      await engine.mutate('grammar:create', {
        card: { ...grammar, title: sortKey, sortKey },
      });
    const [firstCard, middleCard] = deviceData().cards;
    await engine.mutate('grammar:update', {
      id: firstCard._id,
      patch: { explanation: 'Edição offline antes do estudo' },
    });
    await engine.mutate('study:start', {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 3,
    });
    await engine.mutate('grammar:archive', { id: middleCard._id });
    const answer = async (rating: 'correct' | 'partial' | 'incorrect') => {
      const data = deviceData();
      const session = data.sessions[0];
      const presentation = data.presentations.find(
        (item) => item.position === session.position,
      );
      if (!presentation) throw new Error('Expected current card');
      const args = {
        sessionId: session._id,
        presentationId: presentation._id,
        expectedRevision: session.revision ?? 0,
      };
      await engine.mutate('study:reveal', args);
      await engine.mutate('study:rate', { ...args, rating });
      return args;
    };
    await answer('correct');
    expect(deviceData().sessions[0]).toMatchObject({ position: 2, skipped: 1 });
    const lastAnswer = await answer('partial');
    await engine.mutate('study:undo', lastAnswer);
    await answer('incorrect');
    const expected = {
      status: 'completed',
      position: 3,
      skipped: 1,
      answered: 2,
      correct: 1,
      partial: 0,
      incorrect: 1,
      revision: 1,
    };
    expect(deviceData().sessions[0]).toMatchObject(expected);
    let lostAcknowledgement = false;
    await engine.synchronize(
      async (operationId, command) => {
        const reply = await send(operationId, command);
        if (command.type === 'study.rate' && !lostAcknowledgement) {
          lostAcknowledgement = true;
          throw new Error('Network lost after server commit');
        }
        return reply;
      },
      pull,
      () => true,
    );
    expect(lostAcknowledgement).toBe(true);
    expect(engine.getSnapshot().status.pending).toBeGreaterThan(0);
    engine.stop();
    const reopened = new OfflineEngine(deps);
    await reopened.load(owner);
    expect(reopened.getSnapshot().data?.sessions[0]).toMatchObject(expected);
    await reopened.synchronize(send, pull, () => true);
    expect(reopened.getSnapshot().status).toMatchObject({
      pending: 0,
      error: null,
      conflict: null,
    });
    expect(reopened.getSnapshot().data?.sessions[0]).toMatchObject(expected);
    const final = await learner.query(api.offline.state, {});
    expect(final.session).toMatchObject(expected);
    expect(final.totals).toMatchObject({
      attempts: 2,
      correct: 1,
      partial: 0,
      incorrect: 1,
      reviewedCards: 2,
    });
    expect(final.presentations[1].skipped).toBe(true);
    expect(final.attempts).toHaveLength(2);
    expect(
      final.attempts.find((attempt) => attempt.rating === 'correct')?.snapshot,
    ).toMatchObject({ explanation: 'Edição offline antes do estudo' });
  });

  test('replays explicit local archive skips with the same queue position and undo as the device', async () => {
    const { learner, apply } = await setup();
    const cards = await Promise.all(
      ['a', 'b', 'c'].map((sortKey) =>
        learner.mutation(api.grammar.create, {
          card: { ...grammar, title: sortKey, sortKey },
        }),
      ),
    );
    await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 3,
    });
    const downloaded = await learner.query(api.offline.state, {});
    if (!downloaded.owner || !downloaded.session)
      throw new Error('Expected owner and session');
    const local: Data = {
      profile: downloaded.owner,
      cards,
      sessions: [downloaded.session],
      presentations: downloaded.presentations,
      stats: downloaded.stats,
      attempts: downloaded.attempts,
    };
    const [first, middle] = local.presentations;
    const archive: OfflineCommand = {
      type: 'card.archive',
      category: 'grammar',
      id: middle.cardId,
      expectedContentVersion: 1,
      expectedArchived: false,
      archived: true,
    };
    applyLocal(local, archive);
    const args = {
      sessionId: downloaded.session._id,
      presentationId: first._id,
      expectedRevision: 0,
      occurredAt: Date.now(),
    };
    const reveal: OfflineCommand = { type: 'study.reveal', ...args };
    applyLocal(local, reveal);
    const rate: OfflineCommand = {
      type: 'study.rate',
      ...args,
      rating: 'correct',
      skippedPresentationIds: skippedAfterAnswer(
        local,
        args.sessionId,
        args.presentationId,
      ),
    };
    expect(rate.skippedPresentationIds).toEqual([middle._id]);
    applyLocal(local, rate);
    expect(local.sessions[0]).toMatchObject({
      position: 2,
      skipped: 1,
      answered: 1,
    });
    await apply(archive);
    await apply(reveal);
    const reply = await apply(rate, 'skip-middle-receipt');
    expect(reply.projection?.session).toMatchObject({
      position: 2,
      skipped: 1,
      answered: 1,
    });
    expect(await apply(rate, 'skip-middle-receipt')).toEqual(reply);
    expect(
      (await learner.query(api.offline.state, {})).presentations[1].skipped,
    ).toBe(true);
    const undo: OfflineCommand = {
      type: 'study.undo',
      ...args,
      occurredAt: Date.now(),
    };
    applyLocal(local, undo);
    const undone = await apply(undo);
    expect(undone.projection?.session).toMatchObject({
      position: 0,
      skipped: 0,
      answered: 0,
      revision: 1,
    });
    expect(local.sessions[0]).toMatchObject({
      position: 0,
      skipped: 0,
      answered: 0,
      revision: 1,
    });
    const restore: OfflineCommand = {
      ...archive,
      expectedArchived: true,
      archived: false,
    };
    applyLocal(local, restore);
    await apply(restore);
    const revisedReveal: OfflineCommand = {
      ...reveal,
      expectedRevision: 1,
      occurredAt: Date.now(),
    };
    applyLocal(local, revisedReveal);
    await apply(revisedReveal);
    const revisedRate: OfflineCommand = {
      ...rate,
      expectedRevision: 1,
      occurredAt: Date.now(),
      skippedPresentationIds: skippedAfterAnswer(
        local,
        args.sessionId,
        args.presentationId,
      ),
    };
    expect(revisedRate.skippedPresentationIds).toEqual([]);
    applyLocal(local, revisedRate);
    expect((await apply(revisedRate)).projection?.session).toMatchObject({
      position: 1,
      skipped: 0,
      answered: 1,
    });
    expect(local.sessions[0]).toMatchObject({
      position: 1,
      skipped: 0,
      answered: 1,
    });
  });

  test('only accepts contiguous owned unpresented skips and does not reevaluate a captured device decision', async () => {
    const { learner, other, apply } = await setup();
    const cards = await Promise.all(
      ['a', 'b', 'c'].map((sortKey) =>
        learner.mutation(api.grammar.create, {
          card: { ...grammar, title: sortKey, sortKey },
        }),
      ),
    );
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 3,
    });
    const state = await learner.query(api.offline.state, {});
    if (!state.owner) throw new Error('Expected owner');
    const [first, middle, last] = state.presentations;
    const args = {
      sessionId: session._id,
      presentationId: first._id,
      expectedRevision: 0,
      occurredAt: Date.now(),
    };
    await apply({ type: 'study.reveal', ...args });
    await expect(
      apply({
        type: 'study.rate',
        ...args,
        rating: 'partial',
        skippedPresentationIds: [last._id],
      }),
    ).rejects.toThrow('sequência');
    await expect(
      apply({
        type: 'study.rate',
        ...args,
        rating: 'partial',
        skippedPresentationIds: [middle._id, middle._id],
      }),
    ).rejects.toThrow('sequência');
    await expect(
      apply({
        type: 'study.rate',
        ...args,
        rating: 'partial',
        skippedPresentationIds: [first._id],
      }),
    ).rejects.toThrow('sequência');
    await other.mutation(api.grammar.create, { card: grammar });
    const otherSession = await other.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 1,
    });
    const foreign = await other.query(api.study.current, {
      sessionId: otherSession._id,
    });
    if (!foreign.presentation) throw new Error('Expected foreign presentation');
    await expect(
      apply({
        type: 'study.rate',
        ...args,
        rating: 'partial',
        skippedPresentationIds: [foreign.presentation._id],
      }),
    ).rejects.toThrow('indisponível');
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
    });
    const local: Data = {
      profile: state.owner,
      cards,
      sessions: [session],
      presentations: state.presentations,
      stats: [],
      attempts: [],
    };
    const reveal: OfflineCommand = { type: 'study.reveal', ...args };
    applyLocal(local, reveal);
    const rate: OfflineCommand = {
      type: 'study.rate',
      ...args,
      rating: 'partial',
      skippedPresentationIds: skippedAfterAnswer(
        local,
        args.sessionId,
        args.presentationId,
      ),
    };
    expect(rate.skippedPresentationIds).toEqual([]);
    // Remote archive after the captured answer must not change its ACK projection.
    local.cards[1].archived = true;
    await learner.mutation(api.grammar.archive, { id: cards[1]._id });
    applyLocal(local, rate);
    expect(local.sessions[0]).toMatchObject({ position: 1, skipped: 0 });
    expect((await apply(rate)).projection?.session).toMatchObject({
      position: 1,
      skipped: 0,
    });
  });

  test('uploads older reviews without moving recency backwards and orders history by the actual review date', async () => {
    const { learner, apply } = await setup();
    const card = await learner.mutation(api.grammar.create, { card: grammar });
    const online = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      category: 'grammar',
      limit: 1,
    });
    const { presentation } = await learner.query(api.study.current, {
      sessionId: online._id,
    });
    if (!presentation) throw new Error('Expected presentation');
    const onlineArgs = {
      sessionId: online._id,
      presentationId: presentation._id,
    };
    await learner.mutation(api.study.reveal, onlineArgs);
    await learner.mutation(api.study.rate, {
      ...onlineArgs,
      rating: 'correct',
    });
    const recent = await learner.query(api.study.progress, {
      cardId: card._id,
    });
    const earlier = Date.now() - 86_400_000;
    await apply({
      type: 'study.start',
      localId: 'local:older-session',
      mode: 'adaptive',
      order: 'sorted',
      filters: { category: 'grammar' },
      createdAt: earlier,
      queue: [
        {
          localId: 'local:older-presentation',
          cardId: card._id,
          snapshot: { ...grammar, category: 'grammar', contentVersion: 1 },
        },
      ],
    });
    const args = {
      sessionId: 'local:older-session',
      presentationId: 'local:older-presentation',
      expectedRevision: 0,
      occurredAt: earlier + 1000,
    };
    await apply({ type: 'study.reveal', ...args });
    await apply({ type: 'study.rate', ...args, rating: 'incorrect' });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({ attempts: 2, lastReviewedAt: recent?.lastReviewedAt });
    const history = await learner.query(api.study.history, {
      cardId: card._id,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(history.page.map((item) => item.rating)).toEqual([
      'correct',
      'incorrect',
    ]);
    expect(
      (await learner.query(api.offline.state, {})).attempts.map(
        (item) => item.rating,
      ),
    ).toEqual(['correct', 'incorrect']);
    await apply({ type: 'study.undo', ...args });
    expect(
      await learner.query(api.study.progress, { cardId: card._id }),
    ).toMatchObject({
      attempts: 1,
      correct: 1,
      incorrect: 0,
      lastReviewedAt: recent?.lastReviewedAt,
    });
  });

  test('creates all card categories, resolves local refs and replays lost acknowledgements without duplicates', async () => {
    const { apply, learner } = await setup();
    const command: OfflineCommand = {
      type: 'card.create',
      category: 'grammar',
      localId: 'local:grammar-0001',
      card: grammar,
    };
    const first = await apply(command, 'lost-ack-create');
    expect(await apply(command, 'lost-ack-create')).toEqual(first);
    expect(first.mappings).toEqual([
      { localId: command.localId, serverId: first.card?._id },
    ]);
    const updated = await apply({
      type: 'card.update',
      category: 'grammar',
      id: command.localId,
      expectedContentVersion: 1,
      expectedArchived: false,
      patch: { explanation: 'Explicação editada offline.\nSegunda linha.' },
    });
    expect(updated.card).toMatchObject({
      contentVersion: 2,
      explanation: 'Explicação editada offline.\nSegunda linha.',
    });
    await apply({
      type: 'card.create',
      category: 'alphabet',
      localId: 'local:alphabet-0001',
      card: alphabet,
    });
    await apply({
      type: 'card.create',
      category: 'vocabulary',
      localId: 'local:vocabulary-0001',
      card: vocabulary,
    });
    const [kanji, kotoba, bunpou] = await Promise.all([
      learner.query(api.alphabet.search, {
        paginationOpts: { numItems: 100, cursor: null },
      }),
      learner.query(api.vocabulary.search, {
        paginationOpts: { numItems: 100, cursor: null },
      }),
      learner.query(api.grammar.search, {
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ]);
    expect([kanji.page.length, kotoba.page.length, bunpou.page.length]).toEqual(
      [1, 1, 1],
    );
    await expect(
      apply(
        { ...command, card: { ...grammar, title: 'Outro conteúdo' } },
        'lost-ack-create',
      ),
    ).rejects.toThrow('outro conteúdo');
  });

  test('rejects remote content and archive conflicts, allows explicit resolution and reuses domain validation', async () => {
    const { learner, apply } = await setup();
    const card = await learner.mutation(api.grammar.create, { card: grammar });
    await learner.mutation(api.grammar.update, {
      id: card._id,
      patch: { explanation: 'Versão da nuvem' },
    });
    const update: OfflineCommand = {
      type: 'card.update',
      category: 'grammar',
      id: card._id,
      expectedContentVersion: 1,
      expectedArchived: false,
      patch: { explanation: 'Versão do aparelho' },
    };
    await expect(apply(update)).rejects.toThrow('outro aparelho');
    expect(await apply({ ...update, force: true })).toMatchObject({
      card: { explanation: 'Versão do aparelho', contentVersion: 3 },
    });
    await learner.mutation(api.grammar.archive, { id: card._id });
    const archive: OfflineCommand = {
      type: 'card.archive',
      category: 'grammar',
      id: card._id,
      expectedContentVersion: 3,
      expectedArchived: false,
      archived: false,
    };
    await expect(apply(archive)).rejects.toThrow('outro aparelho');
    expect(await apply({ ...archive, force: true })).toMatchObject({
      card: { archived: false },
    });
    await expect(
      apply({
        ...update,
        force: true,
        patch: { shortExplanation: 'a'.repeat(2001) },
      }),
    ).rejects.toThrow('2000');
    expect(
      await learner.query(api.grammar.get, { id: card._id }),
    ).toMatchObject({ front: grammar.title });
  });

  test('preserves offline creation dates across synchronization and duplicate receipts', async () => {
    const { apply, learner } = await setup();
    const createdAt = Date.now() - 86_400_000;
    const command: OfflineCommand = {
      type: 'card.create',
      category: 'grammar',
      localId: 'local:creation-date-test',
      createdAt,
      card: { ...grammar, examples: [], shortExplanation: '' },
    };
    const first = await apply(command, 'offline-creation-date');
    expect(first.card).toMatchObject({
      createdAt,
      front: grammar.title,
      back: '',
    });
    expect(await apply(command, 'offline-creation-date')).toEqual(first);
    const cards = await learner.query(api.grammar.search, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(cards.page).toHaveLength(1);
    expect(cards.page[0].createdAt).toBe(createdAt);
    await expect(
      apply({
        ...command,
        localId: 'local:future-creation-test',
        createdAt: Date.now() + 600_000,
      }),
    ).rejects.toThrow('criação');
  });

  test('replays study, undo and corrected ratings exactly once even after an old acknowledgement is lost', async () => {
    const { apply, learner, args, session, time } = await grammarSession();
    await apply({ type: 'study.reveal', ...args });
    const rating: OfflineCommand = {
      type: 'study.rate',
      ...args,
      occurredAt: time + 200,
      rating: 'correct',
    };
    const rated = await apply(rating, 'answer-before-undo');
    expect(rated.projection?.session).toMatchObject({
      status: 'completed',
      answered: 1,
      correct: 1,
    });
    expect(await apply(rating, 'answer-before-undo')).toEqual(rated);
    await apply(
      { type: 'study.undo', ...args, occurredAt: time + 300 },
      'undo-operation',
    );
    await apply(rating, 'answer-before-undo');
    expect(await learner.query(api.study.overview, {})).toMatchObject({
      attempts: 0,
      correct: 0,
      reviewedCards: 0,
    });
    await apply({
      type: 'study.reveal',
      ...args,
      expectedRevision: 1,
      occurredAt: time + 400,
    });
    await apply({
      type: 'study.rate',
      ...args,
      expectedRevision: 1,
      occurredAt: time + 500,
      rating: 'partial',
    });
    await apply(
      { type: 'study.undo', ...args, occurredAt: time + 300 },
      'undo-operation',
    );
    const state = await learner.query(api.offline.state, {});
    expect(state.session?._id).toBe(session._id);
    expect(state.totals).toMatchObject({
      attempts: 1,
      partial: 1,
      correct: 0,
      reviewedCards: 1,
    });
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({
      rating: 'partial',
      mode: 'adaptive',
      reviewedAt: time + 500,
      snapshot: { front: grammar.front },
    });
  });

  test('keeps authored snapshots through remote edits and maps locally created cards into study queues', async () => {
    const { apply, learner } = await setup();
    const result = await apply({
      type: 'card.create',
      category: 'grammar',
      localId: 'local:grammar-0002',
      card: grammar,
    });
    if (!result.card || !('title' in result.card) || 'prompt' in result.card)
      throw new Error('Expected grammar card');
    await learner.mutation(api.grammar.update, {
      id: result.card._id,
      patch: { title: 'Nova estrutura' },
    });
    const start = await apply({
      type: 'study.start',
      localId: 'local:session-0002',
      mode: 'direct',
      order: 'random',
      filters: { category: 'grammar' },
      createdAt: Date.now() - 1000,
      queue: [
        {
          localId: 'local:presentation-0002',
          cardId: 'local:grammar-0002',
          snapshot: { ...grammar, category: 'grammar', contentVersion: 1 },
        },
      ],
    });
    expect(start.mappings).toHaveLength(2);
    const state = await learner.query(api.offline.state, {});
    expect(state.presentations[0]).toMatchObject({
      cardId: result.card._id,
      snapshot: { front: grammar.front, contentVersion: 1 },
    });
  });

  test('does not replace an active session without explicit resolution and never overrides an archived card', async () => {
    const { apply, learner } = await setup();
    const card = await learner.mutation(api.grammar.create, { card: grammar });
    const active = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
      category: 'grammar',
    });
    const start: OfflineCommand = {
      type: 'study.start',
      localId: 'local:session-0003',
      mode: 'direct',
      order: 'sorted',
      filters: { category: 'grammar' },
      createdAt: Date.now() - 1000,
      queue: [
        {
          localId: 'local:presentation-0003',
          cardId: card._id,
          snapshot: { ...grammar, category: 'grammar', contentVersion: 1 },
        },
      ],
    };
    await expect(apply(start)).rejects.toThrow('outro aparelho');
    await learner.mutation(api.grammar.archive, { id: card._id });
    await expect(apply({ ...start, force: true })).rejects.toThrow('arquivado');
    expect((await learner.query(api.study.active, {}))?._id).toBe(active._id);
    await learner.mutation(api.grammar.restore, { id: card._id });
    const synced = await apply({ ...start, force: true });
    expect(
      (await learner.query(api.study.current, { sessionId: active._id }))
        .session.status,
    ).toBe('ended');
    expect(synced.session?.status).toBe('active');
  });

  test('resumes a downloaded session without skipping offline answers when a later card is archived remotely', async () => {
    const { learner, apply } = await setup();
    const one = await learner.mutation(api.grammar.create, { card: grammar });
    const two = await learner.mutation(api.grammar.create, {
      card: { ...grammar, title: '二', sortKey: 'ん' },
    });
    const session = await learner.mutation(api.study.start, {
      mode: 'direct',
      order: 'sorted',
      limit: 10,
      category: 'grammar',
    });
    const queue = (await learner.query(api.offline.state, {})).presentations;
    expect(queue.map((item) => item.cardId)).toEqual([one._id, two._id]);
    await learner.mutation(api.grammar.archive, { id: two._id });
    for (const presentation of queue) {
      const args = {
        sessionId: session._id,
        presentationId: presentation._id,
        expectedRevision: 0,
        occurredAt: Date.now(),
      };
      await apply({ type: 'study.reveal', ...args });
      await apply({ type: 'study.rate', ...args, rating: 'correct' });
    }
    expect(
      (await learner.query(api.study.current, { sessionId: session._id }))
        .session,
    ).toMatchObject({ status: 'completed', answered: 2, skipped: 0 });
  });

  test('isolates aliases, receipts, snapshots and cached state by authenticated owner', async () => {
    const { learner, other, apply, args, start, card } = await grammarSession();
    await apply({ type: 'study.reveal', ...args });
    await apply({ type: 'study.rate', ...args, rating: 'correct' });
    const otherState = await other.query(api.offline.state, {});
    expect(otherState).toMatchObject({
      stats: [],
      attempts: [],
      totals: null,
      session: null,
      presentations: [],
    });
    expect(otherState.owner?.tokenIdentifier).not.toBe(
      learnerIdentity.tokenIdentifier,
    );
    const operationId = 'foreign-attempt';
    await expect(
      other.mutation(api.offline.apply, {
        operationId,
        command: { ...start, force: true },
      }),
    ).rejects.toThrow('indisponível');
    await expect(
      other.mutation(api.offline.apply, {
        operationId,
        command: { type: 'study.reveal', ...args },
      }),
    ).rejects.toThrow('disponível');
    await expect(
      other.mutation(api.offline.apply, {
        operationId,
        command: {
          type: 'card.update',
          category: 'grammar',
          id: card._id,
          patch: { title: 'Roubo' },
          expectedContentVersion: 1,
          expectedArchived: false,
          force: true,
        },
      }),
    ).rejects.toThrow('indisponível');
    expect(
      (await learner.query(api.grammar.get, { id: card._id }))?.title,
    ).toBe(grammar.title);
  });

  test('rejects invalid snapshots, repeated cards, invalid revisions, premature answers and future timestamps atomically', async () => {
    const { apply, learner, args, start, time } = await grammarSession();
    await expect(
      apply({ type: 'study.rate', ...args, rating: 'correct' }),
    ).rejects.toThrow('Revele');
    await expect(
      apply({ type: 'study.reveal', ...args, expectedRevision: -1 }),
    ).rejects.toThrow('revisão');
    await expect(
      apply({
        type: 'study.reveal',
        ...args,
        occurredAt: Date.now() + 600_000,
      }),
    ).rejects.toThrow('data');
    await expect(
      apply({ type: 'study.reveal', ...args, occurredAt: time - 1 }),
    ).rejects.toThrow('anterior');
    await apply({
      type: 'study.finish',
      sessionId: start.localId,
      occurredAt: Date.now(),
    });
    const malformed = {
      ...start,
      localId: 'local:session-0004',
      queue: [
        {
          ...start.queue[0],
          localId: 'local:presentation-0004',
          snapshot: {
            ...grammar,
            category: 'grammar' as const,
            contentVersion: 1,
            shortExplanation: 'a'.repeat(2001),
          },
        },
      ],
    };
    await expect(apply(malformed)).rejects.toThrow('2000');
    await expect(
      apply({
        ...malformed,
        queue: [
          start.queue[0],
          { ...start.queue[0], localId: 'local:presentation-0005' },
        ],
      }),
    ).rejects.toThrow('duas vezes');
    expect(await learner.query(api.study.active, {})).toBeNull();
  });
});
