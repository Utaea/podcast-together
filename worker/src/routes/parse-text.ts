import type { ContentData, ResType } from "../types"
import { jsonResponse, readJsonBody } from "../utils/http"
import { checkParseTextEntry } from "../utils/validate"

const MAX_FETCH_MILLI = 4000
const WX_AUDIO_URL = "https://res.wx.qq.com/voice/getvoice?mediaid="
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup"

interface ParseBody {
  link?: string
}

export async function handleParseText(request: Request): Promise<Response> {
  const body = await readJsonBody<ParseBody>(request)
  const err = checkParseTextEntry(request.method, body as any)
  if (err) return jsonResponse(err)

  const link = body!.link as string
  if (isCdnLink(link)) {
    return jsonResponse({ code: "0000", data: { infoType: "podcast", audioUrl: link } })
  }

  const appleResult = await parseApplePodcast(link)
  if (appleResult) return jsonResponse({ code: "0000", data: appleResult })

  const html = await fetchLink(link)
  if (!html) return jsonResponse({ code: "E4004" })
  return jsonResponse(parseHtml(html, link))
}

function isCdnLink(link: string): boolean {
  try {
    const url = new URL(link)
    return /^\.(mp3|m4a)$/i.test(url.pathname.slice(url.pathname.lastIndexOf(".")))
  } catch {
    return false
  }
}

interface AppleEpisode {
  trackId?: number
  trackName?: string
  description?: string
  episodeUrl?: string
  artworkUrl600?: string
  artworkUrl100?: string
  collectionName?: string
}

interface AppleLookupResponse {
  results?: AppleEpisode[]
}

function getAppleEpisodeId(link: string): { collectionId: string; trackId: string; country: string } | undefined {
  try {
    const url = new URL(link)
    if (!/(^|\.)podcasts\.apple\.com$/.test(url.hostname)) return undefined

    const collectionMatch = url.pathname.match(/\/id(\d+)(?:\/|$)/i)
    const trackId = url.searchParams.get("i")
    if (!collectionMatch?.[1] || !trackId || !/^\d+$/.test(trackId)) return undefined

    const country = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase()
    return {
      collectionId: collectionMatch[1],
      trackId,
      country: country && /^[a-z]{2}$/.test(country) ? country : "us",
    }
  } catch {
    return undefined
  }
}

async function parseApplePodcast(link: string): Promise<ContentData | undefined> {
  const ids = getAppleEpisodeId(link)
  if (!ids) return undefined

  const lookupUrl = new URL(ITUNES_LOOKUP_URL)
  lookupUrl.searchParams.set("id", ids.collectionId)
  lookupUrl.searchParams.set("entity", "podcastEpisode")
  lookupUrl.searchParams.set("limit", "200")
  lookupUrl.searchParams.set("country", ids.country)

  const result = await fetchJson<AppleLookupResponse>(lookupUrl.toString())
  const episode = result?.results?.find((item) => String(item.trackId) === ids.trackId)
  const audioUrl = episode?.episodeUrl
  if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) return undefined

  return {
    infoType: "podcast",
    audioUrl,
    title: episode?.trackName,
    description: episode?.description,
    imageUrl: episode?.artworkUrl600 || episode?.artworkUrl100,
    linkUrl: link,
    sourceType: "apple_podcast",
    seriesName: episode?.collectionName,
  }
}

async function fetchJson<T>(link: string): Promise<T | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MAX_FETCH_MILLI)
  try {
    const res = await fetch(link, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; PodcastTogetherBot/1.0)" },
    })
    if (!res.ok) return undefined
    return await res.json() as T
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchLink(link: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MAX_FETCH_MILLI)
  try {
    const res = await fetch(link, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PodcastTogetherBot/1.0)",
      },
    })
    const html = await res.text()
    if (!html) return ""
    const lower = html.toLowerCase()
    if (!lower.includes("head") || !lower.includes("meta")) return ""
    return html
  } catch {
    return ""
  } finally {
    clearTimeout(timeout)
  }
}

