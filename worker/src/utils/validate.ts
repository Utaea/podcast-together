import type { ContentData, RequestParam, ResType } from "../types"

interface BodyForRoom extends RequestParam {
  operateType?: string
  nickName?: string
  roomId?: string
  roomData?: ContentData
}

export function checkRoomOperateEntry(method: string, body: BodyForRoom | null): ResType | null {
  const errData: ResType = { code: "E4000" }
  if (method !== "POST") return { code: "E4005" }
  if (!body) return errData

  const localId = body["x-pt-local-id"]
  if (!localId) return errData

  const { operateType = "", nickName, roomId, roomData } = body
  const oTypes = ["CREATE", "ENTER", "HEARTBEAT", "LEAVE"]
  if (!nickName && operateType !== "CREATE") return errData
  if (!oTypes.includes(operateType)) return errData

  const mustHaveRoom = ["ENTER", "HEARTBEAT", "LEAVE"]
  if (!roomId && mustHaveRoom.includes(operateType)) return errData

  if (operateType === "CREATE") {
    if (!roomData) return errData
    if (roomData.infoType !== "podcast") return errData
    if (!roomData.audioUrl) {
      return { code: "E4000", errMsg: "roomData.audioUrl is required" }
    }
  }

  return null
}

interface ParseTextBody extends RequestParam {
  link?: string
}

export function checkParseTextEntry(method: string, body: ParseTextBody | null): ResType | null {
  if (method !== "POST") return { code: "E4005" }
  if (!body) return { code: "E4000" }
  const link = body.link
  if (!link || !body["x-pt-local-id"]) return { code: "E4000" }
  if (!link.startsWith("http")) return { code: "E4000" }
  return null
}
