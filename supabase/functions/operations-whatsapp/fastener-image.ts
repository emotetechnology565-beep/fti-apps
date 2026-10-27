import { initWasm, Resvg } from './fastener-renderer/assets/index.mjs';
import { drawingSvg } from './fastener-renderer/render.ts';
import type { DrawingDefinition, DrawingInput } from './fastener-renderer/types.ts';

let initialized: Promise<void> | undefined;
let font: Uint8Array;
export async function fastenerPng(definition: DrawingDefinition, input: DrawingInput): Promise<Uint8Array> {
  initialized ??= (async () => {
    const root = new URL('./fastener-renderer/assets/', import.meta.url);
    font = await Deno.readFile(new URL('Roboto.ttf', root));
    await initWasm(await Deno.readFile(new URL('index_bg.wasm', root)));
  })();
  await initialized;
  const renderer = new Resvg(drawingSvg(definition, input), {
    background: 'white', fitTo: { mode: 'width', value: 1440 },
    font: { fontBuffers: [font], defaultFontFamily: 'Roboto', sansSerifFamily: 'Roboto' },
  });
  try {
    const image = renderer.render();
    try { return image.asPng().slice(); } finally { image.free(); }
  } finally { renderer.free(); }
}
