import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '..')

function str(key: string, fallback = ''): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v.trim()
}

function num(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(key: string, fallback = false): boolean {
  const raw = str(key).toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function list(key: string): number[] {
  return str(key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
}

export interface AppConfig {
  botToken: string
  adminIds: number[]
  aiProvider: 'auto' | 'gemini' | 'openrouter'
  geminiApiKey: string
  openRouterApiKey: string
  defaultModel: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  maxHistory: number
  rateLimitPerMinute: number
  enableWebSearch: boolean
  port: number
  publicUrl: string
  dbPath: string
  demoMode: boolean
}

const DEFAULT_SYSTEM_PROMPT = [
  'تو یک دستیار هوش مصنوعی فارسی‌زبان، باهوش و مودب به نام «راهنما» هستی.',
  'قوانین پاسخ‌دهی:',
  '۱. همیشه به فارسی روان و طبیعی پاسخ بده (مگر اینکه کاربر صراحتاً زبان دیگری بخواهد).',
  '۲. پاسخ‌ها را کوتاه، دقیق و کاربردی بنویس؛ از حاشیه‌رفتن بپرهیز.',
  '۳. اگر چیزی را نمی‌دانی، صادقانه بگو و حدس نزن.',
  '۴. از ایموجی به‌صورت متعادل برای خوانایی بیشتر استفاده کن.',
  '۵. برای کد و دستورات از بلوک کد استفاده کن.',
].join('\n')

export const config: AppConfig = {
  botToken: str('BOT_TOKEN'),
  adminIds: list('ADMIN_IDS'),
  aiProvider: (str('AI_PROVIDER', 'auto') as AppConfig['aiProvider']) || 'auto',
  geminiApiKey: str('GEMINI_API_KEY'),
  openRouterApiKey: str('OPENROUTER_API_KEY'),
  defaultModel: str('DEFAULT_MODEL', 'gemini-3.8-flash'),
  systemPrompt: str('SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT),
  temperature: Math.min(Math.max(num('TEMPERATURE', 0.7), 0), 2),
  maxTokens: Math.min(Math.max(num('MAX_TOKENS', 2048), 256), 8192),
  maxHistory: Math.min(Math.max(num('MAX_HISTORY', 12), 0), 50),
  rateLimitPerMinute: Math.max(num('RATE_LIMIT_PER_MINUTE', 15), 1),
  enableWebSearch: bool('ENABLE_WEB_SEARCH', true),
  port: num('PORT', 3000),
  publicUrl: str('PUBLIC_URL', 'http://localhost:3000'),
  dbPath: path.isAbsolute(str('DB_PATH', './data/bot.db'))
    ? str('DB_PATH', './data/bot.db')
    : path.resolve(ROOT_DIR, str('DB_PATH', './data/bot.db')),
  demoMode: !str('BOT_TOKEN'),
}

/** فهرست مشکلات تنظیمات برای نمایش در داشبورد */
export function configIssues(): { level: 'error' | 'warn'; message: string }[] {
  const issues: { level: 'error' | 'warn'; message: string }[] = []
  if (!config.botToken) {
    issues.push({
      level: 'error',
      message: 'توکن ربات تنظیم نشده — فایل .env ساخته شود و BOT_TOKEN مقدار داده شود.',
    })
  }
  if (!config.geminiApiKey && !config.openRouterApiKey) {
    issues.push({
      level: 'error',
      message: 'هیچ کلید هوش مصنوعی تنظیم نشده — GEMINI_API_KEY یا OPENROUTER_API_KEY لازم است.',
    })
  } else if (!config.geminiApiKey) {
    issues.push({ level: 'warn', message: 'کلید Gemini تنظیم نشده؛ فقط OpenRouter فعال خواهد بود.' })
  } else if (!config.openRouterApiKey) {
    issues.push({ level: 'warn', message: 'کلید OpenRouter تنظیم نشده؛ فقط Gemini فعال خواهد بود.' })
  }
  if (config.adminIds.length === 0) {
    issues.push({ level: 'warn', message: 'ADMIN_IDS خالی است؛ پنل مدیریت برای کسی در دسترس نخواهد بود.' })
  }
  return issues
}
