import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { createForOwner, requirePaper } from './jlptDomain';
import {
  jlptFail,
  normalizePaper,
  validateReady,
  utf8Length,
  type PaperInput,
} from '../../shared/jlpt';

export type ShikenCreateInput = { clientKey: string; paper: PaperInput };

/** A creation receipt preserves the original request even after editorial changes. */
export async function createShikenForOwner(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  input: ShikenCreateInput,
  validatePaper?: (paper: PaperInput) => Promise<void>,
) {
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.clientKey))
    jlptFail('VALIDATION', 'Use uma chave de criação de 8 a 128 caracteres.');
  // normalizePaper builds keys in a deterministic order and omits blank optional fields.
  const normalized = normalizePaper(input.paper);
  const originalContent = JSON.stringify(normalized);
  const existing = await ctx.db
    .query('jlptAuthorshipRequests')
    .withIndex('by_ownerId_and_clientKey', (q) =>
      q.eq('ownerId', ownerId).eq('clientKey', input.clientKey),
    )
    .unique();
  if (existing) {
    if (existing.originalContent !== originalContent)
      jlptFail(
        'CONFLICT',
        'Esta chave de criação já foi usada com outro conteúdo.',
      );
    return requirePaper(ctx, ownerId, existing.paperId);
  }
  // The mobile editor may keep drafts; an authored MCP paper must be playable.
  validateReady(normalized);
  await validatePaper?.(normalized);
  const paper = await createForOwner(ctx, ownerId, normalized);
  await ctx.db.insert('jlptAuthorshipRequests', {
    ownerId,
    clientKey: input.clientKey,
    paperId: paper._id,
    originalContent,
  });
  return paper;
}

export const SHIKEN_CONTENT_PAGE_BYTES = 32_000;
export type ShikenContentInput = {
  id: Id<'jlptPapers'>;
  questionOffset?: number;
  questionLimit?: number;
  expectedContentVersion?: number;
};

/** Editorial pages include complete questions; a version guard prevents mixed editions. */
export async function getShikenContentForOwner(
  ctx: MutationCtx | QueryCtx,
  ownerId: Id<'users'>,
  args: ShikenContentInput,
) {
  const paper = await requirePaper(ctx, ownerId, args.id);
  const questionOffset = args.questionOffset ?? 0;
  const questionLimit = args.questionLimit ?? 20;
  if (
    !Number.isSafeInteger(questionOffset) ||
    questionOffset < 0 ||
    questionOffset > paper.questions.length
  )
    jlptFail('VALIDATION', 'A posição da página de questões é inválida.');
  if (
    !Number.isSafeInteger(questionLimit) ||
    questionLimit < 1 ||
    questionLimit > 50
  )
    jlptFail('VALIDATION', 'Consulte de 1 a 50 questões por página.');
  if (questionOffset > 0 && args.expectedContentVersion === undefined)
    jlptFail(
      'VALIDATION',
      'Informe a versão da primeira página para continuar a leitura.',
    );
  if (args.expectedContentVersion !== undefined) {
    if (
      !Number.isSafeInteger(args.expectedContentVersion) ||
      args.expectedContentVersion < 1
    )
      jlptFail('VALIDATION', 'A versão esperada do simulado é inválida.');
    if (args.expectedContentVersion !== paper.contentVersion)
      jlptFail(
        'CONFLICT',
        'Este simulado mudou. Reinicie a leitura pela primeira página.',
      );
  }
  const questions: PaperInput['questions'] = [];
  let bytes = 0;
  for (const question of paper.questions.slice(
    questionOffset,
    questionOffset + questionLimit,
  )) {
    const size = utf8Length(JSON.stringify(question));
    // Never truncate the text or answer of an individual question.
    if (questions.length && bytes + size > SHIKEN_CONTENT_PAGE_BYTES) break;
    questions.push(question);
    bytes += size;
  }
  const next = questionOffset + questions.length;
  return {
    id: paper._id,
    title: paper.title,
    level: paper.level,
    ...(paper.description !== undefined
      ? { description: paper.description }
      : {}),
    ...(paper.source !== undefined ? { source: paper.source } : {}),
    archived: paper.archived,
    contentVersion: paper.contentVersion,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
    totalQuestions: paper.questions.length,
    questionOffset,
    questions,
    nextQuestionOffset: next < paper.questions.length ? next : null,
  };
}
