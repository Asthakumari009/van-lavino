# Van Lavino — Vercel deployment

The frontend is a Vite + React SPA. It deploys cleanly to Vercel as a
static build; the backend (Postgres + Auth + Storage + Edge Functions)
lives entirely on Supabase.

## One-time Vercel setup

1. **Import the repo** in the Vercel dashboard (or `vercel link` from this
   directory). Vercel auto-detects Vite via [vercel.json](vercel.json).

2. **Set environment variables** (Project → Settings → Environment Variables).
   Add each one to all three environments — Production, Preview, Development:

   | Variable | Where to find it |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key |
   | `VITE_RAZORPAY_KEY_ID` | Razorpay Dashboard → Account & Settings → API Keys → Key ID |

   The Razorpay **Key Secret** is server-side only and lives in Supabase's
   edge-function env, **not** Vercel. Same goes for `SUPABASE_SERVICE_ROLE_KEY` —
   never put that in Vercel.

3. **Deploy.** First push to the connected branch (or `vercel --prod`) builds
   and ships. Vite output goes to `dist/`, served via Vercel's edge.

## Why these specific settings in `vercel.json`

| Setting | Reason |
|---|---|
| `installCommand: "npm install --legacy-peer-deps"` | `vite-plugin-pwa` has a peer-dep conflict with the current Vite major. Without the flag, npm refuses to install on Vercel's CI. |
| `rewrites: "/(.*)" → "/index.html"` | React Router does client-side routing. Without the rewrite, Vercel returns 404 on deep links like `/admin`, `/track?order=…`, `/rider/<token>`. |
| `framework: "vite"` | Pins the Vercel build profile to Vite. Auto-detected, but explicit avoids surprises. |
| Long cache on `/assets/*` | Vite emits content-hashed filenames; safe to cache forever. |
| `no-store` on `sw.js` + `manifest.webmanifest` | PWA needs the freshest manifest/service worker so updates land without a stale-cache lag. |

## Backend prerequisites — Supabase

The frontend talks to Supabase. Before the deployed site works end-to-end:

1. **Apply every migration** in `supabase/migrations/` against the prod
   Supabase project (Studio → SQL editor, or `psql`). They're numbered;
   apply in order.
2. **Run the seed scripts** in `scripts/`:
   - `scripts/seed_menu.sql` — full restaurant menu for the original
     placeholder branch (one-shot; idempotent if you check first).
   - `scripts/seed_branches_breads.sql` — adds Jubilee Hills / Financial
     District / Nalagandla branches plus the bakery SKUs. Idempotent.
3. **Deploy the edge functions:**
   ```sh
   supabase functions deploy validate-qr
   supabase functions deploy create-online-session --no-verify-jwt
   supabase functions deploy create-razorpay-order
   supabase functions deploy rider-update --no-verify-jwt
   supabase functions deploy blog-sync
   supabase functions deploy ai-insights
   supabase functions deploy invite-staff
   ```
4. **Configure Auth → Multi-Factor Authentication → TOTP** in the Supabase
   project settings. Required for the `/admin` MFA flow (migration 016
   enforces it at RLS).
5. **Set edge-function secrets** (Supabase → Project Settings → Edge Functions
   → Secrets):
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — for `create-razorpay-order`
   - `OPENAI_API_KEY` — for `ai-insights` (optional; only if AI panel is used)
   - Anything `blog-sync` needs (check `supabase/functions/blog-sync/index.ts`)

## Smoke test after first deploy

1. Visit the production URL. Landing page should render with the bakery
   showcase live (pulls from `menu_items.is_deliverable`).
2. Click **Order Online** → pick a branch → add a bread → checkout → place a
   cash order. Should land on `/order-success` with a Track button + receipt.
3. Open the **/admin** route. With migration 016 + TOTP enabled in Supabase,
   sign-in must complete a 6-digit code before reaching the dashboard.
4. As staff, dispatch a delivery order from the kanban. Open the rider
   link in another browser, grant location, watch the customer's `/track`
   map update live.

If any step fails, the most common causes are:
- An env var missing or typoed in Vercel → Project Settings.
- A Supabase migration not applied (Edge function calls return 404 / RLS
  refuses inserts).
- TOTP not enabled in the Supabase Auth MFA settings (admin sign-in errors).

## Local dev

```sh
npm install --legacy-peer-deps
npm run dev
```

`.env.local` (gitignored) holds the same three `VITE_*` variables for
local builds. Don't commit it.
