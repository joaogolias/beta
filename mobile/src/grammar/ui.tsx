import { Text, View } from 'react-native';
import type { GrammarContent } from '../../../backend/convex/grammarDomain';
import { ui } from '../alphabet/ui';

export function GrammarContentView({
  card,
  includeFaces = true,
}: {
  card: GrammarContent;
  includeFaces?: boolean;
}) {
  return (
    <View style={ui.stack}>
      {includeFaces && (
        <>
          <View style={ui.inset}>
            <Text style={ui.label}>Frente</Text>
            <Text selectable style={ui.subtitle}>
              {card.front}
            </Text>
          </View>
          <View style={ui.inset}>
            <Text style={ui.label}>Verso</Text>
            <Text selectable style={ui.body}>
              {card.back ||
                'A explicação completa fica disponível no botão durante o estudo.'}
            </Text>
          </View>
        </>
      )}
      <Text accessibilityRole="header" style={ui.subtitle}>
        Explicação
      </Text>
      <Text selectable style={ui.body}>
        {card.explanation}
      </Text>
      {card.examples.length > 0 && (
        <Text accessibilityRole="header" style={ui.subtitle}>
          Exemplos
        </Text>
      )}
      {card.examples.map((example, index) => (
        <View key={index} style={ui.inset}>
          <Text selectable style={ui.subtitle}>
            {example.text}
          </Text>
          {example.reading && (
            <Text selectable style={ui.body}>
              {example.reading}
            </Text>
          )}
          {example.meaning && (
            <Text selectable style={ui.body}>
              {example.meaning}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
