import type { Doc } from '../../../backend/convex/_generated/dataModel';
import { kanjiBackSections } from '../../../shared/kanji';
import { formatGrammarFaces } from '../../../shared/grammar';

type Snapshot = Doc<'studyPresentations'>['snapshot'];

export function studyFaces(snapshot: Snapshot) {
  if ('category' in snapshot && snapshot.category === 'exam') {
    return {
      isKanji: false,
      isGrammar: false,
      isExam: true,
      front: snapshot.front,
      backTitle: snapshot.title,
      sections: [
        { key: 'answer', label: 'Resposta', value: snapshot.answer },
        {
          key: 'explanation',
          label: 'Explicação',
          value: snapshot.explanation,
        },
      ],
      detailsSections: [
        {
          key: 'prompt',
          label: 'Enunciado e alternativas',
          value: snapshot.front,
        },
        { key: 'answer', label: 'Resposta', value: snapshot.answer },
        {
          key: 'explanation',
          label: 'Explicação',
          value: snapshot.explanation,
        },
      ],
    };
  }
  if ('category' in snapshot && snapshot.category === 'grammar') {
    const canonical = formatGrammarFaces(snapshot);
    const canonicalFaces =
      snapshot.front === canonical.front && snapshot.back === canonical.back;
    const answer = snapshot.back
      ? [{ key: 'back', label: 'Resposta', value: snapshot.back }]
      : [];
    return {
      isKanji: false,
      isGrammar: true,
      isExam: false,
      // Preserve stored historical faces; new snapshots already contain the title.
      front: snapshot.front,
      backTitle: snapshot.title,
      sections: answer,
      detailsSections: [
        ...(canonicalFaces ? [] : answer),
        {
          key: 'explanation',
          label: 'Explicação',
          value: snapshot.explanation,
        },
        ...snapshot.examples.map((example, index) => ({
          key: `example-${index}`,
          label: `Exemplo ${index + 1}`,
          value: [example.text, example.reading, example.meaning]
            .filter(Boolean)
            .join('\n'),
        })),
      ],
    };
  }
  if ('details' in snapshot && snapshot.details.kind === 'kanji') {
    const order = ['kunYomi', 'onYomi', 'meanings', 'radicals'];
    return {
      isKanji: true,
      isGrammar: false,
      isExam: false,
      front: snapshot.symbol,
      backTitle: snapshot.symbol,
      sections: kanjiBackSections({ ...snapshot, details: snapshot.details })
        .filter(
          (section) => section.key !== 'radicals' || section.value !== '—',
        )
        .sort(
          (left, right) => order.indexOf(left.key) - order.indexOf(right.key),
        ),
    };
  }
  return {
    isKanji: false,
    isGrammar: false,
    isExam: false,
    front: snapshot.front,
    backTitle: 'expression' in snapshot ? snapshot.expression : snapshot.symbol,
    sections: [{ key: 'back', label: 'Resposta', value: snapshot.back }],
  };
}
