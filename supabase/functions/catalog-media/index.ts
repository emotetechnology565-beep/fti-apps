import { handleCatalogMedia } from './handler.ts';

Deno.serve(request => handleCatalogMedia(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  storageZone: Deno.env.get('BUNNY_STORAGE_ZONE') ?? '',
  storageAccessKey: Deno.env.get('BUNNY_STORAGE_ACCESS_KEY') ?? '',
  storageEndpoint: Deno.env.get('BUNNY_STORAGE_ENDPOINT') ?? '',
  cdnBaseUrl: Deno.env.get('BUNNY_CDN_BASE_URL') ?? '',
}));
