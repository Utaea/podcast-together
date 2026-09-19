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
- A Cloudflare account with permission to create Workers, D1 databases, and Durable Objects

## First-time setup

1. Install dependencies:

```bash
npm install
```

2. Apply schema migrations and deploy:

```bash
npm run d1:migrate
npm run deploy
```

The Deploy to Cloudflare button in the repository README uses the root
configuration instead. It builds and serves the frontend together with the
Worker. This `worker/` configuration intentionally deploys only backend
resources and does not include static assets.

## Run locally

```bash
npm run dev
```

## Frontend env alignment

Set frontend env vars to your Worker domain:

- `VITE_API_URL=https://<your-worker-domain>`
- `VITE_WEBSOCKET_URL=wss://<your-worker-domain>`

The frontend now auto-connects WebSocket to `/ws/:roomId`.
