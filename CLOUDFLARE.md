# Cloudflare Deployment Notes

## Frontend (Cloudflare Pages)

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback is handled via `public/_redirects`

Required environment variables:

- `VITE_API_URL=https://<worker-domain>`
- `VITE_WEBSOCKET_URL=wss://<worker-domain>`

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
```
