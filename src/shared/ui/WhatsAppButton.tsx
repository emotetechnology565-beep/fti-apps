import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Txt } from './Txt';

export function WhatsAppButton({ label = 'Get quotation on WhatsApp', disabled = false, onPress }: {
  label?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [s.button, {
      backgroundColor: disabled ? c.line : '#075E54',
      borderColor: disabled ? c.line : '#075E54',
      opacity: pressed ? 0.78 : 1,
    }]}
  >
    <FontAwesome name="whatsapp" size={21} color={disabled ? c.muted : 'white'} accessible={false} />
    <Txt style={{ color: disabled ? c.muted : 'white', fontSize: 13, fontWeight: '700' }}>{label}</Txt>
  </Pressable>;
}
