/**
 * منوی سریع (کیبورد پایین صفحهٔ تایپ)
 *
 * کاربر دکمه می‌زند → ربات می‌پرسد چه می‌خواهد → کاربر متن می‌فرستد → کار انجام می‌شود
 * پس هیچ دستوری لازم نیست به خاطر بسپارند.
 */

import type { Bot } from 'grammy'
import { InputFile } from 'grammy'
import { t } from '../i18n/fa.js'
import { getUser, upsertUser, historyStore, memoryStore } from '../db/database.js'
import { startTyping, downloadAsBase64 } from '../utils/telegram.js'
import { sendLong } from '../utils/text.js'
import {
  backKeyboard,
  mainMenuKeyboard,
  mainReplyKeyboard,
  modelsKeyboard,
  quickAction,
  settingsKeyboard,
  speakKeyboard,
  voicesKeyboard,
  tonesKeyboard,
  voiceGenderKeyboard,
  toolsKeyboard,
} from '../keyboards/menus.js'
import { userModelInfo } from '../services/assistant.js'
import { humanize, translate, summarize, summarizeUrl, readImage } from '../ai/tools.js'
import { synthesize, styleLabel, voiceLabel } from '../ai/tts.js'
import { webSearch, formatSearchForUser } from '../tools/search.js'
import { config } from '../config.js'

/** کاری که کاربر انتخاب کرده و منتظر فرستادن متن است */
export type PendingAction =
  | 'humanize'
  | 'translate'
  | 'summarize'
  | 'bullets'
  | 'detailed'
  | 'link'
  | 'search'
  | 'tts'
  | 'ocr'

const pending = new Map<number, PendingAction>()

export function getPending(userId: number): PendingAction | undefined {
  return pending.get(userId)
}

export function clearPending(userId: number): void {
  pending.delete(userId)
}

/** پیام «چه کاری انجام بدهم؟» برای هر ابزار */
const ASK: Record<PendingAction, string> = {
  humanize: '✍️ **انسانی‌سازی متن**\n\nمتنت را بفرست تا روان و انسانی‌اش کنم.',
  translate: '🌐 **ترجمهٔ حرفه‌ای**\n\nمتنت را بفرست. اگر انگلیسی باشد فارسی می‌شود و برعکس.',
  summarize: '📝 **خلاصه‌سازی**\n\nمتن بلندت را بفرست تا خلاصهٔ کوتاهش را بدهم.',
  bullets: '📝 **نکات کلیدی**\n\nمتن بلندت را بفرست تا نکات مهمش را بیرون بکشم.',
  detailed: '📝 **خلاصهٔ کامل**\n\nمتن بلندت را بفرست تا خلاصهٔ ساختارمند بدهم.',
  link: '🔗 **خلاصه‌سازی لینک**\n\nآدرس صفحه را بفرست (مثل `https://example.com`).',
  search: '🌐 **جستجوی وب**\n\nسوال یا عبارت جستجو را بفرست.',
  tts: '🔊 **متن به صدا**\n\nمتنت را بفرست تا برات بخونم.',
  ocr: '📄 **خواندن متن از تصویر**\n\nعکس سند یا فاکتور را بفرست (به‌عنوان عکس، نه فایل).',
}

