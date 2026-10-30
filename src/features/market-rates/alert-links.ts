import type { MarketQuote } from './customer-api';

export type AlertContact = { label: string; digits: string };
export type AlertChannel = 'whatsapp' | 'sms';
export function alertContacts(value: string): AlertContact[] {
  const seen = new Set<string>();
  return value.split(/[\r\n,;]+/).flatMap((raw) => {
    const label = raw.trim();
    if (!/^\+?[\d\s()-]+$/.test(label)) return [];
    let digits = label.replace(/\D/g, '');
    if (digits.length === 10 && !label.startsWith('+')) digits = `91${digits}`;
    if (digits.length < 7 || digits.length > 15 || seen.has(digits)) return [];
    seen.add(digits);
    return [{ label, digits }];
  });
}
export function rateAlertLink(
  channel: AlertChannel,
  contact: AlertContact,
  quote: Pick<MarketQuote, 'category' | 'district' | 'state'>,
): string {
  if (channel === 'sms') return `sms:+${contact.digits}`;
  const message = `Hello FTI, I would like to receive ${quote.category} market rate alerts for ${quote.district}, ${quote.state}. Please share the details.`;
  return `https://wa.me/${contact.digits}?text=${encodeURIComponent(message)}`;
}
