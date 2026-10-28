export const productCard = {
  maxWidth: 225,
  minHeight: 500,
  imageHeight: 155,
  titleHeight: 64,
  gap: 12,
  radius: 8,
};

export function productCardWidth(containerWidth: number) {
  if (containerWidth <= 0) return undefined;
  const columns = Math.max(
    2,
    Math.ceil(
      (containerWidth + productCard.gap) /
        (productCard.maxWidth + productCard.gap),
    ),
  );
  return (containerWidth - productCard.gap * (columns - 1)) / columns;
}
