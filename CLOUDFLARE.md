# Cloudflare Deployment Guide

The backend and frontend are deployed separately:

- Use the **Deploy to Cloudflare** button in the root README for the full application.
- Use Cloudflare Pages' Git integration for the frontend.

The button targets the repository root. It builds the Vue frontend and deploys
the static assets together with the Worker.

## Frontend (Cloudflare Pages)

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback is handled via `config/pages/_redirects` when using Pages

For Pages Git integration, use the repository root as the project root and use
`npm run pages:build` as the build command. The output directory remains `dist`.

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

### Deployment modes

- **Deploy to Cloudflare button**: uses the root `wrangler.toml`, runs the
  frontend build, and serves `dist/` from the Worker. The Worker handles API
  and WebSocket routes first, then serves the SPA for other browser requests.
- **Manual backend deployment**: run commands in `worker/`. It uses
  `worker/wrangler.toml`, which has no assets configuration and deploys only
  the API, WebSocket, D1, Durable Object, and Cron resources.

## Useful commands (from repository root)

```bash
npm run cf:worker:dev
npm run cf:worker:typecheck
npm run cf:worker:migrate
npm run cf:worker:deploy
npm run pages:deploy
```

The root `npm run build` intentionally does not copy the Pages `_redirects`
file, because Workers Static Assets provides SPA fallback through
`not_found_handling = "single-page-application"` and rejects that redirect
rule as an infinite loop.

The root command used by the Deploy to Cloudflare build is:

```bash
npm run deploy
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
