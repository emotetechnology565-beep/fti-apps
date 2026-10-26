import {
  isNutShape,
  shapeLabels,
  type DrawingDefinition,
  type DrawingInput,
} from './types';

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function hexThreadLength(definition: DrawingDefinition, length: number) {
  const d = definition.dimensions;
  if (isNutShape(definition.shape)) return 0;
  if (!Number.isFinite(length) || length <= 0 || length > 10000)
    throw new Error('Enter a valid positive length.');
  if (definition.shape === 'hex-screw') {
    const allowance = d.thread_end_allowance;
    if (!allowance || length <= allowance)
      throw new Error('Length must exceed the unthreaded allowance.');
    return length - allowance;
  }
  if (definition.standard !== 'IS 1363' || definition.edition !== '1967')
    throw new Error(
      'A thread-length rule must be configured for this standard edition.',
    );
  const extra =
    length <= 130
      ? d.thread_add_short
      : length <= 200
        ? d.thread_add_medium
        : d.thread_add_long;
  if (!extra) throw new Error('Thread-length allowances are missing.');
  const b = 2 * d.diameter + extra;
  if (length < b)
    throw new Error(
      `Length must be at least ${b} mm for this bolt thread rule.`,
    );
  return b;
}

export function hexDrawingSvg(
  definition: DrawingDefinition,
  input: DrawingInput,
) {
  const d = definition.dimensions,
    nut = isNutShape(definition.shape);
  if (!d.head_width || !d.head_height || !d.pitch)
    throw new Error('Head dimensions and pitch are required.');
  const length = nut ? d.head_height : input.length;
  if (!nut && d.lengths.length && !d.lengths.includes(length))
    throw new Error('Select a listed length.');
  const b = hexThreadLength(definition, length);
  const scale = nut
    ? Math.min(140 / d.head_width, 10)
    : Math.min(420 / length, 140 / d.head_width, 8);
  const flats = d.head_width * scale,
    height = d.head_height * scale,
    shaft = (d.diameter_max ?? d.diameter) * scale;
  const text = (x: number, y: number, value: string) =>
    `<text x="${x}" y="${y}">${xml(value)}</text>`;
  const polygon = (cx: number, cy: number) =>
    Array.from(
      { length: 6 },
      (_, i) =>
        `${cx + (flats / Math.sqrt(3)) * Math.cos(((30 + i * 60) * Math.PI) / 180)},${cy + (flats / Math.sqrt(3)) * Math.sin(((30 + i * 60) * Math.PI) / 180)}`,
    ).join(' ');
  let body = '';
  if (nut) {
    if (!d.minor_diameter_min || !d.minor_diameter_max)
      throw new Error('Nut bore dimensions are required.');
    const bore = d.minor_diameter_max * scale;
    body = `<g data-part="nut" stroke="#24333d" fill="white" stroke-width="2"><polygon points="${polygon(260, 240)}"/><circle cx="260" cy="240" r="${bore / 2}"/><circle cx="260" cy="240" r="${(d.diameter * scale) / 2}" stroke-dasharray="4 3"/><path d="M560 ${240 - flats / 2}h${height}v${flats}h-${height}Z"/><path d="M560 ${240 - bore / 2}h${height}M560 ${240 + bore / 2}h${height}" stroke-dasharray="4 3"/></g>`;
    body += text(
      160,
      365,
      `s max ${d.head_width} mm / e min ${d.across_corners_min} mm`,
    );
    body += text(
      510,
      365,
      `${definition.shape === 'lock-nut' ? 'm1' : 'm'} ${d.head_height_min}–${d.head_height_max} mm`,
    );
    body += text(
      110,
      410,
      `Nut minor diameter ${d.minor_diameter_min}–${d.minor_diameter_max} mm`,
    );
  } else {
    const x = 70,
      y = 240,
      start = x + height,
      end = start + length * scale,
      threadStart = end - b * scale;
    body = `<g stroke="#24333d" fill="white" stroke-width="2"><path data-part="head" d="M${x} ${y - flats / 2 + 6}l6 -6h${Math.max(height - 6, 1)}v${flats}h-${Math.max(height - 6, 1)}l-6 -6Z"/><path d="M${start} ${y - shaft / 2}H${end - 3}l3 3v${Math.max(shaft - 6, 1)}l-3 3H${start}Z"/><polygon points="${polygon(770, y)}"/><circle cx="770" cy="${y}" r="${shaft / 2}" stroke-dasharray="4 3"/></g>`;
    for (
      let at = threadStart, i = 0;
      at < end - 3 && i < 350;
      at += Math.max(d.pitch * scale, 3), i++
    )
      body += `<path d="M${at} ${y - shaft / 2}l${Math.min((d.pitch * scale) / 2, 6)} ${shaft}" fill="none" stroke="#24333d"/>`;
    body += text(
      110,
      120,
      `L ${length} mm / ${definition.shape === 'hex-screw' ? 'b1' : 'b'} minimum ${Number(b.toFixed(3))} mm`,
    );
    body += text(
      100,
      360,
      `s max ${d.head_width} / k max ${d.head_height} / pitch ${d.pitch} mm`,
    );
    if (definition.shape === 'hex-bolt')
      body += text(100, 395, `Thread allowance: +0 to ${2 * d.pitch} mm`);
  }
  const title = `${definition.standard}:${definition.edition} / ${shapeLabels[definition.shape]} / ${definition.size}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560"><title>${xml(title)}</title><rect width="900" height="560" fill="white"/><g font-family="sans-serif" font-size="14" fill="#075299">${body}${text(40, 460, `Nominal diameter ${d.diameter} mm / pitch ${d.pitch} mm`)}${text(40, 505, title)}${text(40, 540, 'Schematic maximum envelope. Thread profile and chamfers illustrative. Dimensions in mm.')}</g></svg>`;
}
