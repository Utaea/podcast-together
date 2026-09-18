import { DEFAULT_ROOM_CFG, MAX_ROOM_NUM } from "../constants"
import {
  createRoom,
  deleteParticipantsByRoom,
  ensureOwnerOnline,
  findActiveRoomByOwner,
  getOwnerGuestId,
  getRoomWithParticipants,
  pruneParticipantsBefore,
  recordVisitor,
  removeParticipant,
  updateRoom,
  upsertParticipant,
} from "../db/repo"
import type { ContentData, Env, Participant, RequestParam, ResType, RoRes, Room } from "../types"
import { jsonResponse, readJsonBody } from "../utils/http"
import { generateGuestId, generateRoomId, pauseRoomByLastHeartbeat, toRoRes } from "../utils/room"
import { checkRoomOperateEntry } from "../utils/validate"

type OperateType = "CREATE" | "ENTER" | "HEARTBEAT" | "LEAVE"

interface CommonBody extends RequestParam {
  operateType: "ENTER" | "HEARTBEAT" | "LEAVE"
  roomId: string
  nickName: string
}

interface CreateBody extends RequestParam {
  operateType: "CREATE"
  roomData: ContentData
  nickName?: string
}

export async function handleRoomOperate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<CommonBody | CreateBody>(request)
  const err = checkRoomOperateEntry(request.method, body)
  if (err) return jsonResponse(err)

  const op = body!.operateType as OperateType
  const ua = request.headers.get("user-agent") ?? undefined
  const ip = request.headers.get("cf-connecting-ip") ?? undefined

  let res: ResType = { code: "E4044" }
  if (op === "CREATE") res = await handleCreate(env, body as CreateBody, ua, ip)
  else if (op === "ENTER") res = await handleEnter(env, body as CommonBody, ua, ip)
  else if (op === "HEARTBEAT") res = await handleHeartbeat(env, body as CommonBody)
  else if (op === "LEAVE") res = await handleLeave(env, body as CommonBody)

  return jsonResponse(res)
}

async function handleCreate(env: Env, body: CreateBody, ua?: string, ip?: string): Promise<ResType<RoRes>> {
  const clientId = body["x-pt-local-id"]
  await checkMyRoomAndDelete(env, clientId)
  await recordVisitor(env.DB, {
    operateType: "CREATE",
    nonce: clientId,
    nickName: body.nickName ?? "",
    ua,
    ip,
  })

  const now = Date.now()
  const roomId = generateRoomId()
  await createRoom(env.DB, {
    roomId,
    owner: clientId,
    content: body.roomData,
    now,
    config: DEFAULT_ROOM_CFG,
  })

  const res: RoRes = {
    roomId,
    content: body.roomData,
    playStatus: "PAUSED",
    speedRate: "1",
    operator: "",
    contentStamp: 0,
    operateStamp: now,
    participants: [],
    ownerGuestId: "",
    everyoneCanOperatePlayer: DEFAULT_ROOM_CFG.everyoneCanOperatePlayer,
    everyoneCanChangeContent: DEFAULT_ROOM_CFG.everyoneCanChangeContent,
  }
  return { code: "0000", data: res }
}

async function checkMyRoomAndDelete(env: Env, clientId: string): Promise<void> {
  const oldRoom = await findActiveRoomByOwner(env.DB, clientId)
  if (!oldRoom) return

  const participants = (await getRoomWithParticipants(env.DB, oldRoom.id)).participants
  let paused = pauseRoomByLastHeartbeat(oldRoom, participants)
  paused = { ...paused, oState: "DELETED" }
  await updateRoom(env.DB, paused.id, paused)
  await deleteParticipantsByRoom(env.DB, paused.id)
}

