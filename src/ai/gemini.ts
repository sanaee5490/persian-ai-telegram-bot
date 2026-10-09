import type { AiImage, AiMessage, AiProvider, AiRequest, AiResult } from './types.js'
import { AiError } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

function toContents(messages: AiMessage[]): GeminiContent[] {
  const out: GeminiContent[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const parts: GeminiPart[] = []
    for (const img of m.images ?? []) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } })
    }
    if (m.audio) {
      parts.push({ inline_data: { mime_type: m.audio.mimeType, data: m.audio.data } })
    }
    if (m.content) parts.push({ text: m.content })
    if (parts.length === 0) parts.push({ text: '...' })
    out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts })
  }
  // Gemini الشرط می‌کند محتوا با پیام کاربر شروع شود
  while (out.length && out[0]!.role !== 'user') out.shift()
  if (out.length === 0) out.push({ role: 'user', parts: [{ text: 'سلام' }] })
  return out
}

export class GeminiProvider implements AiProvider {
  id = 'gemini' as const
  label = 'Google Gemini'

  /** مدل‌ها بر اساس لیست رسمی v1beta */
  models = [
    { id: 'gemini-3.8-flash', label: '⚡ Gemini 3.8 Flash', vision: true, audio: true },
    { id: 'gemini-flash-latest', label: '🔄 Flash (آخرین نسخه)', vision: true, audio: true },
    { id: 'gemini-3.7-flash', label: '🚀 Gemini 3.7 Flash', vision: true, audio: true },
    { id: 'gemini-3.6-flash', label: '🔷 Gemini 3.6 Flash', vision: true, audio: false },
    { id: 'gemini-3.5-flash', label: '🌟 Gemini 3.5 Flash', vision: true, audio: false },
    { id: 'gemini-3.5-flash-lite', label: '🪶 Gemini 3.5 Flash Lite', vision: true, audio: false },
    { id: 'gemini-3.1-flash-lite', label: '💨 Gemini 3.1 Flash Lite', vision: true, audio: false },
    { id: 'gemini-3.1-pro-preview', label: '💎 Gemini 3.1 Pro', vision: true, audio: true },
  ]

  constructor(private readonly apiKey: string) {}

  async chat(model: string, req: AiRequest): Promise<AiResult> {
    const body: Record<string, unknown> = {
      contents: toContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 2048,
        topP: 0.95,
      },
    }
    if (req.system) {
      body.systemInstruction = { parts: [{ text: req.system }] }
    }

    const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new AiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, 'gemini', res.status)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
    }

    if (data.promptFeedback?.blockReason) {
      throw new AiError(`Gemini blocked: ${data.promptFeedback.blockReason}`, 'gemini')
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim()

    if (!text) {
      throw new AiError('Gemini returned an empty response', 'gemini')
    }
    return { text, provider: 'gemini', model }
  }
}
