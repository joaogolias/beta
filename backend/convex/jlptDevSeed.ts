import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { jlptPaperValidator } from './jlptValidators';
import { createForOwner, normalizePaper, validateReady } from './jlptDomain';
import { JLPT_SKILLS, type PaperInput } from '../../shared/jlpt';

// Deliberately internal and restricted to this development deployment. This is
// an operator seed, never an application endpoint or a way to provision users.
const DEV_URL = 'https://kindhearted-hare-87.convex.cloud';
const TARGET_EMAIL = 'joaovgolias@gmail.com';
const SEED_ID = 'babel-crux:dev:jlpt-n5-authorial-v1';
const QUESTION_PREFIX = 'n5-authorial-v1-';
const targetArgs = { tokenIdentifier: v.string(), email: v.string() };
const mediaValidator = v.object({
  questionId: v.string(),
  storageId: v.id('_storage'),
  sha256: v.string(),
});
type Context = QueryCtx | MutationCtx;

function requireDevelopment() {
  if (process.env.CONVEX_CLOUD_URL !== DEV_URL)
    throw new ConvexError(
      'Este seed só pode executar no desenvolvimento do Babel Crux.',
    );
}

async function requireTarget(
  ctx: Context,
  target: { tokenIdentifier: string; email: string },
) {
  requireDevelopment();
  if (
    target.email.toLowerCase() !== TARGET_EMAIL ||
    !target.tokenIdentifier.startsWith(
      'https://genuine-lark-146.clerk.accounts.dev|',
    )
  )
    throw new ConvexError('Identidade de desenvolvimento inesperada.');
  // The operator script resolves the email through the development Clerk API
  // first. Clerk JWTs need not include email, so existing rows may omit it.
  const owner = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', target.tokenIdentifier),
    )
    .unique();
  if (!owner || (owner.email && owner.email.toLowerCase() !== TARGET_EMAIL))
    throw new ConvexError(
      'Usuário esperado não encontrado; nenhum usuário será criado.',
    );
  return owner;
}

async function findExisting(ctx: Context, owner: Doc<'users'>) {
  const papers = await ctx.db
    .query('jlptPapers')
    .withIndex('by_ownerId_and_archived_and_title', (q) =>
      q.eq('ownerId', owner._id),
    )
    .take(101);
  if (papers.length > 100)
    throw new ConvexError(
      'Mais de 100 simulados neste usuário; revise o seed manualmente.',
    );
  const matches = papers.filter(
    (paper) =>
      paper.source?.includes(SEED_ID) ||
      paper.questions.some((question) =>
        question.id.startsWith(QUESTION_PREFIX),
      ),
  );
  if (matches.length > 1)
    throw new ConvexError(
      'Mais de um simulado corresponde ao seed; nenhum será sobrescrito.',
    );
  return matches[0] ?? null;
}

function summary(paper: Doc<'jlptPapers'>) {
  return {
    id: paper._id,
    ownerId: paper.ownerId,
    title: paper.title,
    archived: paper.archived,
    contentVersion: paper.contentVersion,
    questionCount: paper.questions.length,
    counts: Object.fromEntries(
      JLPT_SKILLS.map((skill) => [
        skill,
        paper.questions.filter((question) => question.skill === skill).length,
      ]),
    ),
    audio: paper.questions
      .filter((question) => question.skill === 'listening')
      .map((question) => ({
        questionId: question.id,
        url: question.audioUrl ?? null,
      })),
  };
}

function validateSeed(paper: PaperInput) {
  if (
    paper.level !== 'N5' ||
    paper.questions.length !== 20 ||
    !paper.source?.startsWith(SEED_ID) ||
    !paper.title.includes('autoral') ||
    paper.questions.some(
      (question) => !question.id.startsWith(QUESTION_PREFIX),
    ) ||
    JLPT_SKILLS.some(
      (skill) =>
        paper.questions.filter((question) => question.skill === skill)
          .length !== 5,
    )
  )
    throw new ConvexError(
      'O seed exige 20 questões autorais N5, cinco por habilidade.',
    );
}

export const inspect = internalQuery({
  args: targetArgs,
  handler: async (ctx, target) => {
    const owner = await requireTarget(ctx, target);
    const existing = await findExisting(ctx, owner);
    return {
      ownerId: owner._id,
      existing: existing ? summary(existing) : null,
    };
  },
});

export const prepareUpload = internalMutation({
  args: targetArgs,
  handler: async (ctx, target) => {
    await requireTarget(ctx, target);
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const inspectMedia = internalQuery({
  args: { ...targetArgs, files: v.array(mediaValidator) },
  handler: async (ctx, { files, ...target }) => {
    await requireTarget(ctx, target);
    if (files.length > 5)
      throw new ConvexError('Este seed usa no máximo cinco áudios.');
    return await Promise.all(
      files.map(async (file) => {
        const metadata = await ctx.db.system.get('_storage', file.storageId);
        const url = metadata ? await ctx.storage.getUrl(file.storageId) : null;
        if (
          !metadata ||
          !url ||
          metadata.sha256 !== file.sha256 ||
          (metadata.contentType !== undefined &&
            metadata.contentType !== 'audio/wav') ||
          metadata.size <= 44
        )
          throw new ConvexError(
            'Áudio ausente, inválido ou com checksum diferente.',
          );
        return { ...file, url, size: metadata.size };
      }),
    );
  },
});

export const seed = internalMutation({
  args: {
    ...targetArgs,
    paper: jlptPaperValidator,
    files: v.array(mediaValidator),
  },
  handler: async (ctx, { paper: input, files, ...target }) => {
    const owner = await requireTarget(ctx, target);
    const normalized = normalizePaper(input);
    validateSeed(normalized);
    const listening = normalized.questions.filter(
      (question) => question.skill === 'listening',
    );
    if (
      files.length !== 5 ||
      new Set(files.map((file) => file.questionId)).size !== 5 ||
      new Set(files.map((file) => file.storageId)).size !== 5 ||
      files.some(
        (file) =>
          !listening.some((question) => question.id === file.questionId),
      )
    )
      throw new ConvexError(
        'Associe um arquivo de áudio diferente a cada questão de escuta.',
      );
    const urls = new Map<string, string>();
    for (const file of files) {
      const metadata = await ctx.db.system.get('_storage', file.storageId);
      const url = metadata ? await ctx.storage.getUrl(file.storageId) : null;
      if (
        !metadata ||
        !url ||
        metadata.sha256 !== file.sha256 ||
        (metadata.contentType !== undefined &&
          metadata.contentType !== 'audio/wav') ||
        metadata.size <= 44
      )
        throw new ConvexError(
          'Áudio ausente, inválido ou com checksum diferente.',
        );
      urls.set(file.questionId, url);
    }
    const paper = normalizePaper({
      ...normalized,
      questions: normalized.questions.map((question) =>
        urls.has(question.id)
          ? { ...question, audioUrl: urls.get(question.id) }
          : question,
      ),
    });
    validateReady(paper);
    const existing = await findExisting(ctx, owner);
    if (existing) {
      if (JSON.stringify(normalizePaper(existing)) !== JSON.stringify(paper))
        throw new ConvexError(
          'O simulado do seed já existe e foi alterado. Preserve as edições; nenhum dado foi sobrescrito.',
        );
      return { created: false, ...summary(existing) };
    }
    const created = await createForOwner(ctx, owner._id, paper);
    return { created: true, ...summary(created) };
  },
});
