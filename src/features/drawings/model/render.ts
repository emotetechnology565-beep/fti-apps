import type { DrawingDefinition, DrawingInput } from './types';
import { isHexShape, shapeLabels } from './types';
import { hexDrawingSvg } from './hex-render';

export const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const n = (value: number) => Number(value.toFixed(3));
export function drawingSvg(
  definition: DrawingDefinition,
  input: DrawingInput,
): string {
  if (isHexShape(definition.shape)) return hexDrawingSvg(definition, input);
  const d = definition.dimensions,
    shape = definition.shape;
  const round = shape === 'j-ii' || shape === 'u-round',
    u = shape.startsWith('u-');
  const { length } = input,
    radius = input.radius ?? 0,
    angle = input.angle ?? 25;
  const width = round ? radius * 2 : (input.width ?? d.widths[0] ?? 0);
  const pitch = input.pitch ?? d.pitch;
  const b = pitch && d.thread_base ? d.thread_base + 2 * pitch : null;
  if (!Number.isFinite(length) || length <= 0 || length > 10000)
    throw new Error('Enter a valid positive length.');
  if (
    !round &&
    shape !== 'coach' &&
    (!d.lengths.includes(length) || !d.widths.includes(width))
  )
    throw new Error('Select a listed width and length.');
  if (
    pitch !== undefined &&
    (!Number.isFinite(pitch) || pitch <= 0 || pitch > 100)
  )
    throw new Error('Pitch must be between 0 and 100 mm.');
  if (
    round &&
    (!Number.isFinite(radius) ||
      radius <= 0 ||
      radius > 10000 ||
      length <= radius + d.diameter)
  )
    throw new Error(
      'Enter an inside radius that leaves a straight leg below length L.',
    );
  if (
    shape === 'j-ii' &&
    (!input.returnHeight ||
      !Number.isFinite(input.returnHeight) ||
      input.returnHeight < radius + d.diameter ||
      input.returnHeight >= length)
  )
    throw new Error(
      'Return height must be at least radius + diameter and shorter than L.',
    );
  if (shape === 'j-i' && (!Number.isFinite(angle) || angle < 1 || angle > 75))
    throw new Error('Return angle must be between 1 and 75 degrees.');
  if (b && b >= length - (round ? radius + d.diameter : (d.depth ?? 0)))
    throw new Error('Thread length leaves insufficient straight leg.');
  const scale = Math.min(
    310 / length,
    400 / Math.max(width + d.diameter * 2, d.head_width ?? 0),
    10,
  );
  const rod = d.diameter * scale,
    top = 85,
    bottom = top + length * scale - rod / 2;
  const right = 540,
    left = right - (width + d.diameter) * scale;
  const line = (x1: number, y1: number, x2: number, y2: number, attr = '') =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attr}/>`;
  const text = (x: number, y: number, value: string) =>
    `<text x="${n(x)}" y="${n(y)}">${escapeXml(value)}</text>`;
  const nut = (x: number) => {
    const w = Math.max(rod * 2.1, 18),
      y = top + rod * 0.6,
      h = Math.max(rod * 0.65, 7);
    return `<g data-part="nut" fill="white" stroke="#24333d" stroke-width="1.5"><path d="M${x - w / 2} ${y + h}V${y + 3}Q${x - w / 2} ${y} ${x - w / 2 + 3} ${y}H${x + w / 2 - 3}Q${x + w / 2} ${y} ${x + w / 2} ${y + 3}V${y + h}Z"/></g>`;
  };
  let body = '',
    path = '';
  if (shape === 'coach') {
    const x = 100,
      y = 240,
      head = (d.head_height ?? 0) * scale,
      flats = (d.head_width ?? 0) * scale,
      end = x + head + length * scale;
    body = `<g stroke="#24333d" fill="white" stroke-width="2"><rect x="${x}" y="${y - flats / 2}" width="${head}" height="${flats}"/><path d="M${x + head} ${y - rod / 2}H${end - rod}L${end} ${y}L${end - rod} ${y + rod / 2}H${x + head}Z"/></g>`;
    for (
      let at = x + head + length * scale * 0.35, i = 0;
      at < end - rod && i < 350;
      at += Math.max((pitch ?? 1) * scale, 3), i++
    )
      body += line(
        at,
        y - rod / 2,
        Math.min(at + 8, end - rod),
        y + rod / 2,
        'stroke="#24333d"',
      );
    const r = flats / Math.sqrt(3),
      points = Array.from(
        { length: 6 },
        (_, i) =>
          `${790 + r * Math.cos(((30 + i * 60) * Math.PI) / 180)},${y + r * Math.sin(((30 + i * 60) * Math.PI) / 180)}`,
      ).join(' ');
    body += `<polygon points="${points}" fill="white" stroke="#24333d" stroke-width="2"/>`;
    body += text(
      100,
      120,
      `Head: s ${d.head_width} / k ${d.head_height} / pitch ${d.pitch} mm`,
    );
  } else {
    if (round) {
      const r = (radius + d.diameter / 2) * scale,
        low = bottom - r,
        endY = u ? top : top + (length - input.returnHeight!) * scale;
      path = `M${right} ${top}V${low}A${r} ${r} 0 0 1 ${(left + right) / 2} ${bottom}A${r} ${r} 0 0 1 ${left} ${low}V${endY}`;
    } else if (shape === 'j-i') {
      const r = (right - left) / 2,
        cx = right - r,
        cy = bottom - r,
        t = (angle * Math.PI) / 180,
        ax = cx - r * Math.cos(t),
        ay = cy + r * Math.sin(t),
        ey = bottom - d.depth! * scale;
      path = `M${right} ${top}V${cy}A${r} ${r} 0 0 1 ${ax} ${ay}L${ax - (ay - ey) * Math.tan(t)} ${ey}`;
    } else {
      const r = (d.radius! + d.diameter / 2) * scale,
        endY = u ? top : bottom - d.depth! * scale;
      path = `M${right} ${top}V${bottom - r}Q${right} ${bottom} ${right - r} ${bottom}H${left + r}Q${left} ${bottom} ${left} ${bottom - r}V${endY}`;
    }
    body = `<path data-part="body" d="${path}" fill="none" stroke="#24333d" stroke-width="${rod + 2}"/><path d="${path}" fill="none" stroke="white" stroke-width="${Math.max(rod - 1, 1)}"/>`;
    const thread = (b ?? Math.min(38, length * 0.3)) * scale;
    for (const x of u ? [left, right] : [right]) {
      for (
        let y = top + 3, i = 0;
        y < top + thread - 3 && i < 350;
        y += Math.max((pitch ?? 2) * scale, 4), i++
      )
        body += line(x - rod / 2, y, x + rod / 2, y + 3, 'stroke="#24333d"');
      body += nut(x);
    }
    body += text(
      80,
      150,
      round
        ? `R1 = ${radius} mm (customer)`
        : shape === 'j-i'
          ? `Return angle = ${angle} degrees (customer / example)`
          : `R = ${d.radius} mm`,
    );
    if (shape === 'j-ii')
      body += text(
        80,
        175,
        `Return height = ${input.returnHeight} mm (customer)`,
      );
    body += `<g stroke="#075299" fill="none">${line(right + 75, top, right + 75, bottom + rod / 2)}${line(right + 65, top, right + 85, top)}${line(right + 65, bottom + rod / 2, right + 85, bottom + rod / 2)}${line(left + rod / 2, bottom + 45, right - rod / 2, bottom + 45)}</g>`;
    body +=
      text(right + 90, (top + bottom) / 2, `L ${length}`) +
      text((left + right) / 2 - 30, bottom + 65, `w ${width}`);
  }
  const title = `${definition.standard}:${definition.edition} / ${shapeLabels[shape]} / ${definition.size}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560"><title>${escapeXml(title)}</title><rect width="900" height="560" fill="white"/><g font-family="sans-serif" font-size="14" fill="#075299">${body}${text(40, 455, `Diameter ${d.diameter} mm / Length ${length} mm`)}${text(40, 480, shape === 'coach' ? 'Threaded proportion is schematic' : `Thread b: ${b ?? `${d.thread_base} + 2P`} mm`)}${text(40, 515, title)}${text(40, 540, 'Schematic. Nuts and thread profile illustrative. Dimensions in mm.')}</g></svg>`;
}
