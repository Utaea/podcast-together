import { RoomHub } from "./do/RoomHub"
import { runRoomClock } from "./cron/room-clock"
import { handleParseText } from "./routes/parse-text"
import { handlePtService } from "./routes/pt-service"
import { handleRoomOperate } from "./routes/room-operate"
import type { Env } from "./types"
import { jsonResponse, optionsResponse } from "./utils/http"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "OPTIONS") return optionsResponse()

    if (url.pathname.startsWith("/ws/")) {
      return handleWs(request, env)
    }

    if (url.pathname === "/room-operate") {
      return handleRoomOperate(request, env)
    }

    if (url.pathname === "/parse-text") {
      return handleParseText(request)
    }

    if (url.pathname === "/pt-service") {
      return handlePtService(request)
    }

    if (url.pathname === "/health") {
      return jsonResponse({ code: "0000", data: { ok: true, stamp: Date.now() } })
    }

    if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
      return env.ASSETS.fetch(request)
    }

    return jsonResponse({ code: "E4004", errMsg: "path not found" }, 404)
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runRoomClock(env)
  },
}

async function handleWs(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected websocket", { status: 426 })
  }
  const url = new URL(request.url)
  const roomId = url.pathname.split("/").filter(Boolean).pop() ?? ""
  if (!roomId) return new Response("roomId required", { status: 400 })

  const id = env.ROOM_HUB.idFromName(roomId)
  const stub = env.ROOM_HUB.get(id)
  return stub.fetch(request)
}

export { RoomHub }
