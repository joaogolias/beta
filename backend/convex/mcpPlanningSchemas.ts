import { z } from 'zod';

const level = z.enum(['N1', 'N2', 'N3', 'N4', 'N5']);
const category = z.enum(['alphabet', 'vocabulary', 'grammar']);
const id = z.string().min(1).max(128);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const pagination = {
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().max(16_384).nullable().default(null),
};
const uniqueIds = z
  .array(id)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'IDs repetidos não são permitidos.',
  );

export const questCreateSchema = z
  .object({
    quest: z
      .object({
        clientKey: z
          .string()
          .regex(/^[A-Za-z0-9_.:-]{8,128}$/)
          .describe(
            'Chave estável por ocorrência. Repetir a mesma chave e conteúdo devolve a quest; mudar conteúdo retorna CONFLICT.',
          ),
        title: z.string().trim().min(1).max(160),
        startsAt: timestamp.describe(
          'Início inclusivo em Unix milissegundos. Só atividades posteriores à criação contam.',
        ),
        dueAt: timestamp.describe(
          'Prazo exclusivo em Unix milissegundos; janela de até 90 dias.',
        ),
        timeZone: z
          .string()
          .min(1)
          .max(100)
          .describe(
            'Fuso IANA usado para planejar os instantes, como America/Sao_Paulo.',
          ),
        cardIds: uniqueIds
          .optional()
          .describe(
            'Seleção exata de cards pessoais ativos; pode misturar kanji, vocabulário e gramática.',
          ),
        paperIds: uniqueIds
          .optional()
          .describe(
            'Seleção exata de provas pessoais ativas para concluir nesta quest.',
          ),
        storyIds: uniqueIds
          .optional()
          .describe(
            'Histórias pessoais ativas, na ordem desejada. Descubra IDs em list_stories/get_story. Pode ser a única seleção; a leitura deve ser concluída dentro desta quest.',
          ),
      })
      .strict()
      .refine(
        (quest) =>
          (quest.cardIds?.length ?? 0) +
            (quest.paperIds?.length ?? 0) +
            (quest.storyIds?.length ?? 0) >
          0,
        'Selecione ao menos um card, uma prova ou uma história.',
      ),
  })
  .strict();
export const questListSchema = z
  .object({
    ...pagination,
    status: z.enum(['all', 'open', 'completed', 'cancelled']).default('all'),
  })
  .strict();
export const questSnapshotSchema = z
  .object({
    id,
    title: z.string(),
    startsAt: timestamp,
    dueAt: timestamp,
    timeZone: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
    cancelledAt: timestamp.optional(),
    completedAt: timestamp.optional(),
    cardIds: z.array(id),
    paperIds: z.array(id),
    storyIds: z.array(id).optional(),
    completedCardIds: z.array(id),
    completedPaperIds: z.array(id),
    completedStoryIds: z.array(id).optional(),
  })
  .strict();
export const questResultSchema = z.object({ quest: questSnapshotSchema });
export const questListResultSchema = z.object({
  items: z.array(questSnapshotSchema),
  cursor: z.string().nullable(),
  isDone: z.boolean(),
});

export const studyProgressSchema = z
  .object({
    category: z
      .enum(['all', 'alphabet', 'vocabulary', 'grammar'])
      .default('all'),
    level: level.optional(),
    archived: z.boolean().default(false),
    weakLimit: z.number().int().min(1).max(30).default(10),
  })
  .strict();
const overview = z.object({
  totalCards: z.number(),
  studiedCards: z.number(),
  neverStudiedCards: z.number(),
  correct: z.number(),
  partial: z.number(),
  incorrect: z.number(),
  attempts: z.number(),
  integralAccuracy: z.number().nullable(),
  weightedAccuracy: z.number().nullable(),
});
export const studyProgressResultSchema = z.object({
  filters: studyProgressSchema,
  basis: z.literal('lifetime_statistics_for_current_library'),
  overview,
  byCategory: z.array(z.object({ category, overview })),
  byLevel: z.array(z.object({ level, overview })),
  weakCards: z.array(
    z.object({
      id,
      category,
      label: z.string(),
      levels: z.array(z.string()),
      attempts: z.number(),
      correct: z.number(),
      partial: z.number(),
      incorrect: z.number(),
      weightedAccuracy: z.number(),
      lastReviewedAt: timestamp,
    }),
  ),
  hasMoreWeakCards: z.boolean(),
  truncated: z.literal(false),
  limits: z.object({
    scannedCards: z.number(),
    maxReadBytes: z.number(),
    weakCards: z.number(),
  }),
});

