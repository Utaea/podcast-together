import { DEFAULT_ROOM_CFG } from "../constants"
import type { ContentData, Participant, Room, RoomConfig, SpeedRate } from "../types"

interface RoomRow {
  id: string
  owner_nonce: string
  o_state: "OK" | "EXPIRED" | "DELETED"
  play_status: "PLAYING" | "PAUSED"
  speed_rate: SpeedRate
  content_stamp: number
  operate_stamp: number
  operator_guest_id: string
  create_stamp: number
  config_everyone_can_operate: "Y" | "N"
  config_everyone_can_change_content?: "Y" | "N"
  content_json: string
}

interface ParticipantRow {
  room_id: string
  nonce: string
  guest_id: string
  nick_name: string
  enter_stamp: number
  first_enter_stamp?: number
  heartbeat_stamp: number
  user_agent?: string
}

function mapRoomRow(row?: RoomRow | null): Room | undefined {
  if (!row) return undefined
  let content: ContentData = { infoType: "podcast", audioUrl: "" }
  try {
    content = JSON.parse(row.content_json) as ContentData
  } catch {
    content = { infoType: "podcast", audioUrl: "" }
  }
  return {
    id: row.id,
    content,
    oState: row.o_state,
    playStatus: row.play_status,
    speedRate: row.speed_rate,
    contentStamp: row.content_stamp,
    operateStamp: row.operate_stamp,
    operator: row.operator_guest_id,
    createStamp: row.create_stamp,
    owner: row.owner_nonce,
    config: {
      everyoneCanOperatePlayer: row.config_everyone_can_operate,
      everyoneCanChangeContent: row.config_everyone_can_change_content ?? "N",
    },
  }
}

function mapParticipantRow(row: ParticipantRow): Participant {
  return {
    nickName: row.nick_name,
    guestId: row.guest_id,
    heartbeatStamp: row.heartbeat_stamp,
    enterStamp: row.enter_stamp,
    firstEnterStamp: row.first_enter_stamp ?? row.enter_stamp,
    userAgent: row.user_agent,
    nonce: row.nonce,
  }
}

export async function getRoom(db: D1Database, roomId: string): Promise<Room | undefined> {
  const row = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId).first<RoomRow>()
  return mapRoomRow(row)
}

export async function listParticipants(db: D1Database, roomId: string): Promise<Participant[]> {
  const res = await db.prepare("SELECT * FROM room_participants WHERE room_id = ?").bind(roomId).all<ParticipantRow>()
  return (res.results || []).map(mapParticipantRow)
}

export async function getRoomWithParticipants(db: D1Database, roomId: string): Promise<{ room?: Room; participants: Participant[] }> {
  const [room, participants] = await Promise.all([getRoom(db, roomId), listParticipants(db, roomId)])
  return { room, participants }
}

export async function createRoom(db: D1Database, data: {
  roomId: string
  owner: string
  content: ContentData
  now: number
  config?: RoomConfig
}): Promise<void> {
  const cfg = data.config ?? DEFAULT_ROOM_CFG
  await db
    .prepare(
      `INSERT INTO rooms
      (id, owner_nonce, o_state, play_status, speed_rate, content_stamp, operate_stamp, operator_guest_id, create_stamp, config_everyone_can_operate, config_everyone_can_change_content, content_json)
      VALUES (?, ?, 'OK', 'PAUSED', '1', 0, ?, '', ?, ?, ?, ?)`
    )
    .bind(
      data.roomId,
      data.owner,
      data.now,
      data.now,
      cfg.everyoneCanOperatePlayer,
      cfg.everyoneCanChangeContent,
      JSON.stringify(data.content),
    )
    .run()
}

