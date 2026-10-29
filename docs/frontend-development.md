# Frontend developer instructions

Use this guide when working on the FTI Expo/React Native frontend. Read [AGENTS.md](../AGENTS.md) first and follow its project rules. See [README.md](../README.md) for setup and [architecture.md](architecture.md) for dependency boundaries. Verify feature status against current source and deployment notes; some architecture descriptions document earlier phases.

## Start locally

The repository uses npm and `package-lock.json`. Match the Node version in `.github/workflows/verify.yml` (currently Node 22).

```powershell
npm ci
npm start
npm run android
npm run ios       # Requires a supported device/development environment
npm run web
```

Use `.env.example` for configuration names and keep local values in the ignored `.env`. Public client configuration is visible in compiled builds. Keep Supabase service-role, Bunny, WhatsApp, and other service credentials in server secrets.

Before changing Expo, React Native, or EAS APIs, read the Expo major version in `package.json` and consult matching versioned documentation. Currently it is Expo 57: <https://docs.expo.dev/versions/v57.0.0/>. For other Expo topics, start with <https://docs.expo.dev/llms.txt>. Recheck the version after upgrades.

## Where to put code

| Location | Responsibility |
| --- | --- |
| `src/app/` | Thin Expo Router routes and navigator layouts |
| `src/features/<feature>/screens/` | Feature screen composition |
| Feature `components/` | Components used within that feature |
| Feature `hooks/`, `services/`, or `data/` | Queries, API calls, and adapters |
| Feature `model/` | Types, validation, calculations, and state slices |
| `src/shared/ui/` | Reusable Button, Field, Card, Txt, Empty, and other primitives |
| `src/shared/theme/` | Design tokens and shared styles |
| `src/shared/lib/` | Pure helpers independent of business features |
| `src/core/` | Providers, SDK clients, shell, and store composition |

Create only folders a feature needs. Use TypeScript with strict typing and the configured `@features/*`, `@shared/*`, and `@core/*` aliases.

- Keep route files small. Follow `src/app/products.tsx` for composing a feature screen with `withShell`. Use Expo Router for navigation; keep reusable code outside `src/app/`.
- Across features, import deliberate public contracts: `index.ts` for domain/data, `ui.ts` for rendering, and `export.ts` for platform exports. Avoid reaching into another feature's internal models or screens.
- Shared code must not depend on features or core wiring. Domain models must remain independent of rendering, native APIs, and the runtime store.
- Put global providers in `src/core/providers/AppProviders.tsx` and app-wide layout changes in `src/core/layout/`.

## Build consistent, accessible UI

- Start with `src/shared/ui/index.ts`, `src/shared/theme/tokens.ts`, and `src/shared/theme/styles.ts`. Reuse existing colors, typography, spacing, fields, buttons, cards, and status treatments. Keep feature-specific styles with the feature.
- Build mobile-first with React Native components and styles, while preserving web compatibility. Isolate browser APIs in platform files such as `.web.ts`; subscription checkout and drawing downloads provide examples.
- Check narrow phones, larger screens, safe areas, keyboard overlap, scrolling, long names, and large text. Keep primary actions reachable and content readable.
- Provide meaningful accessibility labels and roles, adequate touch areas, and visible interaction feedback. Convey status through text as well as color. Check keyboard navigation on web and screen-reader navigation on mobile.
- Cover loading, empty, error, retry, and access-restricted states. Prevent duplicate submissions while requests are pending, preserve recoverable input, and confirm success only after the server succeeds.
- Reuse model validation and formatting helpers for quantities, units, and prices. Show useful field-level validation and respect existing price-disclosure rules.
- Use virtualized lists for large catalogues and stable item keys. Subscribe to only the store fields a component needs. Profile performance before introducing memoization; size images appropriately and handle missing media.

## Data and access rules

- Keep API calls in feature-owned services or hooks and reuse `src/core/api/supabase-client.ts`. Validate external data and use existing service contracts.
- Use TanStack Query for server data, with query keys that include relevant scope and filters. Refresh or invalidate affected queries after successful mutations.
- Use component state for transient UI and the existing Zustand store for shared drafts and preferences. Change persistence deliberately and cover compatibility when introducing migrations.
- Preserve account-scoped workspace switching and authentication cache cleanup. Identity, permissions, prices, inventory, orders, and payments remain authoritative on the server.
- Reuse existing authentication, `AccessGate`, staff MFA, subscription access, and permission helpers. UI gates improve the experience; server checks must still authorize protected operations.
- Show explicit empty or unavailable states when services are missing. Do not invent stock, prices, balances, or successful orders to fill a screen.
- Coordinate backend contract changes and check feature deployment notes before relying on new endpoints or fields. Keep privileged operations and secrets out of frontend code.

## Dependencies and native changes

Reuse the installed stack before adding libraries. Install dependencies with `npx expo install <package>` for SDK-compatible versions. If the project switches to Bun with `bun.lock`, follow the root instructions and use `bunx`.

Configure native behavior through `app.json` and config plugins. Do not hand-create or edit generated `ios/` or `android/` folders. New native modules require a development build rather than relying on Expo Go. Follow [AGENTS.md](../AGENTS.md) and the [release checklist](release-checklist.md) for builds and releases.

## Workflow and completion checks

1. Identify the affected route, feature, UI primitives, data contracts, and business rules. Read a nearby implementation before editing.
2. Implement the smallest complete change, including failure states and permission behavior. Keep unrelated refactoring separate.
3. Run these required checks before handing off any task:

   ```powershell
   npm run lint
   npm run typecheck
   ```

4. For behavior changes, run relevant tests and add focused regression coverage where useful. Before a PR, run `npm run test` and `npm run build` as required by CI. If a command fails because expected test files are absent, report that blocker rather than claiming it passed.
5. Verify changed flows on available Android/iOS devices or simulators and web. Check guest and signed-in states, relevant staff permissions, failed requests, keyboard behavior, and repeated taps. A web export does not prove native behavior.
6. Hand off the resulting behavior, affected feature, validation results, screenshots for visual changes, and backend deployment dependencies. Explicitly record failures and platforms that remain unverified.
