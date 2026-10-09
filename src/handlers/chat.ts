import type { Bot } from 'grammy'
import { t } from '../i18n/fa.js'
import { historyStore, upsertUser, userStore, getUser } from '../db/database.js'
import { askAssistant } from '../services/assistant.js'
import { downloadAsBase64, startTyping } from '../utils/telegram.js'
import { sendLong } from '../utils/text.js'
import { closeKeyboard, speakKeyboard } from '../keyboards/menus.js'
import { rememberReply } from './tts.js'
import { AiError } from '../ai/index.js'
import { webSearch, formatSearchForUser } from '../tools/search.js'
import { config } from '../config.js'

/** پاسخ به پیام متنی کاربر با هوش مصنوعی */
export function registerChatHandlers(bot: Bot): void {
  bot.command('search', async (ctx) => {
    const query = ctx.message?.text?.replace(/^\/search\s*/, '').trim() ?? ''
    if (!query) {
      await ctx.reply('🌐 لطفاً عبارت جستجو را بنویسید:\n`/search متن مورد نظر`')
      return
    }
    if (!config.enableWebSearch) {
      await ctx.reply('⚠️ جستجوی وب غیرفعال است.')
      return
    }
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.inc.search(ctx.from!.id)
    const status = await ctx.reply(t.searching)
    try {
      const outcome = await webSearch(query, 5)
      if (outcome.results.length === 0) {
        await ctx.api.editMessageText(ctx.chat!.id, status.message_id, t.noSearchResult)
        return
      }
      await ctx.api
        .editMessageText(ctx.chat!.id, status.message_id, formatSearchForUser(outcome), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        })
        .catch(async () => {
          await ctx.reply(formatSearchForUser(outcome), { parse_mode: 'HTML' })
        })
    } catch (err) {
      await ctx.api
        .editMessageText(ctx.chat!.id, status.message_id, t.error)
        .catch(() => {})
    }
  })

  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message!.text
    if (!text) return
    if (text.startsWith('/')) return next()

    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    if (user.is_banned) {
      await ctx.reply(t.banned)
      return
    }

    const stopTyping = startTyping(ctx.chat!.id)
    try {
      const result = await askAssistant({ userId: user.telegram_id, text })
      stopTyping()
      rememberReply(user.telegram_id, result.text)
      await sendLong((chunk) => ctx.reply(chunk, { reply_markup: speakKeyboard() }), result.text)
    } catch (err) {
      stopTyping()
      await handleAiError(ctx, err)
    }
  })

  bot.on('message:photo', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    if (user.is_banned) {
      await ctx.reply(t.banned)
      return
    }

    const photos = ctx.message!.photo
    const largest = photos[photos.length - 1]!
    const file = await downloadAsBase64(largest.file_id)
    if (!file) {
      await ctx.reply(t.error)
      return
    }

    const caption = ctx.message!.caption ?? ''
    const stopTyping = startTyping(ctx.chat!.id)
    try {
      const result = await askAssistant({
        userId: user.telegram_id,
        text: caption,
        images: [file],
      })
      stopTyping()
      await sendLong((chunk) => ctx.reply(chunk, { reply_markup: closeKeyboard() }), result.text)
    } catch (err) {
      stopTyping()
      await handleAiError(ctx, err)
    }
  })

  bot.on('message:voice', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    if (user.is_banned) {
      await ctx.reply(t.banned)
      return
    }

    const file = await downloadAsBase64(ctx.message!.voice.file_id)
    if (!file) {
      await ctx.reply(t.error)
      return
    }

    const stopTyping = startTyping(ctx.chat!.id)
    try {
      const result = await askAssistant({
        userId: user.telegram_id,
        text: '',
        audio: file,
      })
      stopTyping()
      await sendLong((chunk) => ctx.reply(chunk, { reply_markup: closeKeyboard() }), result.text)
    } catch (err) {
      stopTyping()
      await handleAiError(ctx, err)
    }
  })

  bot.on('message:video', async (ctx) => {
    const user = upsertUser(ctx.from!.id)
    const file = await downloadAsBase64(ctx.message!.video.file_id)
    if (!file) {
      await ctx.reply(t.error)
      return
    }
    await ctx.reply('🎬 پردازش ویدیو پشتیبانی نمی‌شود؛ لطفاً یک فریم را به‌صورت عکس بفرستید.')
  })

  bot.on('message:document', async (ctx) => {
    await ctx.reply(
      '📎 فایل دریافت شد. در این نسخه فقط متن، عکس و پیام صوتی پردازش می‌شود.\n' +
        'اگر سوالی دارید مستقیم بنویسید.',
    )
  })
}

async function handleAiError(ctx: { reply: (text: string) => Promise<unknown> }, err: unknown): Promise<void> {
  const isAi = err instanceof AiError
  console.error('AI error:', err instanceof Error ? err.message : err)
  const msg = isAi && err.message.includes('API_KEY') ? t.noAi : t.error
  await ctx.reply(msg).catch(() => {})
}
