import { createSubscriptionHandler } from './handler.ts';
Deno.serve(createSubscriptionHandler((name) => Deno.env.get(name)));
