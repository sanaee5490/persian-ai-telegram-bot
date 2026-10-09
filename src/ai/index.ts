import { config } from '../config.js'
import { GeminiProvider } from './gemini.js'
import { OpenRouterProvider } from './openrouter.js'
import type { AiModelInfo, AiProvider, AiRequest, AiResult } from './types.js'
import { AiError } from './types.js'

export * from './types.js'
export type { AiModelInfo, AiProvider, AiRequest, AiResult }

const providers: AiProvider[] = []
if (config.geminiApiKey) providers.push(new GeminiProvider(config.geminiApiKey))
if (config.openRouterApiKey) providers.push(new OpenRouterProvider(config.openRouterApiKey))

export function getProviders(): AiProvider[] {
  return providers
}

export function getProvider(id: 'gemini' | 'openrouter'): AiProvider | undefined {
  return providers.find((p) => p.id === id)
}

/** فهرست تمام مدل‌های قابل استفاده، همراه با شناسهٔ ارائه‌دهنده */
export function allModels(): { provider: 'gemini' | 'openrouter'; model: AiModelInfo }[] {
  return providers.flatMap((p) => p.models.map((m) => ({ provider: p.id, model: m })))
}

/** پیدا کردن ارائه‌دهندهٔ یک مدل خاص */
export function findProviderForModel(modelId: string): { provider: AiProvider; model: AiModelInfo } | undefined {
  for (const p of providers) {
    const m = p.models.find((x) => x.id === modelId)
    if (m) return { provider: p, model: m }
  }
  return undefined
}

/** آیا مدل انتخابی در دسترس است؟ */
export function isModelAvailable(modelId: string): boolean {
  return findProviderForModel(modelId) !== undefined
}

/** مدل پیش‌فرض معتبر (اگر تنظیم شده در دسترس نبود، اولین مدل موجود) */
export function resolveDefaultModel(): string {
  if (findProviderForModel(config.defaultModel)) return config.defaultModel
  return allModels()[0]?.model.id ?? config.defaultModel
}

export function modelLabel(modelId: string): string {
  return findProviderForModel(modelId)?.model.label ?? modelId
}

/** آیا این خطا نشانهٔ مشکل موقت (که Worth retry است) دارد؟ */
export function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    err instanceof AiError &&
    (msg.includes('high demand') ||
      msg.includes('overloaded') ||
      msg.includes('503') ||
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('INTERNAL') ||
      msg.includes('UNAVAILABLE'))
  )
}

/**
 * اجرای درخواست با زنجیرهٔ fallback چندمرحله‌ای:
 *   ۱) مدل انتخابی کاربر
 *   ۲) بقیهٔ مدل‌های همان ارائه‌دهنده
 *   ۳) مدل‌های ارائه‌دهندهٔ دیگر
 */
export async function chat(modelId: string, req: AiRequest): Promise<AiResult> {
  if (providers.length === 0) {
    throw new AiError('هیچ ارائه‌دهندهٔ هوش مصنوعی تنظیم نشده است.', 'none')
  }

  const chain: { provider: AiProvider; model: string }[] = []
  const push = (provider: AiProvider, model: string) => {
    if (chain.some((c) => c.provider.id === provider.id && c.model === model)) return
    chain.push({ provider, model })
  }

  const preferred = findProviderForModel(modelId)
  if (preferred) {
    if (config.aiProvider === 'auto' || config.aiProvider === preferred.provider.id) {
      push(preferred.provider, modelId)
      // بقیهٔ مدل‌های همان ارائه‌دهنده (مثلاً وقتی مدل شلوغ است)
      if (config.aiProvider === 'auto') {
        for (const m of preferred.provider.models) {
          if (m.id !== modelId) push(preferred.provider, m.id)
        }
      }
    }
  }
  for (const p of providers) {
    if (config.aiProvider !== 'auto' && config.aiProvider !== p.id) continue
    for (const m of p.models) push(p, m.id)
  }
  if (chain.length === 0) {
    const p = providers[0]!
    push(p, p.models[0]!.id)
  }

  const errors: string[] = []
  for (const step of chain) {
    try {
      const result = await step.provider.chat(step.model, req)
      if (step.model !== modelId) {
        console.log(`🔀 مدل «${modelId}» در دسترس نبود → «${step.model}» استفاده شد.`)
      }
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`[${step.provider.id}/${step.model}] ${msg.slice(0, 120)}`)
      console.warn(`⚠️  AI fallback (${step.provider.id}/${step.model}): ${msg.slice(0, 120)}`)
    }
  }
  throw new AiError(`همهٔ مدل‌ها ناموفق بودند:\n${errors.slice(0, 6).join('\n')}`, 'chain')
}
