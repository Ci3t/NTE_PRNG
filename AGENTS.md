# AGENTS.md — NTE PRNG Logger

## Architecture

- Vite + TypeScript, **vanilla DOM only**. No React, Vue, Svelte, or SPA router. UI is built by imperative DOM creation in `src/components/*.ts`.
- Browser talks **directly to Supabase** via `@supabase/supabase-js`. No backend server, no API routes.
- `src/main.ts` wires layout (heatmap top, log form left, feed right) and cross-component events.

## Entrypoints & Key Files

- `index.html` → `src/main.ts` → mounts `LogForm`, `HeatMap`, `Feed`
- `src/db.ts` — Supabase client init, CRUD helpers. Reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/types.ts` — shared types, `SECOND_OPTIONS`, `STAT_LABELS`, constraints.
- `src/session.ts` — generates/stores `session_id` (UUID) and `user_tag` in `localStorage`.
- `supabase/setup.sql` — database schema, RLS policies, and `nte_second_stats` view. Must be run in Supabase SQL Editor before the app works.

## Commands

```bash
npm run dev      # Vite dev server (port 5173)
npm run build    # tsc type-check + vite build → dist/
npm run lint     # tsc --noEmit (strict: unused locals/parameters error)
npm run preview  # preview dist/
```

## Environment

- Only variables prefixed with `VITE_` are exposed to the browser. The app uses:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- `.env` is gitignored. `.env.example` is committed as a template.
- `src/vite-env.d.ts` defines `ImportMetaEnv` so `import.meta.env.*` type-checks.
- **Never** put the Supabase service role key or DB password in any frontend file or env.

## TypeScript Constraints

- `tsconfig.json` enables `noUnusedLocals` and `noUnusedParameters`. Unused variables will fail `npm run build` and `npm run lint`.
- `allowImportingTsExtensions: true` with `noEmit: true` — imports must include `.ts` extensions.
- `strict: true` — all types must be correct.

## UI Conventions

- Components are factory functions (`mountLogForm(container, callbacks)`) that create and append DOM nodes.
- Global styles live in `src/style.css`. Component-specific classes use the naming in that file.
- Design tokens are CSS custom properties in `:root` (e.g., `--bg`, `--purple`, `--gold`).
- The heatmap is the hero element; keep it full-width and prominent.
- The app is mobile-first responsive: single column on small screens, 2-column on desktop.

## Security / Data Rules

- Public anonymous insert and select only. RLS disallows update/delete.
- `session_id` is generated client-side and stored in `localStorage`.
- `user_tag` is honor-system identity; no authentication.
- The app shows a clear setup error banner if Supabase env vars are missing instead of failing silently.

## Common Gotchas

- If `npm run build` fails with `Property 'env' does not exist on type 'ImportMeta'`, the `src/vite-env.d.ts` reference is missing or not included.
- The heatmap auto-refreshes every 60s via `setInterval`; components that create timers should expose cleanup if ever unmounted (currently not needed since there is no route switching).
- `getNowParts()` rounds the current second to the nearest `SECOND_OPTIONS` value (multiples of 5) for the log form.
