import type { AiProvider, AiRequest, AiResult } from './types.js'
import { AiError } from './types.js'

const BASE = 'https://openrouter.ai/api/v1'

type OrContent =
  | string
  | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[]

interface OrMessage {
  role: 'system' | 'user' | 'assistant'
  content: OrContent
}

function toMessages(req: AiRequest): OrMessage[] {
  const out: OrMessage[] = []
  if (req.system) out.push({ role: 'system', content: req.system })

  for (const m of req.messages) {
    if (m.role === 'system') continue
    const images = m.images ?? []
    if (images.length === 0) {
      out.push({ role: m.role, content: m.content || '...' })
      continue
    }
    const content: OrMessage['content'] = [{ type: 'text', text: m.content || 'این تصویر را توصیف کن.' }]
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } })
    }
    out.push({ role: m.role, content })
  }
  return out
}

export class OpenRouterProvider implements AiProvider {
  id = 'openrouter' as const
  label = 'OpenRouter'

  models = [
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: '🐳 Nemotron 3 Ultra 550B', vision: false },
    { id: 'thinkingmachines/inkling:free', label: '🔮 Inkling (۱M context)', vision: false },
    { id: 'nvidia/nemotron-3.5-lightning:free', label: '⚡ Nemotron 3.5 Lightning', vision: false },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: '🚀 Nemotron 3 Super 120B', vision: false },
    { id: 'google/gemma-4-31b-it:free', label: '💎 Gemma 4 31B', vision: true },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: '🧠 Nemotron Nano Omni', vision: true },
    { id: 'poolside/laguna-s-2.1:free', label: '🏊 Laguna S 2.1', vision: false },
  ]

  constructor(private readonly apiKey: string) {}

  async chat(model: string, req: AiRequest): Promise<AiResult> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/persian-ai-bot',
        'X-Title': 'Persian AI Telegram Bot',
      },
      body: JSON.stringify({
        model,
        messages: toMessages(req),
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 2048,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new AiError(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`, 'openrouter', res.status)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | { type: string; text?: string }[] }; finish_reason?: string }[]
      error?: { message?: string }
    }

    if (data.error?.message) {
      throw new AiError(`OpenRouter: ${data.error.message}`, 'openrouter')
    }

    const raw = data.choices?.[0]?.message?.content
    const text = typeof raw === 'string' ? raw : (raw ?? []).map((p) => p.text ?? '').join('')

    if (!text.trim()) throw new AiError('OpenRouter returned an empty response', 'openrouter')
    return { text: text.trim(), provider: 'openrouter', model }
  }
}
