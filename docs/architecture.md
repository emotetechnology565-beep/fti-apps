# FTI application architecture

The app is organized by business feature. A feature owns its screens, domain types, calculations, state slice, and data access. Shared code contains reusable UI and formatting; application wiring lives in `core`. Expo Router files are intentionally small.

```text
fti-app/
├── src/
│   ├── app/                     # Expo Router routes and root layout
│   ├── core/
│   │   ├── api/                 # Configured SDK clients, e.g. Supabase
│   │   ├── layout/              # Responsive workspace shell
│   │   ├── providers/           # React Query and safe-area providers
│   │   └── state/               # Slice composition and persistence
│   ├── features/
│   │   ├── account/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── calculator/
│   │   ├── cart/
│   │   ├── catalog/
│   │   │   ├── components/     # ProductCard
│   │   │   ├── data/           # Repository contract and empty unconfigured adapter
│   │   │   ├── hooks/          # Product query and cache keys
│   │   │   ├── model/          # Product types and saved-item state
│   │   │   ├── screens/        # Catalogue and product details
│   │   │   ├── index.ts        # Domain/data public entry point
│   │   │   └── ui.ts           # Separately exported reusable UI
│   │   ├── checkout/
│   │   ├── home/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── pricing/
│   │   ├── quotations/
│   │   └── support/
│   └── shared/
│       ├── lib/                # Pure, business-independent helpers
│       ├── theme/              # Design tokens and shared styles
│       └── ui/                 # Individual reusable primitives
├── assets/                     # Brand assets and unused reference images
├── tests/                      # Architecture, domain, and integration tests
├── scripts/                    # Preview, asset import, browser verification
└── docs/                       # Architecture and development guidance
```

Only create a `components`, `hooks`, `data`, `model`, or `services` subfolder when the feature actually needs it. Features with one screen do not need empty scaffolding.

## Dependency rules

- Routes compose feature screens and the application shell. No other layer imports route files.
- Feature screens can use their own models and components, shared UI, SDK clients and composed workspace selectors.
- Between features, import only an explicit public entry point: `index.ts` for domain/data, `ui.ts` for reusable rendering, or `export.ts` for platform export behavior. Do not import another feature's screens or internal models.
- Domain models do not load React Native, UI components, or the runtime store. Feature slices may import `WorkspaceSlice` as a type only.
- `core/state` is the composition root and may import feature slices directly. It must never import feature screens or components.
- Shared modules depend only on shared modules and external libraries. They cannot import features or application wiring.
- Keep UI and asset exports out of domain entry points so calculations and store tests run without React Native or image loaders.
- Aliases are `@features/*`, `@core/*`, and `@shared/*`. Keep local relative imports inside a feature where they are clearer.

`tests/architecture.test.ts` checks local import/export boundaries and runtime dependency cycles. ESLint also prevents feature dependencies in shared code and native/UI imports in domain models. Runtime loading through computed dynamic imports is not covered by the static graph; avoid using it to cross these boundaries.

## State ownership and persistence

Pricing owns the selected market; catalog owns saved material IDs; cart owns quantity actions; quotations owns RFQs; orders holds previously persisted records; account owns business data. Checkout currently shows an unavailable state; order creation belongs to a later server-backed phase.

`core/state/create-workspace-state.ts` composes those slices without importing native storage. `workspace-store.ts` adds React binding and AsyncStorage persistence. Components subscribe to the specific fields they need, using shallow selection for grouped fields.

One local workspace persists user-entered drafts and preferences. Initial business fields, market, products, cart, RFQs and orders are empty. The legacy `fti-demo-v1` key is left untouched as an archive of existing device records. Phase 2 uses `fti-workspace-v2-guest` or `fti-workspace-v2-<user UUID>` and restores only local drafts and preferences; no seed records are supplied. Authenticated accounts never inherit the unscoped legacy workspace. Catalogue results are transient and never persisted as authoritative data. Tests verify empty initialization, hydration compatibility and rejection of unknown cart products.

For live commerce, the server owns pricing, inventory, orders, payments, permissions and credit. Local Zustand state is not a financial authority. Server entities should use feature-owned query/mutation hooks and query keys; local state should hold drafts, preferences and transient interactions.

## Data services

`core/api/supabase-client.ts` configures the public client. WhatsApp phone authentication belongs to `features/auth/services/phone-auth.ts`. The Auth provider owns session lifecycle and server identity queries; it clears query caches and switches draft namespaces when the user changes. Native session tokens use SecureStore; web uses the Auth client browser storage. Catalogue querying uses `CatalogRepository` and `useProducts`, currently returning an empty array from an explicitly unconfigured adapter. Query keys include repository scope.

No catalogue products, market lists, rates, financial balances, quotations or orders are seeded. Category filters derive from returned catalogue records. RFQs remain local drafts. Profile and business forms call the `identity` Edge Function, which verifies the bearer token with Auth and forwards it to narrowly granted database RPCs. Staff business review additionally requires database permission and MFA assurance level 2. Checkout and other commerce mutations remain unavailable. Add real adapters in their owning features in later phases; keep SDK configuration in `core/api`.

## Adding a feature

1. Create `src/features/<name>/screens/<Name>Screen.tsx` and the models or services it actually needs.
2. Expose only deliberate cross-feature contracts through a public entry point. Prefer domain exports separate from UI exports.
3. Add a thin route under `src/app`. Put global providers in `core/providers`, not in route business logic.
4. For persisted local state, add a feature slice, compose it in `core/state`, and explicitly update persistence fields. If the stored shape changes, add a versioned migration and a compatibility test.
5. Run `npm run lint`, `npm run typecheck`, `npm test`, and the relevant browser/device checks.

Routes retain their original URLs. The original requirements and SQL blueprint remain in `../FTI_Implementation_Documentation_v2/`. This reorganization does not change their implementation status.

## Phase 2 backend and deployment

`supabase/migrations` contains the additive identity migration. `supabase/functions/identity` is the account API; `supabase/functions/whatsapp-otp` is a signed Auth hook that sends the Supabase-generated code through Meta. Both keep service credentials out of the client. RPCs check verified phone identity, active account status, business membership and staff permissions directly from database records.

`deployment/phase2` contains generated, single-file dashboard copies and checksums. Regenerate with `node scripts/prepare-phase2.mjs`; edit canonical sources rather than generated copies. The user chose manual dashboard deployment. See `phase2-deployment.md` for the configuration and live acceptance steps.
