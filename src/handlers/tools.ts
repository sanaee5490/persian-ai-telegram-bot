/**
 * ابزارهای دستیار: انسانی‌سازی، ترجمه، خلاصه‌سازی، خواندن سند، خلاصهٔ لینک
 */

import type { Bot } from 'grammy'
import { t } from '../i18n/fa.js'
import { upsertUser } from '../db/database.js'
import { startTyping } from '../utils/telegram.js'
import { sendLong } from '../utils/text.js'
import { downloadAsBase64 } from '../utils/telegram.js'
import { humanize, translate, summarize, readImage, summarizeUrl } from '../ai/tools.js'
import { backKeyboard, speakKeyboard } from '../keyboards/menus.js'
import { memoryStore } from '../db/database.js'
import { extractMemories } from '../services/memory.js'

/** متن را از پیام یا ریپلای بیرون می‌کشد */
function pickText(ctx: { message?: { text?: string; reply_to_message?: { text?: string } } }): string {
  const raw = ctx.message?.text ?? ''
  const direct = raw.replace(/^\/\w+\s*/, '').trim()
  if (direct) return direct
  return (ctx.message?.reply_to_message?.text ?? '').trim()
}

/** تصویر را از پیام یا ریپلای بیرون می‌کشد */
async function pickImage(ctx: {
  message?: {
    photo?: { file_id: string }[]
    reply_to_message?: { photo?: { file_id: string }[] }
  }
}): Promise<{ mimeType: string; data: string } | undefined> {
  const msg = ctx.message
  const photos = msg?.photo ?? msg?.reply_to_message?.photo
  if (!photos || photos.length === 0) return undefined
  const best = photos[photos.length - 1]!
  const img = await downloadAsBase64(best.file_id)
  return img ?? undefined
}

