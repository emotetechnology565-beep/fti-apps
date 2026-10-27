import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {drawingSvg} from '../src/features/drawings/model/render';
async function main(){
 const {initWasm,Resvg}=await import('../supabase/functions/operations-whatsapp/fastener-renderer/assets/index.mjs');
 const base='supabase/functions/operations-whatsapp/fastener-renderer/assets/';
 await initWasm(readFileSync(base+'index_bg.wasm'));
 const defs=JSON.parse(readFileSync('deployment/fastener-dimensions/hex-source-definitions.json','utf8'));
 const def=defs.find((d:any)=>d.shape==='hex-bolt'&&d.size==='M10');
 const svg=drawingSvg(def,{length:60});
 const renderer=new Resvg(svg,{background:'white',fitTo:{mode:'width',value:1440},font:{fontBuffers:[readFileSync(base+'Roboto.ttf')],defaultFontFamily:'Roboto',sansSerifFamily:'Roboto'}});
 const image=renderer.render();
 mkdirSync('deployment/fastener-orders',{recursive:true});
 writeFileSync('deployment/fastener-orders/sample-drawing.png',image.asPng());
 image.free();renderer.free();
 console.log('Sample drawing prepared');
}
main();
