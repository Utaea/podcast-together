import { ensureOwnerOnline, getRoomWithParticipants, listPlayingRooms, pruneParticipantsBefore, updateRoom } from "../db/repo"
import type { Env, Room } from "../types"

export async function runRoomClock(env: Env): Promise<void> {
  const list = await listPlayingRooms(env.DB)
  if (!list.length) return

  const now = Date.now()
  for (const room of list) {
    const snapshot = await getRoomWithParticipants(env.DB, room.id)
    const participants = snapshot.participants

    if (participants.length < 1) {
      await updateRoom(env.DB, room.id, { playStatus: "PAUSED" })
      continue
    }

    const oldLen = participants.length
    const sec50Ago = now - 50 * 1000
    await pruneParticipantsBefore(env.DB, room.id, sec50Ago)
    const newSnapshot = await getRoomWithParticipants(env.DB, room.id)
    const newLen = newSnapshot.participants.length
    if (newLen === oldLen) continue

    if (newLen === 0) {
      const patch = pauseWhenNobody(room, participants, now)
      await updateRoom(env.DB, room.id, patch)
      continue
    }
    await ensureOwnerOnline(env.DB, room.id)
  }
}

function pauseWhenNobody(room: Room, participants: { heartbeatStamp: number }[], now: number): Partial<Room> {
  let lastHeartbeat = 1
  for (const p of participants) {
    if (p.heartbeatStamp > lastHeartbeat) lastHeartbeat = p.heartbeatStamp
  }

  let speedRateNum = Number(room.speedRate)
  if (Number.isNaN(speedRateNum) || speedRateNum >= 1.71) speedRateNum = 1
  const diffMilli = lastHeartbeat - room.operateStamp
  return {
    playStatus: "PAUSED",
    contentStamp: room.contentStamp + diffMilli * speedRateNum,
    operateStamp: now,
    operator: "",
  }
}