export function registerToolHandlers(bot: Bot): void {
  // ---------- ✍️ انسانی‌سازی متن ----------
  bot.command(['humanize', 'rewrite'], async (ctx) => {
    const text = pickText(ctx)
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    if (!text) {
      await ctx.reply(
        [
          '✍️ **انسانی‌سازی متن**',
          '',
          'متن خودت را بفرست:',
          '`/humanize این متن را طبیعی کن`',
          '',
          'یا روی هر پیامی **ریپلای** کن و `/humanize` بزن.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    const stop = startTyping(ctx.chat!.id)
    try {
      const out = await humanize(text)
      stop()
      await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  // ---------- 🌐 ترجمه ----------
  bot.command('translate', async (ctx) => {
    const text = pickText(ctx)
    if (!text) {
      await ctx.reply(
        [
          '🌐 **ترجمهٔ حرفه‌ای**',
          '',
          '`/translate <متن>` — خودکار فارسی یا انگلیسی تشخیص داده می‌شود',
          '',
          'یا روی پیامی ریپلای کن و `/translate` بزن.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const stop = startTyping(ctx.chat!.id)
    try {
      // اگر متن عربی/لاتین بود → فارسی، وگرنه → انگلیسی
      const target = /[a-zA-Z]/.test(text) ? 'fa' : 'en'
      const out = await translate(text, target)
      stop()
      const header = target === 'fa' ? '🇮🇷 ترجمهٔ فارسی:' : '🇬🇧 English translation:'
      await sendLong((c) => ctx.reply(`${header}\n\n${c}`), out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  // ---------- 📝 خلاصه‌سازی ----------
  bot.command('summarize', async (ctx) => {
    const text = pickText(ctx)
    if (!text) {
      await ctx.reply(
        [
          '📝 **خلاصه‌سازی**',
          '',
          '`/summarize <متن بلند>` — خلاصهٔ کوتاه',
          '`/bullets <متن>` — نکات کلیدی',
          '`/detailed <متن>` — خلاصهٔ کامل',
          '',
          'یا روی پیامی ریپلای کن.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const stop = startTyping(ctx.chat!.id)
    try {
      const out = await summarize(text, 'short')
      stop()
      await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  bot.command('bullets', async (ctx) => {
    const text = pickText(ctx)
    if (!text) return ctx.reply('📝 متنی بفرست یا روی پیامی ریپلای کن.')
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const stop = startTyping(ctx.chat!.id)
    try {
      const out = await summarize(text, 'bullets')
      stop()
      await ctx.reply(out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  bot.command('detailed', async (ctx) => {
    const text = pickText(ctx)
    if (!text) return ctx.reply('📝 متنی بفرست یا روی پیامی ریپلای کن.')
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const stop = startTyping(ctx.chat!.id)
    try {
      const out = await summarize(text, 'detailed')
      stop()
      await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  // ---------- 🔗 خلاصه‌سازی لینک ----------
  bot.command('link', async (ctx) => {
    const raw = pickText(ctx)
    const url = /(https?:\/\/[^\s]+)/.exec(raw)?.[1]
    if (!url) {
      await ctx.reply(
        [
          '🔗 **خلاصه‌سازی لینک**',
          '',
          '`/link https://example.com/article`',
          '',
          'صفحه خوانده می‌شود و خلاصهٔ فارسی می‌گیری.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const stop = startTyping(ctx.chat!.id)
    const status = await ctx.reply('⏳ در حال خواندن صفحه...')
    try {
      const { summary, title, words } = await summarizeUrl(url, 'short')
      stop()
      const head = `🔗 **${title ?? 'صفحهٔ وب'}**\n📊 ~${words} کلمه\n\n`
      await ctx.api
        .editMessageText(ctx.chat!.id, status.message_id, head + summary)
        .catch(async () => ctx.reply(head + summary))
    } catch (err) {
      stop()
      await ctx.api
        .editMessageText(ctx.chat!.id, status.message_id, `⚠️ ${(err as Error).message.slice(0, 180)}`)
        .catch(() => {})
    }
  })

  // ---------- 📄 خواندن سند و عکس (OCR) ----------
  bot.command('ocr', async (ctx) => {
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const img = await pickImage(ctx as never)
    if (!img) {
      await ctx.reply(
        [
          '📄 **خواندن متن از تصویر**',
          '',
          'عکس سند، فاکتور یا اسکرین‌شات را بفرست و روی آن **ریپلای** کن با `/ocr`',
          '',
          'یا فقط `/ocr` را بزن تا راهنما ببینی.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    const stop = startTyping(ctx.chat!.id)
    try {
      const out = await readImage([img], 'تمام متن موجود در این تصویر را استخراج کن.')
      stop()
      await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
    } catch (err) {
      stop()
      await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
    }
  })

  // ---------- 🧰 دکمه‌های منوی ابزارها ----------
  bot.callbackQuery(/^tool:/, async (ctx) => {
    const which = ctx.callbackQuery!.data.split(':')[1]
    const text = t.tools[which as keyof typeof t.tools]
    if (typeof text !== 'string') {
      await ctx.answerCallbackQuery('ابزار ناشناس').catch(() => {})
      return
    }
    await ctx.answerCallbackQuery().catch(() => {})
    await ctx.editMessageText(text, { reply_markup: backKeyboard() }).catch(() => {})
  })

  // ---------- 🧠 حافظه ----------
  bot.command('memory', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const arg = pickText(ctx).toLowerCase()

    if (arg === 'clear' || arg === 'پاک') {
      memoryStore.clear(user.telegram_id)
      await ctx.reply('🧠 حافظهٔ بلندمدت پاک شد.')
      return
    }

    const all = memoryStore.all(user.telegram_id)
    if (all.length === 0) {
      await ctx.reply(
        [
          '🧠 **حافظهٔ بلندمدت**',
          '',
          'هنوز چیزی دربارهٔ تو نمی‌دانم.',
          '',
          'با من حرف بزن — به‌طور خودکار چیزهای مهمی مثل نام، شغل و سلیقه‌ات را یادم می‌ماند.',
          '',
          '`/memory clear` — پاک کردن همه',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }

    await ctx.reply(
      [
        `🧠 **چیزهایی که دربارهٔ تو می‌دانم** (${all.length})`,
        '',
        ...all.slice(0, 25).map((m) => `• ${m.content}`),
        '',
        '`/memory clear` — پاک کردن همه',
      ].join('\n'),
      { reply_markup: backKeyboard() },
    )
  })
}
