export interface KanjiFaceSource {
  symbol: string;
  meanings: readonly string[];
  details: {
    kind: 'kanji';
    kunYomi: readonly string[];
    onYomi: readonly string[];
    radicals: readonly string[];
  };
}

export interface KanjiBackSection {
  key: 'meanings' | 'kunYomi' | 'onYomi' | 'radicals';
  label: string;
  value: string;
}

function show(values: readonly string[]) {
  return (
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .join('; ') || '—'
  );
}

export function kanjiBackSections(card: KanjiFaceSource): KanjiBackSection[] {
  return [
    {
      key: 'meanings',
      label: '意味 · Significado',
      value: show(card.meanings),
    },
    {
      key: 'kunYomi',
      label: '訓読み · Kun’yomi',
      value: show(card.details.kunYomi),
    },
    {
      key: 'onYomi',
      label: '音読み · On’yomi',
      value: show(card.details.onYomi),
    },
    {
      key: 'radicals',
      label: '部首 · Radical',
      value: show(card.details.radicals),
    },
  ];
}

export function formatKanjiFaces(card: KanjiFaceSource) {
  return {
    front: card.symbol,
    back: kanjiBackSections(card)
      .map(({ label, value }) => `${label}: ${value}`)
      .join('\n'),
  };
}
