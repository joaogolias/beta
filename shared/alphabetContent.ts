import { ConvexError, type Infer } from 'convex/values';
import type { PaginationOptions } from 'convex/server';
import type { Doc } from '../backend/convex/_generated/dataModel';
import type {
  alphabetContentValidator,
  alphabetCreateValidator,
  alphabetPatchValidator,
} from '../backend/convex/alphabetValidators';
import { formatKanjiFaces } from './kanji';
import { derivedCardSortKey } from './libraryOrder';

export type AlphabetContent = Infer<typeof alphabetContentValidator>;
export type AlphabetCreateInput = Infer<typeof alphabetCreateValidator>;
export type AlphabetPatch = Infer<typeof alphabetPatchValidator>;
export type AlphabetFilters = {
  query?: string;
  language?: string;
  writingSystem?: string;
  level?: string;
  reading?: string;
  radical?: string;
};
export type AlphabetSearch = AlphabetFilters & {
  archived?: boolean;
  paginationOpts: PaginationOptions;
};

export function fail(
  code: 'VALIDATION' | 'UNAUTHENTICATED' | 'CONFLICT' | 'UNAVAILABLE',
  message: string,
): never {
  throw new ConvexError({ code, message });
}

function text(value: string, field: string, max = 2000) {
  const result = value.trim().normalize('NFC');
  if (!result || result.length > max) {
    fail('VALIDATION', `${field}: preencha entre 1 e ${max} caracteres.`);
  }
  return result;
}

// Unicode NFC itself folds some compatibility ideographs. Keep those codepoints
// and variation selectors intact, because they can identify distinct glyph cards.
export function normalizeSymbol(value: string) {
  const result = value
    .trim()
    .split(/([\uF900-\uFAFF\u{2F800}-\u{2FA1F}])/u)
    .map((part, index) => (index % 2 ? part : part.normalize('NFC')))
    .join('');
  if (!result || Array.from(result).length > 64) {
    fail('VALIDATION', 'Símbolo: preencha entre 1 e 64 caracteres.');
  }
  return result;
}

function list(values: string[], field: string, required = false, max = 32) {
  if (values.length > max)
    fail('VALIDATION', `${field}: máximo de ${max} itens.`);
  const result = [...new Set(values.map((value) => text(value, field, 300)))];
  if (required && !result.length)
    fail('VALIDATION', `${field}: informe um item.`);
  return result;
}

function languageTag(value: string) {
  const result = value.trim().toLowerCase();
  if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(result) || result.length > 64) {
    fail(
      'VALIDATION',
      'Idioma inválido. Use uma etiqueta como ja, pt-BR ou ko.',
    );
  }
  return result;
}

function writingSystemCode(value: string) {
  const result = value.trim();
  if (!/^[a-z]{4}$/i.test(result)) {
    fail('VALIDATION', 'Sistema de escrita inválido. Use Hani, Latn ou Hang.');
  }
  return result[0].toUpperCase() + result.slice(1).toLowerCase();
}

export function normalizeContent(input: AlphabetCreateInput): AlphabetContent {
  const language = languageTag(input.language);
  const writingSystem = writingSystemCode(input.writingSystem);
  const symbol = normalizeSymbol(input.symbol);
  if (input.classifications.length > 16) {
    fail('VALIDATION', 'Máximo de 16 classificações.');
  }
  const classifications = input.classifications.map(({ scheme, level }) => ({
    scheme: text(scheme, 'Classificação', 32).toLowerCase(),
    level: text(level, 'Nível', 32).toUpperCase(),
  }));
  if (
    new Set(classifications.map(({ scheme, level }) => `${scheme}:${level}`))
      .size !== classifications.length
  ) {
    fail('VALIDATION', 'Não repita o mesmo nível de uma classificação.');
  }
  const jlpt = classifications.filter(({ scheme }) => scheme === 'jlpt');
  if (jlpt.some(({ level }) => !/^N[1-5]$/.test(level)))
    fail('VALIDATION', 'Nível JLPT deve ser N1 a N5.');
  let details: AlphabetContent['details'];
  if (input.details.kind === 'kanji') {
    if (language.split('-')[0] !== 'ja' || writingSystem !== 'Hani') {
      fail(
        'VALIDATION',
        'Detalhes de kanji exigem idioma japonês e escrita Hani.',
      );
    }
    if (!/^\p{Script=Han}[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]?$/u.test(symbol)) {
      fail('VALIDATION', 'Informe um único kanji.');
    }
    if (!jlpt.length)
      fail('VALIDATION', 'Informe ao menos um nível JLPT deste kanji.');
    const kunYomi = list(input.details.kunYomi, 'Kun’yomi');
    const onYomi = list(input.details.onYomi, 'On’yomi');
    details = {
      kind: 'kanji',
      kunYomi,
      onYomi,
      radicals: list(input.details.radicals, 'Radicais'),
    };
  } else {
    if (language.split('-')[0] === 'ja' && writingSystem === 'Hani') {
      fail(
        'VALIDATION',
        'Caracteres japoneses Hani devem incluir detalhes de kanji.',
      );
    }
    details = {
      kind: 'generic',
      readings: list(input.details.readings, 'Leituras'),
    };
  }
  if (input.examples.length > 24) fail('VALIDATION', 'Máximo de 24 exemplos.');
  const meanings = list(input.meanings, 'Significados', true);
  const faces =
    details.kind === 'kanji'
      ? formatKanjiFaces({ symbol, meanings, details })
      : {
          front: text(input.front ?? '', 'Frente'),
          back: text(input.back ?? '', 'Verso', 8000),
        };
  return {
    language,
    writingSystem,
    symbol,
    meanings,
    examples: input.examples.map((example) => ({
      text: text(example.text, 'Exemplo', 1000),
      ...(example.reading?.trim()
        ? { reading: text(example.reading, 'Leitura do exemplo', 1000) }
        : {}),
      ...(example.meaning?.trim()
        ? { meaning: text(example.meaning, 'Significado do exemplo', 1000) }
        : {}),
    })),
    ...faces,
    sortKey: derivedCardSortKey({ language, details }),
    classifications,
    details,
  };
}

