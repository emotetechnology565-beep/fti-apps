import { TextInput, View } from 'react-native';
import { s } from '../theme/styles';
import { Txt } from './Txt';
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <Txt style={s.label}>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A3B2"
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        style={[
          s.input,
          multiline ? { minHeight: 96, textAlignVertical: 'top' } : null,
        ]}
      />
    </View>
  );
}