export async function updateRoom(db: D1Database, roomId: string, patch: Partial<Room>): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (patch.oState) {
    updates.push("o_state = ?")
    values.push(patch.oState)
  }
  if (patch.playStatus) {
    updates.push("play_status = ?")
    values.push(patch.playStatus)
  }
  if (patch.speedRate) {
    updates.push("speed_rate = ?")
    values.push(patch.speedRate)
  }
  if (typeof patch.contentStamp === "number") {
    updates.push("content_stamp = ?")
    values.push(patch.contentStamp)
  }
  if (typeof patch.operateStamp === "number") {
    updates.push("operate_stamp = ?")
    values.push(patch.operateStamp)
  }
  if (typeof patch.operator === "string") {
    updates.push("operator_guest_id = ?")
    values.push(patch.operator)
  }
  if (patch.content) {
    updates.push("content_json = ?")
    values.push(JSON.stringify(patch.content))
  }
  if (patch.config?.everyoneCanOperatePlayer) {
    updates.push("config_everyone_can_operate = ?")
    values.push(patch.config.everyoneCanOperatePlayer)
  }
  if (patch.config?.everyoneCanChangeContent) {
    updates.push("config_everyone_can_change_content = ?")
    values.push(patch.config.everyoneCanChangeContent)
  }

  if (updates.length < 1) return
  values.push(roomId)
  await db.prepare(`UPDATE rooms SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run()
}

export async function deleteParticipantsByRoom(db: D1Database, roomId: string): Promise<void> {
  await db.prepare("DELETE FROM room_participants WHERE room_id = ?").bind(roomId).run()
}

export async function removeParticipant(db: D1Database, roomId: string, nonce: string): Promise<void> {
  await db.prepare("DELETE FROM room_participants WHERE room_id = ? AND nonce = ?").bind(roomId, nonce).run()
}

export async function pruneParticipantsBefore(db: D1Database, roomId: string, heartbeatGreaterThan: number): Promise<void> {
  await db
    .prepare("DELETE FROM room_participants WHERE room_id = ? AND heartbeat_stamp <= ?")
    .bind(roomId, heartbeatGreaterThan)
    .run()
}

export async function upsertParticipant(db: D1Database, roomId: string, participant: Participant): Promise<void> {
  await db
    .prepare(
      `INSERT INTO room_participants
      (room_id, nonce, guest_id, nick_name, enter_stamp, first_enter_stamp, heartbeat_stamp, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, nonce) DO UPDATE SET
      guest_id = excluded.guest_id,
      nick_name = excluded.nick_name,
      enter_stamp = excluded.enter_stamp,
      first_enter_stamp = COALESCE(room_participants.first_enter_stamp, excluded.first_enter_stamp),
      heartbeat_stamp = excluded.heartbeat_stamp,
      user_agent = excluded.user_agent`
    )
    .bind(
      roomId,
      participant.nonce,
      participant.guestId,
      participant.nickName,
      participant.enterStamp,
      participant.firstEnterStamp,
      participant.heartbeatStamp,
      participant.userAgent ?? null,
    )
    .run()
}

export function getEarliestParticipant(participants: Participant[]): Participant | undefined {
  if (!participants.length) return undefined
  const list = [...participants]
  list.sort((a, b) => {
    const aFirst = a.firstEnterStamp || a.enterStamp
    const bFirst = b.firstEnterStamp || b.enterStamp
    if (aFirst !== bFirst) return aFirst - bFirst
    if (a.enterStamp !== b.enterStamp) return a.enterStamp - b.enterStamp
    return a.guestId.localeCompare(b.guestId)
  })
  return list[0]
}

export function getOwnerGuestId(ownerNonce: string, participants: Participant[]): string {
  const owner = participants.find((v) => v.nonce === ownerNonce)
  return owner?.guestId ?? ""
}

export async function ensureOwnerOnline(
  db: D1Database,
  roomId: string,
): Promise<{ room?: Room; participants: Participant[]; changed: boolean; ownerGuestId: string }> {
  let snapshot = await getRoomWithParticipants(db, roomId)
  let room = snapshot.room
  const participants = snapshot.participants
  if (!room) return { room: undefined, participants, changed: false, ownerGuestId: "" }
  const currentRoom = room
  if (!participants.length) return { room, participants, changed: false, ownerGuestId: "" }

  const ownerOnline = participants.some((v) => v.nonce === currentRoom.owner)
  if (!ownerOnline) {
    const nextOwner = getEarliestParticipant(participants)
    if (nextOwner && nextOwner.nonce !== currentRoom.owner) {
      await db
        .prepare("UPDATE rooms SET owner_nonce = ? WHERE id = ? AND owner_nonce = ?")
        .bind(nextOwner.nonce, currentRoom.id, currentRoom.owner)
        .run()
      snapshot = await getRoomWithParticipants(db, roomId)
      room = snapshot.room
      if (!room) return { room: undefined, participants: snapshot.participants, changed: true, ownerGuestId: "" }
      return {
        room,
        participants: snapshot.participants,
        changed: true,
        ownerGuestId: getOwnerGuestId(room.owner, snapshot.participants),
      }
    }
  }

  return {
    room,
    participants,
    changed: false,
    ownerGuestId: getOwnerGuestId(room.owner, participants),
  }
}

export async function findActiveRoomByOwner(db: D1Database, owner: string): Promise<Room | undefined> {
  const row = await db
    .prepare("SELECT * FROM rooms WHERE owner_nonce = ? AND o_state = 'OK' ORDER BY create_stamp DESC LIMIT 1")
    .bind(owner)
    .first<RoomRow>()
  return mapRoomRow(row)
}

export async function listPlayingRooms(db: D1Database): Promise<Room[]> {
  const res = await db
    .prepare("SELECT * FROM rooms WHERE o_state = 'OK' AND play_status = 'PLAYING' ORDER BY operate_stamp ASC")
    .all<RoomRow>()
  return (res.results || []).map((row) => mapRoomRow(row) as Room)
}

export async function recordVisitor(
  db: D1Database,
  params: {
    operateType: "CREATE" | "ENTER" | "HEARTBEAT" | "LEAVE"
    nonce: string
    nickName: string
    ua?: string
    ip?: string
  },
): Promise<void> {
  const now = Date.now()
  const old = await db.prepare("SELECT * FROM visitors WHERE nonce = ?").bind(params.nonce).first<any>()
  if (old) {
    const enterNum = params.operateType === "CREATE" ? Number(old.enter_num) : Number(old.enter_num) + 1
    const createNum = params.operateType === "CREATE" ? Number(old.create_num) + 1 : Number(old.create_num)
    const enterRoomStamp = params.operateType === "CREATE" ? Number(old.enter_room_stamp) : now
    const createRoomStamp = params.operateType === "CREATE" ? now : Number(old.create_room_stamp)

    await db
      .prepare(
        `UPDATE visitors
        SET nick_name = ?, enter_room_stamp = ?, enter_num = ?, create_num = ?, create_room_stamp = ?, user_agent = ?, ip = ?
        WHERE nonce = ?`,
      )
      .bind(
        params.nickName || old.nick_name || "",
        enterRoomStamp,
        enterNum,
        createNum,
        createRoomStamp,
        params.ua ?? old.user_agent ?? null,
        params.ip ?? old.ip ?? null,
        params.nonce,
      )
      .run()
    return
  }

  await db
    .prepare(
      `INSERT INTO visitors
      (nonce, nick_name, enter_room_stamp, enter_num, create_num, create_room_stamp, create_stamp, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.nonce,
      params.nickName,
      params.operateType === "ENTER" ? now : -1,
      params.operateType === "ENTER" ? 1 : 0,
      params.operateType === "CREATE" ? 1 : 0,
      params.operateType === "CREATE" ? now : -1,
      now,
      params.ua ?? null,
      params.ip ?? null,
    )
    .run()
}
