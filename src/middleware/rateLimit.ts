import type { Context } from 'grammy'
import { t } from '../i18n/fa.js'
import { config } from '../config.js'

const buckets = new Map<number, number[]>()

/** حداکثر N درخواست در هر دقیقه برای هر کاربر */
export async function rateLimit(ctx: Context, next: () => Promise<void>): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return next()

  const now = Date.now()
  const windowMs = 60_000
  const hits = (buckets.get(userId) ?? []).filter((ts) => now - ts < windowMs)
  hits.push(now)
  buckets.set(userId, hits)

  if (hits.length > config.rateLimitPerMinute) {
    const waitSec = Math.ceil((windowMs - (now - hits[0]!)) / 1000)
    await ctx.reply(t.rateLimited(Math.max(waitSec, 1))).catch(() => {})
    return
  }
  await next()
}

export function rateLimitStatus(): { tracked: number; limit: number } {
  return { tracked: buckets.size, limit: config.rateLimitPerMinute }
}

/** پاک‌سازی دوره‌ای حافظهٔ rate-limit */
setInterval(() => {
  const now = Date.now()
  for (const [id, hits] of buckets) {
    const live = hits.filter((ts) => now - ts < 60_000)
    if (live.length === 0) buckets.delete(id)
    else buckets.set(id, live)
  }
}, 120_000).unref()
