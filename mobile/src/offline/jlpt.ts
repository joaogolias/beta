import type { FunctionArgs } from 'convex/server';
import type { api } from '../../../backend/convex/_generated/api';
import type { Doc } from '../../../backend/convex/_generated/dataModel';
import type { OfflineCommand } from '../../../backend/convex/offlineValidators';
import {
  normalizePaper,
  applyPaperPatch,
  startAttempt,
  answerAttempt,
  advanceAttempt,
  finishAttempt,
} from '../../../shared/jlpt';
import type { Data, Saved } from './model';
import { creditLocalQuests } from './quests';

export type JlptCommand = Extract<OfflineCommand, { type: `jlpt.${string}` }>;
export function isJlptCommand(command: OfflineCommand): command is JlptCommand {
  return command.type.startsWith('jlpt.');
}
const resolve = (value: unknown, aliases: Saved['aliases']) =>
  aliases[String(value)] ?? String(value);

export function makeJlptCommand(
  name: string,
  args: Record<string, unknown>,
  data: Data,
  aliases: Saved['aliases'],
  localId: () => string,
  now: number,
): JlptCommand {
  if (name === 'jlpt:create')
    return {
      type: 'jlpt.create',
      localId: localId(),
      paper: (args as FunctionArgs<typeof api.jlpt.create>).paper,
    };
  if (
    name === 'jlpt:update' ||
    name === 'jlpt:archive' ||
    name === 'jlpt:restore'
  ) {
    const paper = data.jlptPapers?.find(
      (item) => item._id === resolve(args.id, aliases),
    );
    if (!paper) throw new Error('Prova indisponível neste aparelho.');
    if (
      args.expectedContentVersion !== undefined &&
      args.expectedContentVersion !== paper.contentVersion
    )
      throw new Error(
        'Este simulado mudou desde que você abriu a edição. Reabra a versão mais recente antes de salvar.',
      );
    const expected = {
      id: String(args.id),
      expectedContentVersion: paper.contentVersion,
      expectedArchived: paper.archived,
    };
    if (name === 'jlpt:update')
      return {
        type: 'jlpt.update',
        ...expected,
        patch: (args as FunctionArgs<typeof api.jlpt.update>).patch,
      };
    return {
      type: 'jlpt.archive',
      ...expected,
      archived: name === 'jlpt:archive',
    };
  }
  if (name === 'jlpt:start') {
    const paper = data.jlptPapers?.find(
      (item) => item._id === resolve(args.paperId, aliases),
    );
    if (!paper || paper.archived)
      throw new Error('Prova indisponível neste aparelho.');
    return {
      type: 'jlpt.start',
      localId: localId(),
      paperId: String(args.paperId),
      snapshot: {
        ...normalizePaper(paper),
        contentVersion: paper.contentVersion,
      },
      startedAt: now,
    };
  }
  const attempt = data.jlptAttempts?.find(
    (item) => item._id === resolve(args.attemptId, aliases),
  );
  if (!attempt) throw new Error('Tentativa indisponível neste aparelho.');
  const operation = {
    attemptId: String(args.attemptId),
    expectedRevision: Number(args.expectedRevision ?? attempt.revision),
    occurredAt: now,
  };
  if (name === 'jlpt:answer') {
    const input = args as FunctionArgs<typeof api.jlpt.answer>;
    return {
      type: 'jlpt.answer',
      ...operation,
      questionId: input.questionId,
      choice: input.choice,
      flagged: input.flagged,
    };
  }
  if (name === 'jlpt:advance') return { type: 'jlpt.advance', ...operation };
  if (name === 'jlpt:finish') return { type: 'jlpt.finish', ...operation };
  throw new Error('Esta ação de prova não está disponível.');
}