/** اجرای یک ابزار روی متن کاربر */
async function runAction(
  ctx: {
    chat: { id: number }
    from: { id: number }
    reply: (t: string, o?: object) => Promise<unknown>
    replyWithAudio: (a: InputFile, o?: object) => Promise<unknown>
  },
  action: PendingAction,
  text: string,
): Promise<void> {
  const userId = ctx.from.id
  const stop = startTyping(ctx.chat.id)

  try {
    if (action === 'tts') {
      await runTts(ctx, userId, text)
      return
    }

    if (action === 'search') {
      if (!config.enableWebSearch) {
        stop()
        await ctx.reply('⚠️ جستجوی وب غیرفعال است.')
        return
      }
      const status = await ctx.reply(t.searching)
      const outcome = await webSearch(text, 5)
      stop()
      if (outcome.results.length === 0) {
        await ctx.reply(t.noSearchResult)
        return
      }
      await sendLong((c) => ctx.reply(c, { parse_mode: 'HTML' }), formatSearchForUser(outcome))
      return
    }

    if (action === 'link') {
      const url = /(https?:\/\/[^\s]+)/.exec(text)?.[1]
      if (!url) {
        stop()
        await ctx.reply('⚠️ آدرس معتبر پیدا نشد. لینک را دوباره بفرست.')
        return
      }
      const status = await ctx.reply('⏳ در حال خواندن صفحه...')
      const { summary, title, words } = await summarizeUrl(url, 'short')
      stop()
      const head = `🔗 **${title ?? 'صفحهٔ وب'}**\n📊 ~${words} کلمه\n\n`
      await ctx.reply(head + summary, { reply_markup: speakKeyboard() })
      return
    }

    let out: string
    if (action === 'humanize') out = await humanize(text)
    else if (action === 'translate') out = await translate(text, /[a-zA-Z]/.test(text) ? 'fa' : 'en')
    else if (action === 'bullets') out = await summarize(text, 'bullets')
    else if (action === 'detailed') out = await summarize(text, 'detailed')
    else out = await summarize(text, 'short')

    stop()
    if (action === 'translate') {
      const header = /[a-zA-Z]/.test(text) ? '🇮🇷 ترجمهٔ فارسی:' : '🇬🇧 English translation:'
      await sendLong((c) => ctx.reply(`${header}\n\n${c}`), out)
    } else {
      await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
    }
  } catch (err) {
    stop()
    await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
  }
}

/** خواندن متن از تصویر (OCR) */
async function runOcr(
  bot: Bot,
  ctx: { chat: { id: number }; from: { id: number }; reply: (t: string, o?: object) => Promise<unknown> },
  fileId: string,
): Promise<void> {
  const stop = startTyping(ctx.chat.id)
  try {
    const img = await downloadAsBase64(fileId)
    if (!img) {
      stop()
      await ctx.reply('⚠️ دانلود تصویر ناموفق بود.')
      return
    }
    const out = await readImage([img], 'تمام متن موجود در این تصویر را استخراج کن.')
    stop()
    await sendLong((c) => ctx.reply(c, { reply_markup: speakKeyboard() }), out)
  } catch (err) {
    stop()
    await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
  }
  void bot
}

/** تولید و ارسال صدا برای متن داده‌شده */
async function runTts(
  ctx: { chat: { id: number }; from: { id: number }; reply: (t: string, o?: object) => Promise<unknown>; replyWithAudio: (a: InputFile, o?: object) => Promise<unknown> },
  userId: number,
  text: string,
): Promise<void> {
  const stop = startTyping(ctx.chat.id)
  try {
    const row = getUser(userId)
    const voice = row?.voice || 'Kore'
    const tone = row?.tone || 'normal'
    const { data } = await synthesize(text, voice, tone)
    stop()
    await ctx.reply('🔊 گوش کن:', { reply_markup: speakKeyboard() })
    await ctx.replyWithAudio(new InputFile(data, 'rahna.ogg'), {
      title: 'متن شما',
      performer: `${voiceLabel(voice)} · ${styleLabel(tone)}`,
    })
  } catch (err) {
    stop()
    await ctx.reply(`⚠️ ${(err as Error).message.slice(0, 200)}`)
  }
}

