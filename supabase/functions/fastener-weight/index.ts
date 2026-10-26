import { handleFastenerWeight } from './handler.ts';

Deno.serve((request: Request) => handleFastenerWeight(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
}));