async function handleEnter(env: Env, body: CommonBody, ua?: string, ip?: string): Promise<ResType<RoRes>> {
  const clientId = body["x-pt-local-id"]
  const { roomId, nickName } = body
  const snapshot = await getRoomWithParticipants(env.DB, roomId)
  const room = snapshot.room
  let participants = snapshot.participants

  if (!room) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }

  const now = Date.now()
  const old = participants.find((v) => v.nonce === clientId)
  let guestId = ""
  if (old) {
    guestId = old.guestId
    old.nickName = nickName
    old.enterStamp = now
    old.heartbeatStamp = now
    old.userAgent = ua
    await upsertParticipant(env.DB, roomId, old)
  } else {
    if (participants.length >= MAX_ROOM_NUM) return { code: "R0001" }
    guestId = generateGuestId(participants.map((v) => v.guestId))
    const me: Participant = {
      nickName,
      enterStamp: now,
      firstEnterStamp: now,
      heartbeatStamp: now,
      userAgent: ua,
      guestId,
      nonce: clientId,
    }
    await upsertParticipant(env.DB, roomId, me)
  }

  await pruneParticipantsBefore(env.DB, roomId, now - 60 * 1000)
  const ownerSnapshot = await ensureOwnerOnline(env.DB, roomId)
  participants = ownerSnapshot.participants
  const finalRoom = ownerSnapshot.room
  if (!finalRoom) return { code: "E4004" }

  await recordVisitor(env.DB, {
    operateType: "ENTER",
    nonce: clientId,
    nickName,
    ua,
    ip,
  })

  const roRes = toRoRes(finalRoom, participants, {
    guestId,
    iamOwner: finalRoom.owner === clientId ? "Y" : "N",
    ownerGuestId: getOwnerGuestId(finalRoom.owner, participants),
  })
  return { code: "0000", data: roRes }
}

async function handleHeartbeat(env: Env, body: CommonBody): Promise<ResType<RoRes>> {
  const clientId = body["x-pt-local-id"]
  const { roomId, nickName } = body
  const snapshot = await getRoomWithParticipants(env.DB, roomId)
  const room = snapshot.room
  if (!room) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }

  const now = Date.now()
  const me = snapshot.participants.find((v) => v.nonce === clientId)
  if (!me) return { code: "E4003" }
  me.heartbeatStamp = now
  me.nickName = nickName
  await upsertParticipant(env.DB, roomId, me)

  await pruneParticipantsBefore(env.DB, roomId, now - 50 * 1000)
  const ownerSnapshot = await ensureOwnerOnline(env.DB, roomId)
  const finalRoom = ownerSnapshot.room
  const participants = ownerSnapshot.participants
  if (!finalRoom) return { code: "E4004" }
  const roRes = toRoRes(finalRoom, participants, {
    ownerGuestId: getOwnerGuestId(finalRoom.owner, participants),
  })
  return { code: "0000", data: roRes }
}

async function handleLeave(env: Env, body: CommonBody): Promise<ResType> {
  const clientId = body["x-pt-local-id"]
  const { roomId } = body
  const snapshot = await getRoomWithParticipants(env.DB, roomId)
  const room = snapshot.room
  const participants = snapshot.participants

  if (!room) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }
  if (participants.length < 1) return { code: "0000" }

  const me = participants.find((v) => v.nonce === clientId)
  if (!me) return { code: "E4003" }
  if (participants.length === 1) {
    const paused = pauseRoomByLastHeartbeat(room, participants)
    await updateRoom(env.DB, roomId, paused)
    await deleteParticipantsByRoom(env.DB, roomId)
    return { code: "0000" }
  }

  await removeParticipant(env.DB, roomId, clientId)
  await ensureOwnerOnline(env.DB, roomId)
  return { code: "0000" }
}

export function roomToStatus(room: Room): {
  roomId: string
  playStatus: "PLAYING" | "PAUSED"
  speedRate: string
  operator: string
  contentStamp: number
  operateStamp: number
  ownerGuestId?: string
  everyoneCanOperatePlayer?: "Y" | "N"
  everyoneCanChangeContent?: "Y" | "N"
} {
  return {
    roomId: room.id,
    playStatus: room.playStatus,
    speedRate: room.speedRate,
    operator: room.operator,
    contentStamp: room.contentStamp,
    operateStamp: room.operateStamp,
    ownerGuestId: "",
    everyoneCanOperatePlayer: room.config?.everyoneCanOperatePlayer,
    everyoneCanChangeContent: room.config?.everyoneCanChangeContent,
  }
}
