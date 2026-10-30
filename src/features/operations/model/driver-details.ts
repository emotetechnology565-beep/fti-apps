export const driverPhone = (phone: string) => phone.replace(/[\s().-]/g, '');

export function validDriverDetails(name: string, phone: string) {
  const trimmed = name.trim();
  return (
    (!trimmed || (trimmed.length >= 2 && trimmed.length <= 120)) &&
    (!phone.trim() || /^\+?[0-9]{7,15}$/.test(driverPhone(phone)))
  );
}