export const studyCardsSchema = z
  .object({
    ...pagination,
    category,
    level: level.optional(),
    archived: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export const studyCardsResultSchema = z.object({
  items: z.array(
    z.object({
      id,
      category,
      language: z.string(),
      label: z.string(),
      front: z.string(),
      back: z.string(),
      classifications: z.array(
        z.object({ scheme: z.string(), level: z.string() }),
      ),
      archived: z.boolean(),
      contentVersion: z.number(),
      stats: z.object({
        correct: z.number(),
        partial: z.number(),
        incorrect: z.number(),
        attempts: z.number(),
        integralAccuracy: z.number().nullable(),
        weightedAccuracy: z.number().nullable(),
        lastReviewedAt: timestamp.nullable(),
      }),
    }),
  ),
  cursor: z.string().nullable(),
  isDone: z.boolean(),
  scanned: z.number(),
  basis: z.literal('lifetime_statistics_for_current_library'),
});

export const shikenSearchSchema = z
  .object({
    ...pagination,
    limit: z.number().int().min(1).max(25).default(10),
    level: level.optional(),
    archived: z.boolean().default(false),
    query: z.string().max(300).optional(),
  })
  .strict();
const skill = z.enum(['vocabulary', 'grammar', 'reading', 'listening']);
export const shikenPaperSchema = z.object({
  id,
  title: z.string(),
  level,
  description: z.string().optional(),
  source: z.string().optional(),
  archived: z.boolean(),
  contentVersion: z.number(),
  questionCount: z.number(),
  bySkill: z.array(z.object({ skill, questionCount: z.number() })),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const shikenSearchResultSchema = z.object({
  items: z.array(shikenPaperSchema),
  cursor: z.string().nullable(),
  isDone: z.boolean(),
});
export const shikenPaperResultSchema = z.object({ paper: shikenPaperSchema });
export const shikenHistorySchema = z
  .object({
    ...pagination,
    limit: z.number().int().min(1).max(25).default(10),
    paperId: id.optional(),
    level: level.optional(),
    status: z.enum(['all', 'active', 'completed']).default('all'),
  })
  .strict();
const score = z.object({
  total: z.number(),
  answered: z.number(),
  correct: z.number(),
  incorrect: z.number(),
  unanswered: z.number(),
  percentage: z.number().nullable(),
});
export const shikenAttemptSummarySchema = z.object({
  id,
  paperId: id,
  title: z.string(),
  level,
  status: z.enum(['active', 'completed']),
  startedAt: timestamp,
  completedAt: timestamp.optional(),
  result: score
    .extend({ bySkill: z.array(score.extend({ skill })) })
    .nullable(),
});
export const shikenHistoryResultSchema = z.object({
  items: z.array(shikenAttemptSummarySchema),
  cursor: z.string().nullable(),
  isDone: z.boolean(),
  scanned: z.number(),
  summaryScope: z.literal('this_page_only'),
  pageSummary: z.object({
    completed: z.number(),
    total: z.number(),
    correct: z.number(),
    percentage: z.number().nullable(),
  }),
});

export type McpQuestList = z.infer<typeof questListSchema>;
export type McpStudyProgress = z.infer<typeof studyProgressSchema>;
export type McpStudyProgressResult = z.infer<typeof studyProgressResultSchema>;
export type McpStudyCards = z.infer<typeof studyCardsSchema>;
export type McpStudyCardsResult = z.infer<typeof studyCardsResultSchema>;
export type McpShikenSearch = z.infer<typeof shikenSearchSchema>;
export type McpShikenHistory = z.infer<typeof shikenHistorySchema>;
export type McpShikenPaper = z.infer<typeof shikenPaperSchema>;
export type McpShikenHistoryResult = z.infer<typeof shikenHistoryResultSchema>;