export function contentOf(card: AlphabetContent): AlphabetContent {
  return {
    language: card.language,
    writingSystem: card.writingSystem,
    symbol: card.symbol,
    meanings: card.meanings,
    examples: card.examples,
    front: card.front,
    back: card.back,
    sortKey: card.sortKey,
    classifications: card.classifications,
    details: card.details,
  };
}

export function normalizedSearch(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

function readingSearch(value: string) {
  return normalizedSearch(value).replace(/[.\-・\s]/g, '');
}

export function normalizeFilters(filters: AlphabetFilters): AlphabetFilters {
  const result: AlphabetFilters = {};
  for (const key of ['query', 'reading', 'radical'] as const) {
    if (filters[key]?.trim()) result[key] = text(filters[key], 'Busca', 256);
  }
  if (filters.language) result.language = languageTag(filters.language);
  if (filters.writingSystem)
    result.writingSystem = writingSystemCode(filters.writingSystem);
  if (filters.level) {
    result.level = filters.level.trim().toUpperCase();
    if (!/^N[1-5]$/.test(result.level))
      fail('VALIDATION', 'Nível JLPT deve ser N1 a N5.');
  }
  return result;
}

export function matchesFilters(
  card: AlphabetContent,
  filters: AlphabetFilters,
) {
  if (
    filters.language &&
    card.language !== filters.language &&
    (filters.language.includes('-') ||
      !card.language.startsWith(`${filters.language}-`))
  )
    return false;
  if (filters.writingSystem && card.writingSystem !== filters.writingSystem)
    return false;
  if (
    filters.level &&
    !card.classifications.some(
      ({ scheme, level }) => scheme === 'jlpt' && level === filters.level,
    )
  )
    return false;
  const readings =
    card.details.kind === 'kanji'
      ? [...card.details.kunYomi, ...card.details.onYomi]
      : card.details.readings;
  const radicals = card.details.kind === 'kanji' ? card.details.radicals : [];
  if (
    filters.reading &&
    !readings.some((reading) =>
      readingSearch(reading).includes(readingSearch(filters.reading!)),
    )
  )
    return false;
  if (
    filters.radical &&
    !radicals.some((radical) =>
      normalizedSearch(radical).includes(normalizedSearch(filters.radical!)),
    )
  )
    return false;
  if (filters.query) {
    const fields = [
      card.symbol,
      ...card.meanings,
      card.front,
      card.back,
      card.sortKey,
      ...readings,
      ...radicals,
      ...card.examples.flatMap((example) => [
        example.text,
        example.reading ?? '',
        example.meaning ?? '',
      ]),
    ];
    const terms = normalizedSearch(filters.query).split(/\s+/);
    if (
      !terms.every(
        (term) =>
          fields.some((field) => normalizedSearch(field).includes(term)) ||
          readings.some((reading) =>
            readingSearch(reading).includes(readingSearch(term)),
          ),
      )
    )
      return false;
  }
  return true;
}

/** Project legacy cards immediately without changing existing review history. */
export function canonicalCard(
  card: Doc<'alphabetCards'>,
): Doc<'alphabetCards'> {
  const sortKey = derivedCardSortKey(card);
  if (card.details.kind !== 'kanji') return { ...card, sortKey };
  const faces = formatKanjiFaces({
    symbol: card.symbol,
    meanings: card.meanings,
    details: card.details,
  });
  if (card.front === faces.front && card.back === faces.back)
    return { ...card, sortKey };
  return {
    ...card,
    ...faces,
    sortKey,
    contentVersion: card.contentVersion + 1,
  };
}

export type AlphabetCard = Doc<'alphabetCards'>;
