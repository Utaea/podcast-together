import { jsonResponse } from "../utils/http"

export async function handlePtService(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ code: "E4005" })
  return jsonResponse({ code: "0000", data: { stamp: Date.now() } })
}
