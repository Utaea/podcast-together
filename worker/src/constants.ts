import type { RoomConfig } from "./types"

export const MAX_ROOM_NUM = 15
export const MIN_DURATION_FOR_A_PERSON = 250
export const DEFAULT_ROOM_CFG: RoomConfig = {
  everyoneCanOperatePlayer: "Y",
  everyoneCanChangeContent: "N",
}
