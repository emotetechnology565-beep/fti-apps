export function roundBarWeight(
  diameter: number,
  length: number,
  pieces: number,
) {
  if (
    ![diameter, length, pieces].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isInteger(pieces)
  )
    return null;
  return (Math.PI / 4) * (diameter / 1000) ** 2 * length * 7850 * pieces;
}
