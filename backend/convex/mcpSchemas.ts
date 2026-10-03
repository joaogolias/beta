import { z } from 'zod';

const text = z.string().min(1).max(2_000);
const shortText = z.string().min(1).max(300);
const details = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('kanji'),
      kunYomi: z.array(shortText).max(32),
      onYomi: z.array(shortText).max(32),
      radicals: z.array(shortText).max(32),
    })
    .strict(),
  z
    .object({
      kind: z.literal('generic'),
      readings: z.array(shortText).max(32),
    })
    .strict(),
]);

export const contentSchema = z
  .object({
    language: z
      .string()
      .min(2)
      .max(64)
      .describe('Idioma BCP-47, por exemplo ja.'),
    writingSystem: z
      .string()
      .min(1)
      .max(40)
      .describe(
        'Sistema de escrita ISO 15924: Hani para kanji; Hira, Kana, Latn ou Hang no futuro.',
      ),
    symbol: shortText.describe('Caractere ou símbolo, por exemplo 日.'),
    meanings: z.array(shortText).min(1).max(32),
    examples: z
      .array(
        z
          .object({
            text,
            reading: text.optional(),
            meaning: text.optional(),
          })
          .strict(),
      )
      .max(24),
    front: text.describe('Conteúdo mostrado antes de revelar o flashcard.'),
    back: z
      .string()
      .min(1)
      .max(40_000)
      .describe('Resposta e explicação do flashcard.'),
    sortKey: z
      .string()
      .max(300)
      .describe('Campo legado derivado das leituras, não editável.'),
    classifications: z
      .array(
        z
          .object({
            scheme: shortText.describe('jlpt para classificação japonesa.'),
            level: shortText.describe('N5, N4, N3, N2 ou N1 para JLPT.'),
          })
          .strict(),
      )
      .max(16),
    details,
  })
  .strict();

export const createContentSchema = contentSchema
  .omit({ sortKey: true })
  .extend({
    front: z
      .string()
      .max(2_000)
      .optional()
      .describe(
        'Gerado a partir de symbol para kanji; obrigatório apenas para generic.',
      ),
    back: z
      .string()
      .max(40_000)
      .optional()
      .describe(
        'Gerado a partir de significados, leituras e radicais para kanji; obrigatório apenas para generic.',
      ),
  })
  .superRefine((card, ctx) => {
    if (card.details.kind !== 'generic') return;
    for (const field of ['front', 'back'] as const) {
      if (!card[field]?.trim())
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Preencha este campo para cards generic.',
        });
    }
    if (card.back && card.back.length > 8_000)
      ctx.addIssue({
        code: 'custom',
        path: ['back'],
        message: 'O verso de cards generic aceita até 8.000 caracteres.',
      });
  });

export const patchSchema = contentSchema
  .omit({ sortKey: true })
  .extend({ front: z.string().max(2_000), back: z.string().max(40_000) })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe pelo menos um campo para atualizar.',
  )
  .superRefine((patch, ctx) => {
    if (
      patch.details?.kind === 'generic' &&
      patch.back &&
      patch.back.length > 8_000
    )
      ctx.addIssue({
        code: 'custom',
        path: ['back'],
        message: 'O verso de cards generic aceita até 8.000 caracteres.',
      });
  });

export const searchSchema = z
  .object({
    query: z
      .string()
      .max(200)
      .optional()
      .describe('Busca símbolo, significados, kun-yomi e on-yomi.'),
    language: z.string().max(40).optional(),
    writingSystem: z.string().max(40).optional(),
    level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
    reading: z
      .string()
      .max(200)
      .optional()
      .describe('Leitura kun-yomi ou on-yomi; aceita hiragana e katakana.'),
    radical: z.string().max(200).optional(),
    archived: z
      .boolean()
      .optional()
      .describe('Padrão false. Use true para procurar somente arquivados.'),
    limit: z.number().int().min(1).max(100).default(30),
    cursor: z.string().max(10_000).nullable().default(null),
  })
  .strict();

export const idSchema = z.object({ id: z.string().min(1).max(100) }).strict();
export const updateSchema = idSchema.extend({ patch: patchSchema }).strict();

