/** Run the existing worker for pending raw-material jobs only. Credentials stay local. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

async function main() {
  if (process.argv[2] !== '--send-pending') throw new Error('Use --send-pending to process queued raw-material notifications.');
  const cfg: Record<string, string> = {};
  for (const line of readFileSync('.env', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) cfg[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  cfg.SUPABASE_URL = cfg.EXPO_PUBLIC_SUPABASE_URL;
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPERATIONS_WORKER_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ID', 'WHATSAPP_PHONE_NUMBER_ID']) {
    if (!cfg[key]) throw new Error('Missing local configuration: ' + key);
  }
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const globals = globalThis as typeof globalThis & { Deno?: unknown };
  const originalDeno = globals.Deno;
  const originalFetch = globalThis.fetch;
  const receipts: { job_id: string; result: string; provider_message_id?: string }[] = [];
  mkdirSync('test-results', { recursive: true });
  const output = `test-results/raw-material-delivery-${Date.now()}.json`;
  try {
    globals.Deno = { env: { get: (key: string) => cfg[key] }, serve: (callback: typeof handler) => { handler = callback; } };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      // Keep this recovery run restricted to the raw-material queue.
      if (url === `${cfg.SUPABASE_URL}/rest/v1/rpc/fti_operations_whatsapp_claim`) return Response.json([]);
      if (url.includes('/message_templates?')) {
        const response = await originalFetch(input, init);
        if (!response.ok) return response;
        const body = await response.json();
        const templates = (body.data ?? []).filter((item: { name: string }) => ['fti_raw_material_received_v1', 'fti_raw_material_admin_v1'].includes(item.name));
        console.log(JSON.stringify({ templates: templates.map((item: { name: string; status: string }) => ({ name: item.name, status: item.status })) }));
        return Response.json({ data: templates });
      }
      if (url === `${cfg.SUPABASE_URL}/rest/v1/rpc/fti_raw_material_finish`) {
        const args = JSON.parse(String(init?.body));
        receipts.push({ job_id: args.p_id, result: args.p_result, ...(args.p_provider_id ? { provider_message_id: args.p_provider_id } : {}) });
        writeFileSync(output, JSON.stringify({ recorded_at: new Date().toISOString(), receipts }, null, 2) + '\n');
      }
      return originalFetch(input, init);
    };
    const worker = '../supabase/functions/operations-whatsapp/index';
    await import(worker);
    if (!handler) throw new Error('Worker did not initialize.');
    const response = await handler(new Request('https://local.invalid/worker', { method: 'POST', headers: { 'X-Worker-Secret': cfg.OPERATIONS_WORKER_SECRET } }));
    const result = await response.json();
    console.log(JSON.stringify({ worker_http_status: response.status, ...result, receipt_file: receipts.length ? output : null }));
    if (!response.ok) process.exitCode = 1;
  } finally { globalThis.fetch = originalFetch; globals.Deno = originalDeno; }
}
main().catch(() => { console.error('Notification run could not complete. Check delivery status before retrying.'); process.exitCode = 1; });
