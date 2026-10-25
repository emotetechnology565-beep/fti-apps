export function squareBarWeight(sideMm: number, lengthM = 1, pieces = 1) {
  if (
    ![sideMm, lengthM, pieces].every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isInteger(pieces)
  ) return null;
  const weight = sideMm * sideMm * 0.00785 * lengthM * pieces;
  return Number.isFinite(weight) ? weight : null;
}

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
