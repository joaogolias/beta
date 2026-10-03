import { Text, View } from 'react-native';
import { Choice, ui } from '../alphabet/ui';

export type CardCategory =
  'all' | 'alphabet' | 'vocabulary' | 'grammar' | 'exam';
const categories = [
  { value: 'all', label: 'Todos os cards' },
  { value: 'alphabet', label: 'Kanji' },
  { value: 'vocabulary', label: 'Vocabulário' },
  { value: 'grammar', label: 'Gramática' },
] as const;

export function CategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: CardCategory;
  onChange: (value: CardCategory) => void;
  disabled?: boolean;
}) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>Categoria</Text>
      <View
        style={ui.row}
        accessibilityRole="radiogroup"
        accessibilityLabel="Categoria dos cards"
      >
        {categories.map((category) => (
          <Choice
            key={category.value}
            label={category.label}
            selected={category.value === value}
            onPress={() => onChange(category.value)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}
