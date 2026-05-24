/**
 * Thin OpenRouter chat completion wrapper.
 * Server-only — never expose OPENROUTER_API_KEY to the browser.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

/** A multimodal content part — text, an inline file (PDF), or an image. */
export type ORContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string } }

/** A tool call emitted by the assistant, OpenAI-style. */
export interface ORToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type ORMessage =
  | { role: "system" | "assistant"; content: string; tool_calls?: ORToolCall[] }
  | { role: "user"; content: string | ORContentPart[] }
  | { role: "tool"; content: string; tool_call_id: string }

/** Tool definition surfaced to the LLM. */
export interface ORTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>   // JSON Schema
  }
}

export interface ORChatOptions {
  model?: string
  messages: ORMessage[]
  temperature?: number
  responseFormat?: "json_object" | "text"
  maxTokens?: number
  /** Soft timeout in ms (default 45s). */
  timeoutMs?: number
  /** OpenRouter plugins, e.g. the file-parser/OCR engine. */
  plugins?: unknown[]
  /** Tools the assistant may call. */
  tools?: ORTool[]
  /** "auto" lets the LLM choose; "none" disables tools; or a specific tool name. */
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } }
}

export interface ORChatResult {
  content: string
  toolCalls?: ORToolCall[]
  finishReason?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export async function openrouterChat(opts: ORChatOptions): Promise<ORChatResult> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim()
  if (!key) throw new Error("OPENROUTER_API_KEY missing")

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000)

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://naywastudio.com",
        "X-Title": "Naywa Studio",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: opts.model ?? "openai/gpt-4o-mini",
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2400,
        ...(opts.responseFormat === "json_object"
          ? { response_format: { type: "json_object" } }
          : {}),
        ...(opts.plugins ? { plugins: opts.plugins } : {}),
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
      }),
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 240)}`)
  }

  const data = await res.json() as {
    choices?: {
      message?: { content?: string | null; tool_calls?: ORToolCall[] }
      finish_reason?: string
    }[]
    usage?: ORChatResult["usage"]
    error?: { message?: string }
  }
  if (data.error?.message) throw new Error(`OpenRouter: ${data.error.message}`)

  const msg = data.choices?.[0]?.message
  return {
    content: (msg?.content ?? "") || "",
    toolCalls: msg?.tool_calls,
    finishReason: data.choices?.[0]?.finish_reason,
    usage: data.usage,
  }
}

/** Best-effort JSON extraction from an LLM response. */
export function safeJsonParse<T>(s: string): T | null {
  if (!s) return null
  // Strip code fences if present
  const stripped = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  try { return JSON.parse(stripped) as T } catch { /* fall through */ }
  // Try first {...} block
  const m = stripped.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as T } catch { /* ignore */ }
  }
  return null
}
