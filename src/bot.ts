import { Bot, GrammyError, HttpError } from 'grammy'
import { config } from './config.js'

export const bot = new Bot(config.botToken || 'demo-mode-no-token')

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) return JSON.stringify(err)
  return String(err)
}

/** لاگ خطاها */
bot.catch((err) => {
  const e: unknown = err.error
  console.error(`❌ خطا در پردازش آپدیت ${err.ctx.update.update_id}:`)
  if (e instanceof GrammyError) {
    console.error('  Telegram API:', e.description)
  } else if (e instanceof HttpError) {
    console.error('  Network:', describe(e.error))
  } else {
    console.error('  Unknown:', describe(e))
  }
})

export function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && config.adminIds.includes(userId)
}
