import { z } from 'zod';
import { QUESTION_KINDS } from '../../shared/jlpt';
import {
  SHIKEN_MEDIA_TYPES,
  MAX_SHIKEN_MEDIA_BYTES,
} from './shikenMediaValidators';

const id = z.string().min(1).max(128);
const clientKey = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const level = z.enum(['N1', 'N2', 'N3', 'N4', 'N5']);
const httpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use uma URL HTTPS sem credenciais.');

const questionSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    skill: z.enum(['vocabulary', 'grammar', 'reading', 'listening']),
    kind: z.enum(QUESTION_KINDS.map((kind) => kind.value)),
    prompt: z.string().trim().min(1).max(12000),
    passage: z.string().max(16000).optional(),
    choices: z.array(z.string().trim().min(1).max(2000)).min(3).max(4),
    correctChoice: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(1).max(12000),
    audioUrl: httpsUrl
      .optional()
      .describe(
        'URL pronta de áudio obtida em get_shiken_media; nunca envie a URL temporária de upload.',
      ),
    imageUrl: httpsUrl
      .optional()
      .describe(
        'URL pronta de imagem obtida em get_shiken_media; nunca envie base64.',
      ),
  })
  .strict();

export const shikenCreateSchema = z
  .object({
    clientKey: clientKey.describe(
      'Chave estável por prova e usuário. Preserve a chave e o conteúdo original ao repetir após falha; conteúdo diferente retorna CONFLICT.',
    ),
    paper: z
      .object({
        title: z.string().trim().min(1).max(300),
        level,
        description: z.string().max(4000).optional(),
        source: z.string().max(2000).optional(),
        questions: z.array(questionSchema).max(200),
      })
      .strict()
      .describe(
        'Conteúdo completo de até 400.000 bytes JSON UTF-8. Exige quatro habilidades e áudio em toda questão de escuta. kind deve combinar com skill e nível; 4 alternativas, ou 3/4 em escuta; IDs e alternativas únicos e gabarito válido.',
      ),
  })
  .strict();

export const shikenContentSchema = z
  .object({
    id,
    questionOffset: z.number().int().nonnegative().max(200).default(0),
    questionLimit: z.number().int().min(1).max(50).default(20),
    expectedContentVersion: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe(
        'Obrigatório depois da primeira página. Use contentVersion retornada para impedir mistura entre edições.',
      ),
  })
  .strict();
export const shikenContentResultSchema = z.object({
  id,
  title: z.string(),
  level,
  description: z.string().optional(),
  source: z.string().optional(),
  archived: z.boolean(),
  contentVersion: z.number().int().positive(),
  createdAt: timestamp,
  updatedAt: timestamp,
  totalQuestions: z.number().int().nonnegative(),
  questionOffset: z.number().int().nonnegative(),
  questions: z.array(questionSchema),
  nextQuestionOffset: z.number().int().nonnegative().nullable(),
});

const contentType = z.enum(SHIKEN_MEDIA_TYPES);
const mediaFields = {
  clientKey,
  contentType,
  byteLength: z.number().int().min(1).max(MAX_SHIKEN_MEDIA_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
};
export const shikenMediaPrepareSchema = z.object(mediaFields).strict();
export const shikenMediaSchema = z.object({
  id,
  ...mediaFields,
  status: z.enum(['pending', 'ready']),
  url: z.string().url().nullable(),
});
export const shikenMediaResultSchema = z.object({ media: shikenMediaSchema });
export const shikenMediaPrepareResultSchema = shikenMediaSchema.extend({
  upload: z
    .object({
      url: z.string().url(),
      method: z.literal('POST'),
      contentType,
      expiresAt: timestamp,
    })
    .nullable(),
});

export type McpShikenCreate = z.infer<typeof shikenCreateSchema>;
export type McpShikenContent = z.infer<typeof shikenContentSchema>;
export type McpShikenContentResult = z.infer<typeof shikenContentResultSchema>;
export type McpShikenMediaPrepare = z.infer<typeof shikenMediaPrepareSchema>;
export type McpShikenMedia = z.infer<typeof shikenMediaSchema>;
export type McpShikenMediaPrepared = z.infer<
  typeof shikenMediaPrepareResultSchema
>;
