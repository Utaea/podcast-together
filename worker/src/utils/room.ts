import { DEFAULT_ROOM_CFG } from "../constants"
import type { Participant, ParticipantClient, RoRes, Room, SpeedRate } from "../types"

export function toParticipantClients(participants: Participant[]): ParticipantClient[] {
  return participants.map((v) => ({
    nickName: v.nickName,
    guestId: v.guestId,
    heartbeatStamp: v.heartbeatStamp,
    enterStamp: v.enterStamp,
  }))
}

export function toRoRes(room: Room, participants: Participant[], extra: Partial<RoRes> = {}): RoRes {
  const ownerGuestId = participants.find((v) => v.nonce === room.owner)?.guestId ?? ""
  return {
    roomId: room.id,
    content: room.content,
    playStatus: room.playStatus,
    speedRate: room.speedRate,
    operator: room.operator,
    contentStamp: room.contentStamp,
    operateStamp: room.operateStamp,
    participants: toParticipantClients(participants),
    ownerGuestId,
    everyoneCanOperatePlayer: room.config?.everyoneCanOperatePlayer ?? DEFAULT_ROOM_CFG.everyoneCanOperatePlayer,
    everyoneCanChangeContent: room.config?.everyoneCanChangeContent ?? DEFAULT_ROOM_CFG.everyoneCanChangeContent,
    ...extra,
  }
}

export function generateRoomId(): string {
  const chars = "abcdefghijkmnopqrstuvwyz123456789"
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let result = ""
  for (let i = 0; i < bytes.length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

export function generateGuestId(existingGuestIds: string[]): string {
  const chars = "abcdefghijkmnopqrstuvwyz123456789"
  for (let run = 0; run < 20; run++) {
    const bytes = crypto.getRandomValues(new Uint8Array(11))
    let id = ""
    for (let i = 0; i < bytes.length; i++) {
      id += chars[bytes[i] % chars.length]
    }
    if (!existingGuestIds.includes(id)) return id
  }
  return generateRoomId() + "x"
}

export function pauseRoomByLastHeartbeat(room: Room, participants: Participant[], operator = ""): Room {
  if (room.playStatus === "PAUSED") return room
  const updated: Room = { ...room, playStatus: "PAUSED" }

  let speedRateNum = Number(updated.speedRate)
  if (Number.isNaN(speedRateNum) || speedRateNum >= 1.71) speedRateNum = 1

  if (participants.length > 0) {
    let lastHeartbeat = updated.operateStamp
    for (const p of participants) {
      if (p.heartbeatStamp > lastHeartbeat) lastHeartbeat = p.heartbeatStamp
    }
    const diffStamp = lastHeartbeat - updated.operateStamp
    updated.contentStamp = updated.contentStamp + diffStamp * speedRateNum
    updated.operateStamp = Date.now()
    updated.operator = operator
  }

  return updated
}

export function normalizeSpeedRate(speedRate: string): SpeedRate {
  const list: SpeedRate[] = ["0.8", "1", "1.2", "1.5", "1.7"]
  if (list.includes(speedRate as SpeedRate)) return speedRate as SpeedRate
  return "1"
}