function parseHtml(html: string, originLink: string): ResType<ContentData> {
  const isMp = originLink.includes("mp.weixin.qq.com")
  const appName = getMetaValue(html, "application-name", "name") || getMetaValue(html, "og:site_name", "property")

  let title = getMetaValue(html, "og:title", "property")
  let description = getMetaValue(html, "og:description", "property") || getMetaValue(html, "description", "property") || ""
  let imageUrl = getMetaValue(html, "og:image", "property")
  const twitterImage = getMetaValue(html, "twitter:image", "property")
  let audioUrl = getMetaValue(html, "og:audio", "property")
  let linkUrl = getMetaValue(html, "og:url", "property")
  let seriesName = ""
  let seriesUrl = ""
  let sourceType = ""

  if (!audioUrl) {
    audioUrl = getAudioUrl(html, { isMp })
    if (!audioUrl) return { code: "E4004" }
  }

  if (!imageUrl && twitterImage) imageUrl = twitterImage
  if (!title) title = getTitleTag(html)

  const podcastShowJson = getScriptJson(html, "schema:podcast-show")
  if (podcastShowJson) {
    if (podcastShowJson.url) linkUrl = podcastShowJson.url
    if (podcastShowJson.partOfSeries?.name) seriesName = podcastShowJson.partOfSeries.name
    if (podcastShowJson.partOfSeries?.url) seriesUrl = podcastShowJson.partOfSeries.url
    if (podcastShowJson.description) description = podcastShowJson.description
  }

  const podcastEpisodeJson = getScriptJson(html, "schema:podcast-episode")
    || getScriptJson(html, "schema:episode")
  if (podcastEpisodeJson) {
    if (podcastEpisodeJson.name) title = podcastEpisodeJson.name
    if (podcastEpisodeJson.description) description = podcastEpisodeJson.description
    if (podcastEpisodeJson.isPartOf && !seriesName) seriesName = podcastEpisodeJson.isPartOf
  }

  if (originLink.includes("pod.link")) {
    const podLinkResult = handleForPodLink(html, title)
    title = podLinkResult.title || title
    description = podLinkResult.description || description
    seriesName = podLinkResult.seriesName || seriesName
    seriesUrl = podLinkResult.seriesUrl || seriesUrl
    audioUrl = podLinkResult.audioUrl || audioUrl
  }

  const isYZYX = originLink.includes("youzhiyouxing.cn")
  if (isYZYX) {
    const yResult = handleForYzyx(html)
    if (!imageUrl && yResult.imageUrl) imageUrl = yResult.imageUrl
    if (!seriesName && yResult.seriesName) seriesName = yResult.seriesName
  }

  if (isMp) {
    sourceType = "weixin_mp"
    imageUrl = ""
    const regMp = /class="profile_nickname"[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>/i
    const m = html.match(regMp)
    if (m?.[1]) seriesName = m[1]
  }

  if (!linkUrl) linkUrl = originLink
  if (appName === "小宇宙") sourceType = "xiaoyuzhou"
  else if (appName === "一派·Podcast") {
    sourceType = "sspai"
    if (!seriesName) seriesName = "一派·Podcast"
    if (!seriesUrl) seriesUrl = "https://sspai.typlog.io/"
  } else if (isYZYX) sourceType = "youzhiyouxing"
  else if (linkUrl.includes("podcasts.apple.com")) sourceType = "apple_podcast"
  else if (appName && !seriesName) seriesName = appName

  return {
    code: "0000",
    data: {
      infoType: "podcast",
      title,
      audioUrl,
      description,
      imageUrl,
      linkUrl,
      sourceType,
      seriesName,
      seriesUrl,
    },
  }
}

function getMetaValue(html: string, key: string, attrType: "name" | "property"): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const reg1 = new RegExp(`<meta[^>]*${attrType}=["']${esc}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i")
  const reg2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrType}=["']${esc}["'][^>]*>`, "i")
  const m = html.match(reg1) || html.match(reg2)
  return m?.[1] ?? ""
}

function getTitleTag(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m?.[1]?.trim() ?? ""
}

function getScriptJson(html: string, name: string): any {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const reg = new RegExp(`<script[^>]*(?:(?:name|id)=["']${esc}["']|(?:name|id)=${esc})(?:[^>]*)>([\\s\\S]*?)<\\/script>`, "i")
  const m = html.match(reg)
  if (!m?.[1]) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function handleForPodLink(html: string, title: string) {
  let description = ""
  let seriesName = ""
  let seriesUrl = ""
  let audioUrl = ""

  const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (desc?.[1]) description = desc[1]

  const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
  if (ogSite?.[1]) seriesName = ogSite[1]

  if (title) {
    const idx = html.indexOf(title)
    if (idx > 0) audioUrl = getAudioUrl(html.slice(idx), { isMp: false })
  }

  return { title, description, seriesName, seriesUrl, audioUrl }
}

function handleForYzyx(html: string) {
  let imageUrl = ""
  let seriesName = ""
  const imageMatch = html.match(/class="lazy-image-container"[\s\S]*?<img[^>]*data-src="([^"]+)"/i)
  if (imageMatch?.[1]) imageUrl = imageMatch[1]

  const seriesMatch = html.match(/tw-text-14\s+tw-leading-none[^>]*>([^<]+)</i)
  if (seriesMatch?.[1]) seriesName = seriesMatch[1].trim()

  return { imageUrl, seriesName }
}

function getAudioUrl(html: string, opt: { isMp: boolean }): string {
  const urls = html.match(/https?:\/\/[^\s"'<>]+/gi) ?? []
  for (const rawUrl of urls) {
    const url = rawUrl
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .replace(/[),};]+$/g, "")
    if (/\.(mp3|m4a)(?:[?#]|$)/i.test(url)) return url
  }

  if (!opt.isMp) return ""

  const m2 = html.match(/(?<="voice_id":")\w{10,50}(?=")/)
  if (m2?.[0]) return WX_AUDIO_URL + m2[0]

  const m3 = html.match(/(?<='voice_id':')\w{10,50}(?=')/)
  if (m3?.[0]) return WX_AUDIO_URL + m3[0]

  return ""
}
