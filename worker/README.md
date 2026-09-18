# Cloudflare Worker Backend

This directory contains the Cloudflare backend for Podcast Together.

## Architecture

- Worker HTTP routes: `/room-operate`, `/parse-text`, `/pt-service`
- Durable Object: room-scoped WebSocket hub (`/ws/:roomId`)
- D1: `rooms`, `room_participants`, `visitors`
- Cron: room clock cleanup every minute

## Prerequisites

- Node.js 20+
- Wrangler login (`wrangler login`)
- A created D1 database

## First-time setup

1. Install dependencies:

```bash
npm install
```

2. Create D1 database:

```bash
wrangler d1 create podcast_together
```

3. Copy returned `database_id` into `worker/wrangler.toml` (`[[d1_databases]].database_id`).

4. Apply schema migrations:

```bash
npm run d1:migrate
```

## Run locally

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Frontend env alignment

Set frontend env vars to your Worker domain:

- `VITE_API_URL=https://<your-worker-domain>`
- `VITE_WEBSOCKET_URL=wss://<your-worker-domain>`

The frontend now auto-connects WebSocket to `/ws/:roomId`.
