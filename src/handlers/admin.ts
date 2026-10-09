import type { Bot } from 'grammy'
import { t } from '../i18n/fa.js'
import { config } from '../config.js'
import { isAdmin } from '../bot.js'
import { getUser, statsStore, userStore, logBroadcast } from '../db/database.js'
import { toPersianDigits } from '../utils/text.js'

export function registerAdminHandlers(bot: Bot): void {
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(t.adminOnly)
      return
    }
    const text = ctx.message?.text?.replace(/^\/broadcast\s*/, '').trim() ?? ''
    if (!text) {
      await ctx.reply('📣 استفاده: `/broadcast متن پیام`')
      return
    }

    const status = await ctx.reply('📣 در حال ارسال به کاربران...')
    const users = statsStore.allUsers().filter((u) => !u.is_banned)
    let sent = 0
    let failed = 0
    for (const u of users) {
      try {
        await ctx.api.sendMessage(u.telegram_id, text)
        sent++
      } catch {
        failed++
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    logBroadcast(ctx.from!.id, text, sent, failed)
    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        status.message_id,
        `📣 ارسال کامل شد\n✅ موفق: ${toPersianDigits(sent)}\n❌ ناموفق: ${toPersianDigits(failed)}`,
      )
      .catch(() => {})
  })

  bot.command('ban', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return void (await ctx.reply(t.adminOnly))
    const arg = ctx.message?.text?.replace(/^\/ban\s*/, '').trim()
    const id = Number(arg)
    if (!Number.isFinite(id)) {
      await ctx.reply('⛔ استفاده: `/ban <آیدی عددی>`')
      return
    }
    if (config.adminIds.includes(id)) {
      await ctx.reply('⛔ نمی‌توانید ادمین را محروم کنید.')
      return
    }
    if (!getUser(id)) {
      await ctx.reply('⚠️ چنین کاربری یافت نشد.')
      return
    }
    userStore.setBanned(id, true)
    await ctx.reply(`⛔ کاربر ${toPersianDigits(id)} محروم شد.`)
  })

  bot.command('unban', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return void (await ctx.reply(t.adminOnly))
    const id = Number(ctx.message?.text?.replace(/^\/unban\s*/, '').trim())
    if (!Number.isFinite(id)) {
      await ctx.reply('♻️ استفاده: `/unban <آیدی عددی>`')
      return
    }
    if (!getUser(id)) {
      await ctx.reply('⚠️ چنین کاربری یافت نشد.')
      return
    }
    userStore.setBanned(id, false)
    await ctx.reply(`♻️ کاربر ${toPersianDigits(id)} آزاد شد.`)
  })

  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return void (await ctx.reply(t.adminOnly))
    const users = statsStore.allUsers().slice(0, 20)
    if (users.length === 0) {
      await ctx.reply('هنوز کاربری ثبت نشده است.')
      return
    }
    const lines = users.map((u, i) => {
      const name = u.first_name || u.username || '—'
      const flag = u.is_banned ? '⛔' : u.is_admin ? '🛠' : '👤'
      return `${toPersianDigits(i + 1)}. ${flag} ${name} — 💬 ${toPersianDigits(u.msg_count)}`
    })
    await ctx.reply(['👥 **آخرین کاربران**', '', ...lines].join('\n'))
  })
}
