export type SpeedRate = "0.8" | "1" | "1.2" | "1.5" | "1.7"

export interface ContentData {
  infoType: "podcast"
  audioUrl: string
  sourceType?: string
  title?: string
  description?: string
  imageUrl?: string
  linkUrl?: string
  seriesName?: string
  seriesUrl?: string
}

export interface RoomConfig {
  everyoneCanOperatePlayer: "Y" | "N"
  everyoneCanChangeContent: "Y" | "N"
}

export interface Participant {
  nickName: string
  enterStamp: number
  firstEnterStamp: number
  heartbeatStamp: number
  userAgent?: string
  guestId: string
  nonce: string
}

export interface ParticipantClient {
  nickName: string
  guestId: string
  heartbeatStamp: number
  enterStamp: number
}

export interface Room {
  id: string
  content: ContentData
  oState: "OK" | "EXPIRED" | "DELETED"
  playStatus: "PLAYING" | "PAUSED"
  speedRate: SpeedRate
  contentStamp: number
  operateStamp: number
  operator: string
  createStamp: number
  owner: string
  config: RoomConfig
}

export interface RoRes {
  roomId: string
  content: ContentData
  playStatus: "PLAYING" | "PAUSED"
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  participants: ParticipantClient[]
  guestId?: string
  iamOwner?: "Y" | "N"
  ownerGuestId?: string
  everyoneCanOperatePlayer?: "Y" | "N"
  everyoneCanChangeContent?: "Y" | "N"
}

export interface ResType<T = RoRes> {
  code: string
  errMsg?: string
  showMsg?: string
  data?: T
}

export interface RequestParam {
  "x-pt-version": string
  "x-pt-client": string
  "x-pt-stamp": number
  "x-pt-language": string
  "x-pt-local-id": string
}

export interface RoomStatus {
  roomId: string
  playStatus: "PLAYING" | "PAUSED"
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  ownerGuestId?: string
  everyoneCanOperatePlayer?: "Y" | "N"
  everyoneCanChangeContent?: "Y" | "N"
}

export interface WsRes {
  responseType: "CONNECTED" | "NEW_STATUS" | "HEARTBEAT" | "NEW_CONTENT"
  roomStatus?: RoomStatus
  content?: ContentData
}

export interface Env {
  DB: D1Database
  ROOM_HUB: DurableObjectNamespace
  ASSETS?: Fetcher
}
