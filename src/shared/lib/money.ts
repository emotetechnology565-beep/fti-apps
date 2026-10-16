export const money = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
