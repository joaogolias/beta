import { z } from 'zod';

const level = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']);
const id = z.string().min(1).max(128);
const contentId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const authoredText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((text) => text.trim().length > 0, 'Informe um texto não vazio.');
const segment = z
  .object({
    text: authoredText(6000),
    reading: z
      .string()
      .min(1)
      .max(200)
      // Keep Unicode script validation on the server: JSON Schema consumers
      // may reject \p escapes or evaluate pattern without JavaScript's u flag.
      .refine(
        (text) =>
          /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(text),
        'Informe uma leitura em hiragana ou katakana.',
      )
      .refine((text) => text.trim().length > 0)
      .optional()
      .describe(
        'Leitura contextual em kana, fornecida pelo autor para este trecho. Nunca deduza de kanji isolado.',
      ),
  })
  .strict();
const paragraph = z
  .object({
    id: contentId,
    segments: z.array(segment).min(1).max(200),
    translation: authoredText(6000).optional(),
  })
  .strict();
const question = z
  .object({
    id: contentId,
    prompt: authoredText(2000),
    options: z
      .array(z.object({ id: contentId, text: authoredText(1000) }).strict())
      .min(2)
      .max(6),
    correctOptionId: contentId,
    explanation: authoredText(4000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.options.map((option) => option.id)).size !==
      value.options.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'IDs de alternativas devem ser únicos.',
      });
    if (!value.options.some((option) => option.id === value.correctOptionId))
      ctx.addIssue({
        code: 'custom',
        path: ['correctOptionId'],
        message: 'O gabarito deve apontar para uma alternativa existente.',
      });
  });
const contentFields = {
  title: z.string().trim().min(1).max(160),
  level,
  paragraphs: z.array(paragraph).min(1).max(200),
  questions: z.array(question).min(1).max(30),
};
const content = z
  .object({
    ...contentFields,
    paragraphs: z
      .array(paragraph.extend({ translation: authoredText(6000) }))
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of ['paragraphs', 'questions'] as const)
      if (new Set(value[key].map((item) => item.id)).size !== value[key].length)
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'IDs devem ser únicos nesta lista.',
        });
    if (new TextEncoder().encode(JSON.stringify(value)).length > 64 * 1024)
      ctx.addIssue({
        code: 'custom',
        message: 'A história deve ocupar até 64 KiB em JSON UTF-8.',
      });
  });

export const storyCreateSchema = z
  .object({
    clientKey: z
      .string()
      .regex(/^[A-Za-z0-9_.:-]{8,128}$/)
      .describe(
        'Chave estável da ocorrência; repita a mesma chave e conteúdo após uma falha de rede.',
      ),
    story: content,
  })
  .strict();
export const storyArchiveSchema = z
  .object({ id, archived: z.boolean() })
  .strict();
export const storyUpdateSchema = z
  .object({
    id,
    expectedContentVersion: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .describe(
        'contentVersion retornado por get_story; impede sobrescrever uma edição concorrente.',
      ),
    story: content,
  })
  .strict();
export const storyListSchema = z
  .object({
    level: level.optional(),
    status: z.enum(['all', 'new', 'completed']).default('all'),
    archived: z.boolean().default(false),
    limit: z.number().int().min(1).max(30).default(20),
    cursor: z.string().max(16_384).nullable().default(null),
  })
  .strict();
const progress = z
  .object({
    storyId: id,
    contentVersion: z.number().int().positive().optional(),
    paragraphIndex: z.number().int().nonnegative(),
    paragraphUpdatedAt: timestamp,
    answers: z.array(
      z
        .object({
          questionId: contentId,
          optionId: contentId,
          answeredAt: timestamp,
        })
        .strict(),
    ),
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp.optional(),
  })
  .strict();
const record = z
  .object({
    ...contentFields,
    id,
    contentVersion: z.number().int().positive().optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    archived: z.boolean(),
  })
  .strict();
export const storyResultSchema = z.object({ story: record });
export const storyGetResultSchema = z.object({
  story: record,
  progress: progress.nullable(),
});
export const storyListResultSchema = z.object({
  items: z.array(
    z
      .object({
        id,
        contentVersion: z.number().int().positive().optional(),
        title: z.string(),
        level,
        paragraphCount: z.number().int().nonnegative(),
        questionCount: z.number().int().nonnegative(),
        characterCount: z.number().int().nonnegative(),
        createdAt: timestamp,
        archived: z.boolean(),
        progress: progress.nullable(),
      })
      .strict(),
  ),
  cursor: z.string().nullable(),
  isDone: z.boolean(),
});
export type McpStoryList = z.infer<typeof storyListSchema>;
export type McpStoryUpdate = z.infer<typeof storyUpdateSchema>;
