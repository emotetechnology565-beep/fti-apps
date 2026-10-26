export function fastenerPrice(
  boltKg: number,
  nutKg: number,
  boltRate: number,
  nutRate: number,
) {
  if (
    ![boltKg, nutKg, boltRate, nutRate].every(Number.isFinite) ||
    boltKg < 0 ||
    nutKg < 0 ||
    boltKg + nutKg <= 0 ||
    boltRate <= 0 ||
    nutRate <= 0
  )
    return null;
  return Math.round((boltKg * boltRate + nutKg * nutRate) * 100) / 100;
}
