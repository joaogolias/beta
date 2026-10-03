import { Text, View } from 'react-native';
import type { ExamContent } from '../../../shared/examContent';
import { ui } from '../alphabet/ui';

export function ExamContentView({
  card,
  includeAnswer = true,
}: {
  card: ExamContent;
  includeAnswer?: boolean;
}) {
  return (
    <View style={ui.stack}>
      <Text accessibilityRole="header" style={ui.subtitle}>
        Enunciado
      </Text>
      <Text selectable style={ui.body}>
        {card.prompt}
      </Text>
      {card.alternatives.map((alternative, index) => (
        <View key={index} style={ui.inset}>
          <Text style={ui.label}>Alternativa {index + 1}</Text>
          <Text selectable style={ui.body}>
            {alternative}
          </Text>
        </View>
      ))}
      {includeAnswer && (
        <>
          <Text accessibilityRole="header" style={ui.subtitle}>
            Resposta
          </Text>
          <Text selectable style={ui.body}>
            {card.answer}
          </Text>
          <Text accessibilityRole="header" style={ui.subtitle}>
            Explicação
          </Text>
          <Text selectable style={ui.body}>
            {card.explanation}
          </Text>
        </>
      )}
      {[
        ['Referência da prova', card.examReference],
        ['Ano', card.year?.toString()],
        ['Seção', card.section],
        ['Fonte', card.source],
      ].map(([label, value]) =>
        value ? (
          <View key={label} style={ui.field}>
            <Text style={ui.label}>{label}</Text>
            <Text selectable style={ui.body}>
              {value}
            </Text>
          </View>
        ) : null,
      )}
    </View>
  );
}
