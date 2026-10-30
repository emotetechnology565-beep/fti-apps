export function saleMovement(change: string | null) {
  if (change === null || !Number.isFinite(Number(change)))
    return { symbol: '—', label: 'First quote', tone: 'neutral' as const };
  const value = Number(change);
  if (value === 0)
    return { symbol: '—', label: 'No change', tone: 'neutral' as const };
  return {
    symbol: value > 0 ? '▲' : '▼',
    label: `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    tone: value > 0 ? ('up' as const) : ('down' as const),
  };
}
export const saleMoney = (price: string) =>
  `₹${Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export function salePublished(at: string) {
  const stamp = new Date(at);
  const date = stamp.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = stamp.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `Published ${date} · ${time} IST`;
}
