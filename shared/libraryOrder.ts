const smallKana: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
  ゕ: 'か',
  ゖ: 'け',
};

const vowelRows = [
  ['あ', 'あかさたなはまやらわ'],
  ['い', 'いきしちにひみりゐ'],
  ['う', 'うくすつぬふむゆる'],
  ['え', 'えけせてねへめれゑ'],
  ['お', 'おこそとのほもよろを'],
] as const;

/**
 * Stable index key, independent of the host's ICU version. Japanese readings
 * share gojūon primary weights across kana scripts and widths. Voicing and
 * small/long forms break ties only after the whole base reading is compared.
 * This is a deliberately bounded reading order, not full Unicode collation.
 * Changing it requires backfilling the persisted keys before switching reads.
 */
export function libraryReadingSortKey(sortKey: string, language = 'ja') {
  const normalized = sortKey.trim().normalize('NFKC').toLowerCase();
  if (language.split('-')[0] !== 'ja') return normalized;
  const kana = normalized
    .normalize('NFD')
    .replace(/[\u30A1-\u30F6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    );
  const primary: string[] = [];
  const voicing: string[] = [];
  const form: string[] = [];
  for (const char of kana) {
    if (/[\s.\-・]/u.test(char)) continue;
    if (char === '\u3099' || char === '\u309a') {
      if (voicing.length)
        voicing[voicing.length - 1] = char === '\u3099' ? '1' : '2';
      continue;
    }
    const previous = primary.at(-1);
    const prolonged =
      char === 'ー' && previous
        ? vowelRows.find(([, row]) => row.includes(previous))?.[0]
        : undefined;
    primary.push(prolonged ?? smallKana[char] ?? char);
    voicing.push('0');
    // CLDR's kana tie order places length marks before small then large kana.
    form.push(prolonged ? '0' : smallKana[char] ? '1' : '2');
  }
  return `${primary.join('')}\u0000${voicing.join('')}\u0000${form.join('')}`;
}

export function compareLibraryReadings(
  left: { sortKey: string; language: string },
  right: { sortKey: string; language: string },
) {
  const first = libraryReadingSortKey(left.sortKey, left.language);
  const second = libraryReadingSortKey(right.sortKey, right.language);
  return first < second ? -1 : first > second ? 1 : 0;
}

export interface LibraryCardOrderSource {
  language: string;
  expression?: string;
  reading?: string;
  readingOmitted?: boolean;
  details?:
    | { kind: 'kanji'; kunYomi: readonly string[]; onYomi: readonly string[] }
    | { kind: 'generic'; readings: readonly string[] };
  createdAt?: number;
  _creationTime?: number;
  _id?: string;
}

/** Deprecated sortKey remains in stored contracts, but is never author-controlled. */
export function derivedCardSortKey(card: LibraryCardOrderSource) {
  if (card.details?.kind === 'kanji')
    return card.details.kunYomi[0] ?? card.details.onYomi[0] ?? '';
  if (card.details?.kind === 'generic') return card.details.readings[0] ?? '';
  if (card.expression !== undefined)
    return card.readingOmitted ? '' : (card.reading ?? '');
  return '';
}

/** V2 ordering is separate from the old index throughout the rollout. */
export function cardOrderKey(card: LibraryCardOrderSource) {
  const reading = derivedCardSortKey(card).trim();
  if (!reading) return '2';
  const normalized = reading.normalize('NFKC');
  // Vocabulary keeps every hiragana reading before every katakana reading.
  // Mixed readings belong to the script of their first kana character.
  const firstKana = normalized.match(
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  )?.[0];
  const group =
    card.expression !== undefined &&
    firstKana &&
    /\p{Script=Katakana}/u.test(firstKana)
      ? '1'
      : '0';
  return `${group}\u0000${libraryReadingSortKey(reading, card.language)}`;
}

export function compareLibraryCards(
  left: LibraryCardOrderSource,
  right: LibraryCardOrderSource,
) {
  const first = cardOrderKey(left);
  const second = cardOrderKey(right);
  return (
    (first < second ? -1 : first > second ? 1 : 0) ||
    (left.createdAt ?? left._creationTime ?? 0) -
      (right.createdAt ?? right._creationTime ?? 0) ||
    (left._creationTime ?? 0) - (right._creationTime ?? 0) ||
    ((left._id ?? '') < (right._id ?? '')
      ? -1
      : (left._id ?? '') > (right._id ?? '')
        ? 1
        : 0)
  );
}