/** نمایش محتوای یک action به‌صورت پیام تازه */
async function showAction(
  ctx: { chat: { id: number }; from: { id: number; username?: string; first_name?: string }; reply: (t: string, o?: object) => Promise<unknown> },
  action: string,
): Promise<void> {
  const user = upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name)

  switch (action) {
    case 'nav:new':
      historyStore.clear(user.telegram_id)
      await ctx.reply('🧹 حافظهٔ گفتگو پاک شد. از صفر شروع می‌کنیم!', { reply_markup: mainReplyKeyboard() })
      break

    case 'nav:models':
      await ctx.reply(t.model.title, { reply_markup: modelsKeyboard(user.model || userModelInfo(user.telegram_id).id) })
      break

    case 'nav:settings':
      await ctx.reply(t.settings.title, { reply_markup: settingsKeyboard() })
      break

    case 'nav:stats':
      await ctx.reply('📊 برای دیدن آمار، دستور `/stats` را بفرست.', { reply_markup: backKeyboard() })
      break

    case 'nav:tts':
      await ctx.reply(
        [
          '🔊 **متن به صدا**',
          '',
          `🎙️ صوت فعلی: **${voiceLabel(user.voice || 'Kore')}**`,
          `🎚️ لحن فعلی: **${styleLabel(user.tone || 'normal')}**`,
          '',
          'متن خودت را بفرست تا برات بخونم.',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      pending.set(ctx.from.id, 'tts')
      break

    case 'nav:voices':
      await ctx.reply(
        [
          '🎙️ **انتخاب صوت**',
          '',
          `فعلی: **${voiceLabel(user.voice || 'Kore')}**`,
          '',
          'اول جنسیت صدا را انتخاب کن:',
        ].join('\n'),
        { reply_markup: voiceGenderKeyboard() },
      )
      break

    case 'nav:tones':
      await ctx.reply(t.settings.toneTitle, { reply_markup: tonesKeyboard(user.tone || 'normal') })
      break

    case 'nav:tools':
      await ctx.reply(t.tools.title, { reply_markup: toolsKeyboard() })
      break

    case 'nav:memory': {
      const all = memoryStore.all(user.telegram_id)
      await ctx.reply(
        all.length === 0
          ? t.tools.empty
          : [
              `🧠 **چیزهایی که دربارهٔ تو می‌دانم** (${all.length})`,
              '',
              ...all.slice(0, 25).map((m) => `• ${m.content}`),
              '',
              '`/memory clear` — پاک کردن همه',
            ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      break
    }

    case 'nav:help':
      await ctx.reply(t.help, { reply_markup: mainReplyKeyboard() })
      break

    case 'nav:about':
      await ctx.reply(t.about, { reply_markup: backKeyboard() })
      break

    default: {
      if (!action.startsWith('tool:')) {
        await ctx.reply(t.menu.main, { reply_markup: mainMenuKeyboard() })
        return
      }
      const which = action.slice(5)
      const map: Record<string, PendingAction> = {
        humanize: 'humanize',
        translate: 'translate',
        summarize: 'summarize',
        link: 'link',
        search: 'search',
        tts: 'tts',
        ocr: 'ocr',
      }
      const p = map[which]
      if (!p) {
        await ctx.reply(t.tools.title, { reply_markup: toolsKeyboard() })
        return
      }
      pending.set(ctx.from.id, p)
      await ctx.reply(ASK[p])
    }
  }
}

export function registerQuickHandlers(bot: Bot): void {
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message!.text
    if (!text) return next()
    if (text.startsWith('/')) return next()

    const userId = ctx.from!.id
    const user = upsertUser(userId, ctx.from!.username, ctx.from!.first_name)
    if (user.is_banned) {
      await ctx.reply(t.banned)
      return
    }

    // ۱) اگر کار معلقی هست، این متن ورودی آن است
    const p = pending.get(userId)
    if (p) {
      pending.delete(userId)
      if (p === 'ocr') {
        await ctx.reply('📄 برای خواندن سند، **عکس** را بفرست (نه متن). دوباره دکمهٔ 📄 خواندن سند را بزن.')
        return
      }
      await runAction(ctx, p, text.trim())
      return
    }

    // ۲) اگر متن یکی از دکمه‌های منوی سریع است
    const action = quickAction(text)
    if (action) {
      await showAction(ctx, action)
      return
    }

    // ۳) در غیر این صورت، پیام عادی است → به هندلر چت برود
    return next()
  })

  // عکس فرستاده شد و کاربر OCR را انتخاب کرده بود
  bot.on('message:photo', async (ctx, next) => {
    const userId = ctx.from!.id
    if (pending.get(userId) !== 'ocr') return next()
    pending.delete(userId)
    const photos = ctx.message!.photo
    const fileId = photos[photos.length - 1]!.file_id
    await runOcr(bot, ctx, fileId)
  })
}

export { pending }
