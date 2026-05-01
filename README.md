# Maccas Tracka — Costi Cohen × McDonald's Site Finder

Interactive NSW site-finder map for evaluating potential McDonald's locations against
1,001 candidate properties. Live trade-area overlays for the 53 existing stores within
catchment, NSW Spatial Services boundaries, planning intelligence (zoning, FSR, height,
lot size), and a shared review workflow with realtime team sync.

## Stack

- **Static HTML + Leaflet** — single page, no framework
- **Supabase** — Postgres + realtime for shared review state (status / score / notes)
- **Vercel** — hosting, env-var injection at build time
- Data sources: NSW Spatial Services, NSW Planning Portal, OpenStreetMap (Overpass API)

## Local development

`index.html` contains `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` placeholders. To run
locally with Supabase:

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJh... npm run build
open dist/index.html
```

Without env vars, the site falls back to localStorage-only mode (single-user, offline).

## Deploy

Vercel auto-deploys on push to `main`. Required env vars in Vercel project settings:

| Variable | Source |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |

## Database setup

Run `supabase-schema.sql` in the Supabase SQL Editor once. Creates:

- `site_reviews` table (address PK, status, score, notes, reviewer, updated_at)
- Auto-updating `updated_at` trigger
- Permissive RLS policies (any anon-key holder can read/write — fine for an internal team)
- Realtime publication so changes broadcast to subscribed clients

Tighten the policies later if you want per-user auth.
