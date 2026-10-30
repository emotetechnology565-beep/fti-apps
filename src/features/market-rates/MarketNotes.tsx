import { StyleSheet, View } from 'react-native';
import { Txt } from '@shared/ui';

export function MarketNotes({ notes }: { notes: string }) {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <View style={styles.list}>
      {lines.map((line, index) => (
        <View key={`${index}-${line}`} style={styles.note}>
          <Txt style={styles.number}>{String(index + 1).padStart(2, '0')}</Txt>
          <Txt style={styles.text}>{line}</Txt>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: 8 },
  note: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8D9B8',
    borderRadius: 8,
    backgroundColor: '#FFF8E9',
  },
  number: {
    width: 20,
    fontSize: 10,
    lineHeight: 18,
    fontWeight: '700',
    color: '#96651C',
  },
  text: { flex: 1, fontSize: 11, lineHeight: 18, color: '#63543A' },
});
