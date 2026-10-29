import { Platform, StyleSheet } from 'react-native';
import { c } from './tokens';

const fontFamily = Platform.select({
  web: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  ios: 'System',
  default: 'sans-serif',
});

export const s = StyleSheet.create({
  text: { color: c.ink, fontSize: 14, fontFamily },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: {
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 2px 10px rgba(16, 24, 40, 0.04)',
  },
  button: {
    backgroundColor: c.brandRed,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondary: {
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.paper,
    borderRadius: 20,
    paddingHorizontal: 14,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 12, fontWeight: '600', color: c.ink, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    minHeight: 46,
    padding: 13,
    fontSize: 14,
    color: c.ink,
    backgroundColor: c.paper,
    fontFamily,
  },
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.8, color: c.ink, fontFamily },
  h2: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: c.ink, fontFamily },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: c.brandBlue,
    fontFamily,
  },
  muted: { color: c.muted, fontSize: 12, lineHeight: 19 },
  divider: { height: 1, backgroundColor: c.line, marginVertical: 16 },
});
