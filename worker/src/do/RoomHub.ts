import { DEFAULT_ROOM_CFG, MIN_DURATION_FOR_A_PERSON } from "../constants"
import { ensureOwnerOnline, getOwnerGuestId, updateRoom } from "../db/repo"
import type { ContentData, Env, RoomStatus, WsRes } from "../types"
import { normalizeSpeedRate } from "../utils/room"

interface ReqBase {
  operateType: "FIRST_SEND" | "SET_PLAYER" | "HEARTBEAT" | "SET_CONTENT"
  roomId: string
  "x-pt-local-id": string
  "x-pt-stamp": number
}

interface ReqOperatePlayer extends ReqBase {
  playStatus: "PLAYING" | "PAUSED"
  speedRate: string
  contentStamp: number
  everyoneCanOperatePlayer?: "Y" | "N"
  everyoneCanChangeContent?: "Y" | "N"
}

interface ReqSetContent extends ReqBase {
  content: ContentData
}

interface SocketMeta {
  roomId: string
}

export class RoomHub {
  private state: DurableObjectState
  private env: Env
  private sockets = new Map<WebSocket, SocketMeta>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    for (const socket of this.state.getWebSockets()) {
      const meta = this.getSocketMeta(socket)
      if (!meta?.roomId) continue
      this.sockets.set(socket, meta)
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 })
    }

    const url = new URL(request.url)
    const roomId = url.pathname.split("/").filter(Boolean).pop() ?? ""
    if (!roomId) return new Response("roomId required", { status: 400 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server)
    this.setSocketMeta(server, { roomId })
    this.sockets.set(server, { roomId })

    const send: WsRes = { responseType: "CONNECTED" }
    server.send(JSON.stringify(send))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const req = this.getReqObject(message)
    if (!req || !this.checkReqObject(req)) {
      ws.close()
      return
    }

    const meta = this.sockets.get(ws) ?? this.getSocketMeta(ws)
    if (!meta || req.roomId !== meta.roomId) {
      ws.close()
      return
    }
    this.sockets.set(ws, meta)

    if (req.operateType === "FIRST_SEND") {
      await this.handleFirstSend(ws, req)
      return
    }
    if (req.operateType === "SET_PLAYER") {
      await this.handleSetPlayer(ws, req as ReqOperatePlayer)
      return
    }
    if (req.operateType === "SET_CONTENT") {
      await this.handleSetContent(ws, req as ReqSetContent)
      return
    }
    if (req.operateType === "HEARTBEAT") {
      const send: WsRes = { responseType: "HEARTBEAT" }
      ws.send(JSON.stringify(send))
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.sockets.delete(ws)
  }

  webSocketError(ws: WebSocket): void {
    this.sockets.delete(ws)
  }

  private async handleFirstSend(ws: WebSocket, req: ReqBase): Promise<void> {
    const snapshot = await ensureOwnerOnline(this.env.DB, req.roomId)
    const room = snapshot.room
    if (!room) {
      ws.close()
      return
    }
    const me = snapshot.participants.find((v) => v.nonce === req["x-pt-local-id"])
    if (!me || room.oState === "EXPIRED" || room.oState === "DELETED") {
      ws.close()
      return
    }

    const roomStatus: RoomStatus = {
      roomId: room.id,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      operator: room.operator,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      ownerGuestId: getOwnerGuestId(room.owner, snapshot.participants),
      everyoneCanOperatePlayer: room.config?.everyoneCanOperatePlayer ?? DEFAULT_ROOM_CFG.everyoneCanOperatePlayer,
      everyoneCanChangeContent: room.config?.everyoneCanChangeContent ?? DEFAULT_ROOM_CFG.everyoneCanChangeContent,
    }
    const send: WsRes = {
      responseType: "NEW_STATUS",
      roomStatus,
    }
    ws.send(JSON.stringify(send))
  }

  private async handleSetPlayer(ws: WebSocket, req: ReqOperatePlayer): Promise<void> {
    const snapshot = await ensureOwnerOnline(this.env.DB, req.roomId)
    const room = snapshot.room
    if (!room) return

    const isOwner = room.owner === req["x-pt-local-id"]
    const roomCfg = room.config ?? DEFAULT_ROOM_CFG
    if (!isOwner && roomCfg.everyoneCanOperatePlayer === "N") {
      return
    }

    const me = snapshot.participants.find((v) => v.nonce === req["x-pt-local-id"])
    if (!me) {
      ws.close()
      return
    }

    const guestId = me.guestId
    if (guestId === room.operator) {
      const diff = req["x-pt-stamp"] - room.operateStamp
      if (diff < MIN_DURATION_FOR_A_PERSON) return
    }

    const playStatus = req.playStatus
    const speedRate = normalizeSpeedRate(req.speedRate)
    const contentStamp = req.contentStamp
    const operateStamp = req["x-pt-stamp"]

    const patch: any = {
      playStatus,
      speedRate,
      contentStamp,
      operateStamp,
      operator: guestId,
    }

    const roomStatus: RoomStatus = {
      roomId: room.id,
      playStatus,
      speedRate,
      contentStamp,
      operateStamp,
      operator: guestId,
      ownerGuestId: getOwnerGuestId(room.owner, snapshot.participants),
      everyoneCanOperatePlayer: roomCfg.everyoneCanOperatePlayer,
      everyoneCanChangeContent: roomCfg.everyoneCanChangeContent,
    }

    if (isOwner && (req.everyoneCanOperatePlayer || req.everyoneCanChangeContent)) {
      roomStatus.everyoneCanOperatePlayer = req.everyoneCanOperatePlayer ?? roomCfg.everyoneCanOperatePlayer
      roomStatus.everyoneCanChangeContent = req.everyoneCanChangeContent ?? roomCfg.everyoneCanChangeContent
      patch.config = {
        everyoneCanOperatePlayer: req.everyoneCanOperatePlayer ?? roomCfg.everyoneCanOperatePlayer,
        everyoneCanChangeContent: req.everyoneCanChangeContent ?? roomCfg.everyoneCanChangeContent,
      }
    }

    await updateRoom(this.env.DB, room.id, patch)
    const msg = JSON.stringify({ responseType: "NEW_STATUS", roomStatus } as WsRes)
    this.broadcastToRoom(room.id, msg)
  }

  private async handleSetContent(ws: WebSocket, req: ReqSetContent): Promise<void> {
    const snapshot = await ensureOwnerOnline(this.env.DB, req.roomId)
    const room = snapshot.room
    if (!room) return

    const me = snapshot.participants.find((v) => v.nonce === req["x-pt-local-id"])
    if (!me) {
      ws.close()
      return
    }

    const isOwner = room.owner === req["x-pt-local-id"]
    const canChangeByCfg = room.config?.everyoneCanChangeContent === "Y"
    if (!isOwner && !canChangeByCfg) return

    const content = req.content
    if (!content || content.infoType !== "podcast" || !content.audioUrl) return
    const wsContent = this.compactContentForWs(content)

    const guestId = me.guestId
    const operateStamp = req["x-pt-stamp"]
    const roomStatus: RoomStatus = {
      roomId: room.id,
      playStatus: "PLAYING",
      speedRate: room.speedRate,
      contentStamp: 0,
      operateStamp,
      operator: guestId,
      ownerGuestId: getOwnerGuestId(room.owner, snapshot.participants),
      everyoneCanOperatePlayer: room.config?.everyoneCanOperatePlayer,
      everyoneCanChangeContent: room.config?.everyoneCanChangeContent,
    }

    await updateRoom(this.env.DB, room.id, {
      content,
      playStatus: "PLAYING",
      contentStamp: 0,
      operateStamp,
      operator: guestId,
    })

    const msg = JSON.stringify({
      responseType: "NEW_CONTENT",
      content: wsContent,
      roomStatus,
    } as WsRes)
    this.broadcastToRoom(room.id, msg)
  }

  private compactContentForWs(content: ContentData): ContentData {
    const trim = (val?: string, max = 2400): string | undefined => {
      if (!val) return val
      if (val.length <= max) return val
      return val.slice(0, max)
    }
    return {
      ...content,
      title: trim(content.title, 300),
      description: trim(content.description, 2400),
      seriesName: trim(content.seriesName, 300),
      imageUrl: trim(content.imageUrl, 800),
      linkUrl: trim(content.linkUrl, 1200),
      seriesUrl: trim(content.seriesUrl, 1200),
      sourceType: trim(content.sourceType, 100),
    }
  }

  private broadcastToRoom(roomId: string, message: string): void {
    for (const socket of this.state.getWebSockets()) {
      const meta = this.sockets.get(socket) ?? this.getSocketMeta(socket)
      if (!meta || meta.roomId !== roomId) continue
      this.sockets.set(socket, meta)
      try {
        socket.send(message)
      } catch {
        this.sockets.delete(socket)
      }
    }
  }

  private setSocketMeta(ws: WebSocket, meta: SocketMeta): void {
    try {
      ws.serializeAttachment(meta)
    } catch {
      // no-op
    }
  }

  private getSocketMeta(ws: WebSocket): SocketMeta | undefined {
    try {
      const meta = ws.deserializeAttachment() as SocketMeta | null
      if (!meta?.roomId) return undefined
      return meta
    } catch {
      return undefined
    }
  }

  private checkReqObject(data: ReqBase | ReqOperatePlayer | ReqSetContent): boolean {
    const { operateType, roomId } = data
    const clientId = data["x-pt-local-id"]
    const stamp = data["x-pt-stamp"]
    if (!operateType || !roomId || !clientId || !stamp) return false
    if (operateType === "SET_PLAYER") {
      const req = data as ReqOperatePlayer
      if (!req.playStatus || !req.speedRate) return false
      if (typeof req.contentStamp !== "number") return false
    }
    if (operateType === "SET_CONTENT") {
      const req = data as ReqSetContent
      const content = req.content
      if (!content || content.infoType !== "podcast" || !content.audioUrl) return false
    }
    return true
  }

  private getReqObject(data: ArrayBuffer | string): ReqBase | undefined {
    let text = ""
    if (typeof data === "string") text = data
    else text = new TextDecoder().decode(data)
    if (!text) return
    try {
      return JSON.parse(text) as ReqBase
    } catch {
      return
    }
  }
}
