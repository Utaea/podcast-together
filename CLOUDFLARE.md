# Cloudflare Deployment Guide

The backend and frontend are deployed separately:

- Use the **Deploy to Cloudflare** button in the root README for the Worker backend.
- Use Cloudflare Pages' Git integration for the frontend.

The button targets `worker/`, so it does not deploy the Vue frontend.

## Frontend (Cloudflare Pages)

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback is handled via `public/_redirects`

For Pages Git integration, use the repository root as the project root.

Required environment variables:

- `VITE_API_URL=https://<worker-domain>`
- `VITE_WEBSOCKET_URL=wss://<worker-domain>`

If the Pages project is served from the same Worker domain, these variables can
be left unset and the frontend will use its current origin.

## Backend (Cloudflare Worker)

Backend source is in `worker/`.

- Main entry: `worker/src/index.ts`
- DO class: `RoomHub`
- D1 schema migration: `worker/migrations/0001_init.sql`
- Cron trigger configured in `worker/wrangler.toml`

## Useful commands (from repository root)

```bash
npm run cf:worker:dev
npm run cf:worker:typecheck
npm run cf:worker:migrate
npm run cf:worker:deploy
npm run pages:deploy
```

## Manual Worker setup

If you do not use the Deploy to Cloudflare button:

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create podcast_together
```

Copy the generated `database_id` into a local or private Wrangler override,
then run `npm run d1:migrate` and `npm run deploy`. The repository template
does not contain an account-specific database ID.
