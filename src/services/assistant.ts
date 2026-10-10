import { config } from '../config.js'
import { chat, findProviderForModel, resolveDefaultModel } from '../ai/index.js'
import type { AiMessage } from '../ai/index.js'
import { historyStore, userStore, getUser } from '../db/database.js'
import { t } from '../i18n/fa.js'
import { formatSearchContext, webSearch } from '../tools/search.js'
import { memoryContext, extractMemories } from './memory.js'

export interface AskOptions {
  userId: number
  text: string
  images?: { mimeType: string; data: string }[]
  audio?: { mimeType: string; data: string }
  useSearch?: boolean
  /** متن ورودی کاربر در حافظه ذخیره شود؟ */
  remember?: boolean
}

export interface AskResult {
  text: string
  model: string
  usedSearch: boolean
}

function personaPrompt(personaId: string): string {
  return t.personas.find((p) => p.id === personaId)?.prompt ?? ''
}

export function buildSystemPrompt(userId: number): string {
  const user = getUser(userId)
  const persona = personaPrompt(user?.persona ?? 'default')
  const parts = [config.systemPrompt]
  if (persona) parts.push(persona)
  return parts.join('\n\n')
}

export function effectiveTemperature(userId: number): number {
  const user = getUser(userId)
  return user && user.temperature >= 0 ? user.temperature : config.temperature
}

/** پرچم‌های قابلیت مدل انتخابی کاربر */
export function userModelInfo(userId: number): { id: string; label: string; vision: boolean; audio: boolean } {
  const user = getUser(userId)
  const modelId = user?.model && findProviderForModel(user.model) ? user.model : resolveDefaultModel()
  const found = findProviderForModel(modelId)
  return {
    id: modelId,
    label: found?.model.label ?? modelId,
    vision: found?.model.vision ?? false,
    audio: found?.model.audio ?? false,
  }
}

export async function askAssistant(opts: AskOptions): Promise<AskResult> {
  const { userId, text, images, audio } = opts
  const remember = opts.remember !== false

  const model = userModelInfo(userId)
  let system = buildSystemPrompt(userId)

  // حافظهٔ بلندمدت: حقایق مرتبط با این گفتگو را به system prompt اضافه کن
  try {
    const mem = await memoryContext(userId, text.trim())
    if (mem) system = `${system}\n\n${mem}`
  } catch {
    /* حافظه اختیاری است */
  }

  let usedSearch = false
  let searchBlock = ''
  if (opts.useSearch && config.enableWebSearch && text.trim()) {
    try {
      const outcome = await webSearch(text.trim(), 5)
      if (outcome.results.length > 0) {
        searchBlock = formatSearchContext(outcome)
        usedSearch = true
        userStore.inc.search(userId)
      }
    } catch (err) {
      console.warn('جستجوی وب ناموفق:', err instanceof Error ? err.message : err)
    }
  }

  const history = historyStore.recent(userId, config.maxHistory)
  const messages: AiMessage[] = history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }))

  let userContent = text.trim()
  if (searchBlock) userContent = `${searchBlock}\n\n---\nسوال کاربر: ${userContent || 'خلاصه‌ای از نتایج بالا بده'}`
  if (!userContent && images?.length) userContent = 'این تصویر را با جزئیات کامل توصیف و تحلیل کن. به فارسی پاسخ بده.'
  if (!userContent && audio) userContent = 'این پیام صوتی را به متن فارسی تبدیل کن و اگر سوالی داشت پاسخ بده.'
  if (!userContent) userContent = '...'

  messages.push({
    role: 'user',
    content: userContent,
    ...(images?.length ? { images } : {}),
    ...(audio ? { audio } : {}),
  })

  const result = await chat(model.id, {
    system,
    messages,
    temperature: effectiveTemperature(userId),
    maxTokens: config.maxTokens,
  })

  if (remember) {
    historyStore.add(userId, 'user', text.trim() || (images?.length ? '[تصویر]' : '[صدا]'))
    historyStore.add(userId, 'assistant', result.text)
    userStore.inc.msg(userId)
    if (images?.length) userStore.inc.image(userId)
    if (audio) userStore.inc.voice(userId)
  }

  return { text: result.text, model: result.model, usedSearch }
}