export function applyJlptLocal(
  data: Data,
  command: JlptCommand,
  aliases: Saved['aliases'],
): unknown {
  const id = (value: string) => resolve(value, aliases);
  const papers = (data.jlptPapers ??= []);
  const attempts = (data.jlptAttempts ??= []);
  if (command.type === 'jlpt.create') {
    const paper = {
      ...normalizePaper(command.paper),
      _id: id(command.localId),
      ownerId: data.profile._id,
      _creationTime: 0,
      createdAt: 0,
      updatedAt: 0,
      archived: false,
      contentVersion: 1,
    } as Doc<'jlptPapers'>;
    papers.push(paper);
    return paper;
  }
  if (command.type === 'jlpt.update' || command.type === 'jlpt.archive') {
    const index = papers.findIndex((item) => item._id === id(command.id));
    const previous = papers[index];
    if (!previous) throw new Error('Prova indisponível neste aparelho.');
    if (command.type === 'jlpt.archive') {
      papers[index] = { ...previous, archived: command.archived };
    } else {
      const before = normalizePaper(previous);
      const content = applyPaperPatch(previous, command.patch);
      papers[index] = {
        ...previous,
        ...content,
        contentVersion:
          previous.contentVersion +
          (JSON.stringify(before) === JSON.stringify(content) ? 0 : 1),
      };
      for (const key of ['description', 'source'] as const)
        if (!(key in content)) delete papers[index][key];
    }
    return papers[index];
  }
  if (command.type === 'jlpt.start') {
    if (attempts.some((attempt) => attempt.status === 'active'))
      throw new Error('Conclua a prova em andamento antes de começar outra.');
    const attempt = {
      ...startAttempt(command.snapshot, command.startedAt),
      _id: id(command.localId),
      ownerId: data.profile._id,
      paperId: id(command.paperId),
      _creationTime: command.startedAt,
      ...(command.questId ? { questId: id(command.questId) } : {}),
    } as Doc<'jlptAttempts'>;
    attempts.push(attempt);
    return attempt;
  }
  const index = attempts.findIndex(
    (item) => item._id === id(command.attemptId),
  );
  const previous = attempts[index];
  if (!previous) throw new Error('Tentativa indisponível neste aparelho.');
  const next =
    command.type === 'jlpt.answer'
      ? answerAttempt(
          previous,
          {
            questionId: command.questionId,
            choice: command.choice,
            flagged: command.flagged,
          },
          command.occurredAt,
          command.expectedRevision,
        )
      : command.type === 'jlpt.advance'
        ? advanceAttempt(previous, command.occurredAt, command.expectedRevision)
        : finishAttempt(previous, command.occurredAt, command.expectedRevision);
  attempts[index] = { ...previous, ...next };
  if (
    previous.status !== 'completed' &&
    next.status === 'completed' &&
    next.completedAt !== undefined &&
    previous.questId
  )
    creditLocalQuests(data, {
      kind: 'shiken',
      questId: previous.questId,
      sourceId: previous._id,
      occurredAt: next.completedAt,
      paperId: previous.paperId,
    });
  return attempts[index];
}

export function queryJlptLocal(
  data: Data,
  name: string,
  args: Record<string, unknown>,
  aliases: Saved['aliases'],
): unknown {
  const papers = data.jlptPapers ?? [];
  const attempts = data.jlptAttempts ?? [];
  if (name === 'jlpt:get')
    return (
      papers.find((paper) => paper._id === resolve(args.id, aliases)) ?? null
    );
  if (name === 'jlpt:getAttempt')
    return (
      attempts.find((attempt) => attempt._id === resolve(args.id, aliases)) ??
      null
    );
  if (name === 'jlpt:active')
    return attempts.find((attempt) => attempt.status === 'active') ?? null;
  if (name === 'jlpt:history')
    return attempts
      .filter(
        (attempt) =>
          !args.paperId || attempt.paperId === resolve(args.paperId, aliases),
      )
      .sort((a, b) => b.startedAt - a.startedAt);
  if (name === 'jlpt:search') {
    const query = String(args.query ?? '')
      .trim()
      .normalize('NFKC')
      .toLowerCase();
    return papers
      .filter(
        (paper) =>
          paper.archived === (args.archived ?? false) &&
          (!args.level || paper.level === args.level) &&
          (!query ||
            [paper.title, paper.description, paper.source]
              .filter(Boolean)
              .join(' ')
              .normalize('NFKC')
              .toLowerCase()
              .includes(query)),
      )
      .sort(
        (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
      );
  }
  throw new Error(`Consulta de prova indisponível: ${name}`);
}