export const cardSchema = contentSchema
  .extend({
    id: z.string(),
    archived: z.boolean(),
    contentVersion: z.number().int(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();

export const cardResultSchema = z.object({ card: cardSchema }).strict();
export const searchResultSchema = z
  .object({
    items: z.array(cardSchema),
    cursor: z.string().nullable(),
    isDone: z.boolean(),
  })
  .strict();

export type McpCard = z.infer<typeof cardSchema>;
export type McpSearch = z.infer<typeof searchSchema>;

const translationsSchema = z
  .object({
    pt: z.array(shortText).max(32).optional(),
    en: z.array(shortText).max(32).optional(),
  })
  .strict();

export const vocabularyContentSchema = z
  .object({
    language: contentSchema.shape.language,
    expression: shortText.describe(
      'Palavra ou expressão na grafia original, por exemplo 食べる.',
    ),
    reading: z
      .string()
      .max(300)
      .describe(
        'Leitura em hiragana ou katakana; vazia quando readingOmitted for true.',
      ),
    readingOmitted: z.boolean().optional(),
    translations: translationsSchema.describe(
      'Traduções em português e/ou inglês. Preencha pelo menos um idioma.',
    ),
    examples: z
      .array(
        z
          .object({
            text: z.string().min(1).max(1_000),
            reading: z.string().min(1).max(1_000).optional(),
            meaning: z.string().min(1).max(1_000).optional(),
          })
          .strict(),
      )
      .max(24),
    front: text.describe(
      'Frente gerada automaticamente a partir da expressão.',
    ),
    back: z
      .string()
      .min(1)
      .max(100_000)
      .describe('Verso gerado com leitura, traduções e exemplos.'),
    sortKey: z
      .string()
      .max(300)
      .describe('Campo legado derivado, não editável.'),
    classifications: z
      .array(
        z
          .object({
            scheme: z.string().min(1).max(32),
            level: z.string().min(1).max(32),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();

export const vocabularyCreateSchema = vocabularyContentSchema
  .omit({ front: true, back: true, sortKey: true })
  .extend({ reading: z.string().max(300).optional() });

export const vocabularyPatchSchema = vocabularyCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe pelo menos um campo para atualizar.',
  );

export const vocabularySearchSchema = z
  .object({
    query: z
      .string()
      .max(256)
      .optional()
      .describe(
        'Texto separado em termos por espaços. Busca expressão, leitura, traduções, exemplos, frente, verso e classificações.',
      ),
    terms: z
      .array(z.string().min(1).max(256))
      .max(24)
      .optional()
      .describe(
        'Termos explícitos; cada entrada pode conter espaços. Se query também for informado, seus termos serão adicionados à mesma busca.',
      ),
    operator: z
      .enum(['AND', 'OR'])
      .default('AND')
      .describe(
        'AND exige todos os termos no mesmo card; OR aceita qualquer termo. Os filtros sempre se intersectam com o resultado.',
      ),
    language: z.string().max(40).optional(),
    level: searchSchema.shape.level,
    archived: searchSchema.shape.archived,
    limit: searchSchema.shape.limit,
    cursor: searchSchema.shape.cursor,
  })
  .strict();

export const vocabularyUpdateSchema = idSchema
  .extend({ patch: vocabularyPatchSchema })
  .strict();
export const vocabularyArchiveSchema = idSchema
  .extend({
    archived: z
      .boolean()
      .describe('true arquiva; false restaura o card para o estudo.'),
  })
  .strict();

export const vocabularyCardSchema = vocabularyContentSchema
  .extend({
    id: z.string(),
    archived: z.boolean(),
    contentVersion: z.number().int(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export const vocabularyCardResultSchema = z
  .object({ card: vocabularyCardSchema })
  .strict();
export const vocabularySearchResultSchema = z
  .object({
    items: z.array(vocabularyCardSchema.extend({ summary: z.string() })),
    cursor: z.string().nullable(),
    isDone: z.boolean(),
  })
  .strict();

export type McpVocabularyCard = z.infer<typeof vocabularyCardSchema>;
export type McpVocabularySearch = z.infer<typeof vocabularySearchSchema>;

export const grammarContentSchema = z
  .object({
    language: contentSchema.shape.language,
    title: shortText.describe('Título da estrutura ou ponto gramatical.'),
    explanation: z
      .string()
      .min(1)
      .max(8_000)
      .describe('Explicação do uso da estrutura gramatical.'),
    shortExplanation: z
      .string()
      .max(2_000)
      .optional()
      .describe('Resumo opcional mostrado no verso; vazio remove o resumo.'),
    examples: vocabularyContentSchema.shape.examples,
    front: shortText.describe('Frente gerada a partir do título/estrutura.'),
    back: z
      .string()
      .max(100_000)
      .describe('Resumo e exemplos gerados para o verso.'),
    sortKey: z
      .string()
      .max(300)
      .describe('Campo legado não editável; ordem por criação.'),
    classifications: vocabularyContentSchema.shape.classifications,
  })
  .strict();

export const grammarCreateSchema = grammarContentSchema.omit({
  front: true,
  back: true,
  sortKey: true,
});

export const grammarPatchSchema = grammarCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe pelo menos um campo para atualizar.',
  );
export const grammarSearchSchema = vocabularySearchSchema
  .extend({
    query: vocabularySearchSchema.shape.query.describe(
      'Texto separado em termos por espaços. Busca título, explicação completa, explicação curta, exemplos, classificações e idioma.',
    ),
  })
  .strict();
export const grammarUpdateSchema = idSchema
  .extend({ patch: grammarPatchSchema })
  .strict();
export const grammarArchiveSchema = vocabularyArchiveSchema;
export const grammarCardSchema = grammarContentSchema
  .extend({
    id: z.string(),
    archived: z.boolean(),
    contentVersion: z.number().int(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export const grammarCardResultSchema = z
  .object({ card: grammarCardSchema })
  .strict();
export const grammarSearchResultSchema = z
  .object({
    items: z.array(grammarCardSchema.extend({ summary: z.string() })),
    cursor: z.string().nullable(),
    isDone: z.boolean(),
  })
  .strict();

export type McpGrammarCard = z.infer<typeof grammarCardSchema>;
export type McpGrammarSearch = z.infer<typeof grammarSearchSchema>;
