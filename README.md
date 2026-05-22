# NTE PRNG Modules

A premium, real-time dashboard for logging and analyzing artifact pull patterns in NTE (Neverness to Everness). Built with **Vite + TypeScript**, styled in pure black glassmorphism, and powered by **Supabase** for instant data sync across all users.

## Features

- **Live Clock**: Real-time display with millisecond precision. Freezes when you select a custom second and auto-resumes after logging.
- **Smart Logging**: One-click `:SS` second selection + stat toggles. Auto-captures current time or allows manual override.
- **Heatmap Analytics**: 12-second grid with per-second pull volume and stat-rate filtering. Filter by hour window (All / Now / -1h / -2h).
- **Real-Time Feed**: Recent pulls from all users with instant refresh. Toggle "Mine" to see only your session's pulls.
- **Animated UI**: Pure black background with drifting grid and ambient glow animations.
- **Rate-Limited**: Client-side insert throttling (10/min) and fetch cooldowns to respect Supabase limits.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build Tool | Vite |
| Language | TypeScript (strict) |
| UI | Vanilla DOM (no framework) |
| Database | Supabase (PostgreSQL + Realtime optional) |
| Hosting | GitHub Pages |

## Quick Start

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New query**
3. Copy the contents of [`supabase/setup.sql`](./supabase/setup.sql) and run it
4. In **Settings → API**, copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` API key → `VITE_SUPABASE_ANON_KEY`

### 2. Local Development

```bash
# Install dependencies
npm install

# Copy env template and fill in your Supabase credentials
cp .env.example .env

# Start dev server
npm run dev
```

### 3. Build

```bash
npm run build    # Type-check + Vite build → dist/
npm run lint     # tsc --noEmit
npm run preview  # Preview production build locally
```

## Environment Variables

Create `.env` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only variables prefixed with `VITE_` are exposed to the browser. **Never** commit the `.env` file — it is gitignored by default.

## GitHub Pages Deployment

This project uses **GitHub Actions** to automatically deploy to GitHub Pages on every push to `main`.

### Setup

1. Go to **Repository Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Go to **Settings → Secrets and variables → Actions**
4. Add two repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

On the next push to `main`, the workflow will build and deploy automatically.

### CORS Note

Supabase REST API is configured with `Access-Control-Allow-Origin: *` by default, so GitHub Pages (or any domain) can talk to it without issues. If you have restricted CORS in your Supabase project settings, add your GitHub Pages URL (e.g., `https://ci3t.github.io`) to the allowed origins.

## Project Structure

```
src/
  main.ts              # App layout wiring
  db.ts                # Supabase client, CRUD, rate limiting
  session.ts           # UUID session + user tag in localStorage
  types.ts             # Shared types & constants
  style.css            # Global styles, animations, design tokens
  components/
    LogForm.ts         # Pull logging form
    HeatMap.ts         # 12-second heatmap with filters
    Feed.ts            # Recent pulls list
  vite-env.d.ts        # ImportMetaEnv types
supabase/
  setup.sql            # Schema, RLS policies, views
public/
  (static assets)
```

## Data Model

| Field | Type | Description |
|-------|------|-------------|
| `pull_hour` | int | Hour of pull (0–23) |
| `pull_minute` | int | Minute of pull (0–59) |
| `pull_second` | int | Second of pull (0, 5, 10, ..., 55) |
| `time_source` | text | `auto` (live clock) or `manual` (user edited) |
| `user_tag` | text | Display name / tag |
| `session_id` | uuid | Anonymous session identifier |
| `has_crit_rate`, `has_crit_dmg`, etc. | bool | Artifact substat flags |
| `team_label` | text | Team / Character |
| `notes` | text | Freeform notes |

## License

MIT
