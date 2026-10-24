export function parseNotificationPhones(input: string): string[] {
  const phones = [...new Set(input.split(/[,;\n]+/).map(value => value.replace(/[\s()-]/g, '')).filter(Boolean))];
  if (!phones.length || phones.some(phone => !/^\+[1-9][0-9]{7,14}$/.test(phone))) {
    throw new Error('Enter valid WhatsApp numbers with +country code, separated by commas.');
  }
  return phones;
}
