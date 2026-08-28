# Recomp Tracker

Protein-first recomp PWA: macros, exercises, calculator, and history charts.

## Stack

- Next.js App Router + Tailwind
- Auth.js (Google OAuth only)
- Drizzle ORM + libSQL (`@libsql/client`) — local SQLite file, or **Turso** in production
- Recharts + `@ducanh2912/next-pwa`

## Local setup

```bash
cp .env.example .env.local
# fill AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
# optional: MISTRAL_API_KEY for AI macro guesser + photo describe
npm install
npm run dev
```

Google OAuth redirect (local):

`http://localhost:3000/api/auth/callback/google`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build (+ PWA service worker) |
| `npm run start` | Serve production build |

---

## Hosting recommendation: **Vercel + Turso**

| Piece | Why |
|-------|-----|
| **[Vercel](https://vercel.com)** (Hobby, free) | Built for Next.js; **push to GitHub → auto deploy** |
| **[Turso](https://turso.tech)** (free tier) | Hosted libSQL — same driver you already use; survives serverless |

Local `data/recomp.db` does **not** work on Vercel (ephemeral disk). Turso is the drop-in remote DB.

Alternatives (not chosen): Render/Railway free tiers sleep or expire; Fly.io needs a VM + volume for file SQLite — more ops for little gain.

### Auto-update flow

```text
git push origin master  →  Vercel builds & deploys production
```

No manual server SSH. Preview deploys also run on pull requests if you use them.

---

## One-time deploy checklist

### 1. Push this repo to GitHub

Create a new empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/recomp-tracker.git
git add -A
git status   # do not commit .env.local / secrets
git commit -m "Prepare for Vercel deploy"
git push -u origin master
```

### 2. Create a Turso database

1. Install CLI: https://docs.turso.tech/cli/installation  
2. Sign up / login: `turso auth login`  
3. Create DB (pick a region near you):

```bash
turso db create recomp-tracker
turso db show recomp-tracker --url
turso db tokens create recomp-tracker
```

Copy **URL** (`libsql://…`) and **token**.

Schema migrates automatically on first app request (`ensureMigrated`). Optional: import local data later with Turso dump/load docs.

### 3. Deploy on Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import** your GitHub repo  
2. Framework: Next.js (auto-detected)  
3. **Environment variables** (Production + Preview):

| Name | Value |
|------|--------|
| `AUTH_SECRET` | `npx auth secret` output |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `DATABASE_URL` | Turso URL (`libsql://…`) |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `AUTH_TRUST_HOST` | `true` |
| `FDC_API_KEY` | optional USDA key |
| `MISTRAL_API_KEY` | Mistral AI (macros guesser, photo describe, coach, menu) |
| `MISTRAL_VISION_MODEL` | optional; default `ministral-14b-latest` for photo food describe |
| `MISTRAL_MODEL` / `AI_PROVIDER` | optional AI provider selection (see `src/lib/ai-client.ts`) |

### AI / photo guesser (optional)

Photo guessing on the **Macros guesser** panel uses Mistral vision (two API calls: describe photo → guess macros). Requires `MISTRAL_API_KEY` on [La Plateforme](https://console.mistral.ai). The free **Experiment** tier includes vision models but is rate-limited (~1 req/sec); personal meal logging is usually fine.

```env
MISTRAL_API_KEY=your_key
# optional:
MISTRAL_VISION_MODEL=ministral-14b-latest
```

Other AI features (text macro guess, coach, menu improve) use the same key or `GEMINI_API_KEY` / `OPENAI_API_KEY` via `AI_PROVIDER`.

Do **not** set `AUTH_URL` to localhost. Either omit it, or set it to `https://YOUR_PROJECT.vercel.app`.

4. Deploy. Note the URL, e.g. `https://recomp-tracker.vercel.app`.

### 4. Google OAuth for production

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → your OAuth client → **Authorized redirect URIs**, add:

`https://YOUR_PROJECT.vercel.app/api/auth/callback/google`

(Authorized JavaScript origins: `https://YOUR_PROJECT.vercel.app`)

### 5. Confirm auto-deploy

After the project is linked:

```bash
git commit -am "Your change"
git push origin master
```

Vercel builds and updates production automatically (Dashboard → Deployments).

---

## Day-to-day updates

1. Develop locally (`npm run dev`, local SQLite is fine).  
2. Commit & push to `master` (or your Production branch in Vercel).  
3. Wait for the green deploy on Vercel — live site updates.

To change env vars later: Vercel → Project → Settings → Environment Variables → **Redeploy**.
